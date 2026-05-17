import type {
  CadAssemblyNode,
  CadMappingConfidence,
  CadMappingRule,
  CadMappingSourceKind,
  CadMappingTargetKind,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  CadSnapshotMappingStatus,
} from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";
import { partInstanceRuleSignature } from "./cadInstanceGrouping";

type CadSourceRecord =
  | { kind: "ASSEMBLY_NODE"; item: CadAssemblyNode; parentName: string | null; stableSignatures: string[] }
  | { kind: "PART_DEFINITION"; item: CadPartDefinition; parentName: null; stableSignatures: string[] }
  | { kind: "PART_INSTANCE"; item: CadPartInstance; parentName: string | null; stableSignatures: string[] };

export interface MappingUpdateInput {
  mappingId?: string;
  sourceKind?: CadMappingSourceKind;
  sourceId?: string;
  sourceIds?: string[];
  targetKind: CadMappingTargetKind;
  targetId?: string | null;
  confidence?: CadMappingConfidence;
  status?: CadSnapshotMappingStatus;
  applyToFuture?: boolean;
  reviewedBy?: string | null;
  notes?: string | null;
}

function sourceRecordForMapping(args: {
  mapping: { sourceKind: CadMappingSourceKind; sourceId: string };
  assemblyNodes: CadAssemblyNode[];
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
}) {
  if (args.mapping.sourceKind === "ASSEMBLY_NODE") {
    const item = args.assemblyNodes.find((node) => node.id === args.mapping.sourceId);
    if (!item) {
      return null;
    }
    const parentName = item.parentAssemblyNodeId
      ? args.assemblyNodes.find((node) => node.id === item.parentAssemblyNodeId)?.name ?? null
      : null;
    return { kind: "ASSEMBLY_NODE", item, parentName, stableSignatures: [item.stableSignature] } satisfies CadSourceRecord;
  }
  if (args.mapping.sourceKind === "PART_DEFINITION") {
    const item = args.partDefinitions.find((part) => part.id === args.mapping.sourceId);
    return item ? ({ kind: "PART_DEFINITION", item, parentName: null, stableSignatures: [item.stableSignature] } satisfies CadSourceRecord) : null;
  }
  const item = args.partInstances.find((instance) => instance.id === args.mapping.sourceId);
  if (!item) {
    return null;
  }
  const parentName = item.parentAssemblyNodeId
    ? args.assemblyNodes.find((node) => node.id === item.parentAssemblyNodeId)?.name ?? null
    : null;
  const definitionsById = new Map(args.partDefinitions.map((part) => [part.id, part] as const));
  return {
    kind: "PART_INSTANCE",
    item,
    parentName,
    stableSignatures: Array.from(new Set([partInstanceRuleSignature(item, definitionsById), item.stableSignature])),
  } satisfies CadSourceRecord;
}

async function supersedeMatchingRules(args: {
  store: CadStore;
  snapshot: CadSnapshot;
  source: CadSourceRecord;
  newRuleId: string;
}) {
  if (!args.snapshot.projectId) {
    return;
  }
  const existingRules = await args.store.listMappingRules({
    projectId: args.snapshot.projectId,
    seasonId: args.snapshot.seasonId,
    active: true,
  });
  for (const rule of existingRules) {
    if (rule.sourceKind !== args.source.kind || rule.matchStrategy !== "STABLE_SIGNATURE") {
      continue;
    }
    if (args.source.stableSignatures.includes(rule.matchValue) && rule.id !== args.newRuleId) {
      await args.store.updateMappingRule(rule.id, {
        active: false,
        supersededByRuleId: args.newRuleId,
      });
    }
  }
}

function mappingSourceKey(mapping: { sourceKind: CadMappingSourceKind; sourceId: string }) {
  return `${mapping.sourceKind}:${mapping.sourceId}`;
}

function futureRuleKey(source: CadSourceRecord, matchValue: string) {
  return `${source.kind}:STABLE_SIGNATURE:${matchValue}`;
}

async function syncSnapshotLifecycleAfterMappingUpdates(store: CadStore, snapshot: CadSnapshot) {
  if (snapshot.status === "finalized") {
    return {
      snapshot,
      importRun: await store.findImportRun(snapshot.importRunId),
    };
  }

  const mappings = await store.listSnapshotMappings(snapshot.id);
  const hasUnresolvedMappings = mappings.some((mapping) => mapping.status === "NEEDS_REVIEW");
  const snapshotStatus = hasUnresolvedMappings ? "mapping_review" : "mapped";
  const importRunStatus = hasUnresolvedMappings ? "MAPPING_REVIEW" : "MAPPED";
  const updatedSnapshot =
    snapshot.status === snapshotStatus
      ? snapshot
      : (await store.updateSnapshot(snapshot.id, { status: snapshotStatus })) ?? snapshot;
  const importRun = await store.findImportRun(snapshot.importRunId);
  const updatedImportRun =
    importRun && importRun.status !== importRunStatus
      ? (await store.updateImportRun(importRun.id, { status: importRunStatus })) ?? importRun
      : importRun;

  return {
    snapshot: updatedSnapshot,
    importRun: updatedImportRun,
  };
}

export async function applyMappingUpdates(args: {
  store: CadStore;
  snapshot: CadSnapshot;
  updates: MappingUpdateInput[];
  reviewedBy?: string | null;
}) {
  const assemblyNodes = await args.store.listAssemblyNodes(args.snapshot.id);
  const partDefinitions = await args.store.listPartDefinitions(args.snapshot.id);
  const partInstances = await args.store.listPartInstances(args.snapshot.id);
  const existingMappings = await args.store.listSnapshotMappings(args.snapshot.id);
  const updated = [];
  const mappingRules: CadMappingRule[] = [];

  for (const update of args.updates) {
    const mappings = update.mappingId
      ? existingMappings.filter((item) => item.id === update.mappingId)
      : update.sourceIds?.length
        ? existingMappings.filter(
            (item) => item.sourceKind === update.sourceKind && update.sourceIds?.includes(item.sourceId),
          )
        : existingMappings.filter((item) => item.sourceKind === update.sourceKind && item.sourceId === update.sourceId);
    if (mappings.length === 0) {
      continue;
    }

    const sourceRecordsForUpdate = mappings
      .map((mapping) => sourceRecordForMapping({ mapping, assemblyNodes, partDefinitions, partInstances }))
      .filter((source): source is CadSourceRecord => Boolean(source));
    const futureRuleIdByMappingKey = new Map<string, string>();
    const futureRuleByRuleKey = new Map<string, CadMappingRule>();
    if (update.applyToFuture && args.snapshot.projectId) {
      for (const source of sourceRecordsForUpdate) {
        const matchValue = source.stableSignatures[0] ?? source.item.stableSignature;
        const ruleKey = futureRuleKey(source, matchValue);
        let rule = futureRuleByRuleKey.get(ruleKey);
        if (!rule) {
          rule = await args.store.createMappingRule({
            projectId: args.snapshot.projectId,
            seasonId: args.snapshot.seasonId,
            sourceKind: source.kind,
            matchStrategy: "STABLE_SIGNATURE",
            matchValue,
            targetKind: update.targetKind,
            targetId: update.targetId ?? null,
            confidence: "MANUAL",
            createdFromSnapshotId: args.snapshot.id,
            createdBy: update.reviewedBy ?? args.reviewedBy ?? null,
            notes: update.notes ?? null,
          });
          futureRuleByRuleKey.set(ruleKey, rule);
          mappingRules.push(rule);
        }
        await supersedeMatchingRules({ store: args.store, snapshot: args.snapshot, source, newRuleId: rule.id });
        futureRuleIdByMappingKey.set(mappingSourceKey({ sourceKind: source.kind, sourceId: source.item.id }), rule.id);
      }
    }

    for (const mapping of mappings) {
      updated.push(
        await args.store.updateSnapshotMapping(mapping.id, {
          mappingRuleId: futureRuleIdByMappingKey.get(mappingSourceKey(mapping)) ?? mapping.mappingRuleId,
          targetKind: update.targetKind,
          targetId: update.targetId ?? null,
          confidence: update.confidence ?? (update.applyToFuture ? "MANUAL" : mapping.confidence),
          status: update.status ?? "CONFIRMED",
          reviewedBy: update.reviewedBy ?? args.reviewedBy ?? null,
          reviewedAt: new Date().toISOString(),
        }),
      );
    }
  }

  return {
    updated: updated.filter((item): item is NonNullable<typeof item> => Boolean(item)),
    mappingRules,
    lifecycle: await syncSnapshotLifecycleAfterMappingUpdates(args.store, args.snapshot),
  };
}
