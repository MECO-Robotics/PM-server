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
import { normalizeCadName, sourceNameWithParent } from "./cadUtils";
import { partInstanceRuleSignature } from "./cadInstanceGrouping";

type CadSourceRecord =
  | { kind: "ASSEMBLY_NODE"; item: CadAssemblyNode; parentName: string | null; stableSignatures: string[] }
  | { kind: "PART_DEFINITION"; item: CadPartDefinition; parentName: null; stableSignatures: string[] }
  | { kind: "PART_INSTANCE"; item: CadPartInstance; parentName: string | null; stableSignatures: string[] };

const strategyPriority = new Map([
  ["STABLE_SIGNATURE", 1],
  ["INSTANCE_PATH", 2],
  ["NORMALIZED_NAME_WITH_PARENT", 3],
  ["NORMALIZED_NAME", 4],
  ["MANUAL_ONLY", 5],
]);

async function activeRulesForSnapshot(store: CadStore, snapshot: CadSnapshot) {
  if (!snapshot.projectId) {
    return [];
  }
  return store.listMappingRules({
    projectId: snapshot.projectId,
    seasonId: snapshot.seasonId,
    active: true,
  });
}

function itemName(source: CadSourceRecord) {
  if (source.kind === "PART_INSTANCE") {
    return source.item.instancePath.split("/").filter(Boolean).at(-1) ?? source.item.sourceId;
  }
  return source.item.name;
}

function matchValueForRule(source: CadSourceRecord, rule: CadMappingRule) {
  if (rule.matchStrategy === "STABLE_SIGNATURE") {
    return source.stableSignatures;
  }
  if (rule.matchStrategy === "INSTANCE_PATH") {
    return "instancePath" in source.item ? source.item.instancePath : null;
  }
  if (rule.matchStrategy === "NORMALIZED_NAME_WITH_PARENT") {
    return sourceNameWithParent(itemName(source), source.parentName);
  }
  if (rule.matchStrategy === "NORMALIZED_NAME") {
    return normalizeCadName(itemName(source));
  }
  return null;
}

function sourceRecords(args: {
  assemblyNodes: CadAssemblyNode[];
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
}) {
  const assembliesById = new Map(args.assemblyNodes.map((node) => [node.id, node] as const));
  const definitionsById = new Map(args.partDefinitions.map((part) => [part.id, part] as const));
  return [
    ...args.assemblyNodes.map((item): CadSourceRecord => ({
      kind: "ASSEMBLY_NODE",
      item,
      parentName: item.parentAssemblyNodeId ? assembliesById.get(item.parentAssemblyNodeId)?.name ?? null : null,
      stableSignatures: [item.stableSignature],
    })),
    ...args.partDefinitions.map((item): CadSourceRecord => ({
      kind: "PART_DEFINITION",
      item,
      parentName: null,
      stableSignatures: [item.stableSignature],
    })),
    ...args.partInstances.map((item): CadSourceRecord => ({
      kind: "PART_INSTANCE",
      item,
      parentName: item.parentAssemblyNodeId ? assembliesById.get(item.parentAssemblyNodeId)?.name ?? null : null,
      stableSignatures: Array.from(new Set([partInstanceRuleSignature(item, definitionsById), item.stableSignature])),
    })),
  ];
}

function unresolvedWarningCode(sourceKind: CadMappingSourceKind) {
  return sourceKind === "ASSEMBLY_NODE" ? "step_unmapped_assembly" : "step_unmapped_part";
}

function suggestedTargetKind(source: CadSourceRecord): CadMappingTargetKind {
  if (source.kind === "ASSEMBLY_NODE") {
    if (source.item.inferredType === "SUBSYSTEM_CANDIDATE") {
      return "SUBSYSTEM";
    }
    if (source.item.inferredType === "MECHANISM_CANDIDATE") {
      return "MECHANISM";
    }
    if (source.item.inferredType === "COMPONENT_ASSEMBLY_CANDIDATE") {
      return "COMPONENT_ASSEMBLY";
    }
    return "UNMAPPED";
  }
  if (source.kind === "PART_DEFINITION") {
    return "PART_DEFINITION";
  }
  return "PART_INSTANCE";
}

async function addMappingWarning(args: {
  store: CadStore;
  snapshot: CadSnapshot;
  importRunId: string;
  source: CadSourceRecord;
  code: string;
  title: string;
  message: string;
}) {
  await args.store.appendWarning({
    importRunId: args.importRunId,
    snapshotId: args.snapshot.id,
    severity: "WARNING",
    code: args.code,
    title: args.title,
    message: args.message,
    sourceKind: args.source.kind,
    sourceId: args.source.item.id,
    metadataJson: {
      sourceStableSignature: args.source.item.stableSignature,
      sourceName: itemName(args.source),
    },
  });
}

function findMatches(source: CadSourceRecord, rules: CadMappingRule[]) {
  return rules
    .filter((rule) => rule.sourceKind === source.kind)
    .filter((rule) => {
      const matchValue = matchValueForRule(source, rule);
      return Array.isArray(matchValue) ? matchValue.includes(rule.matchValue) : matchValue === rule.matchValue;
    })
    .sort(
      (left, right) =>
        (strategyPriority.get(left.matchStrategy) ?? 99) - (strategyPriority.get(right.matchStrategy) ?? 99),
    );
}

export async function applyMappingRules(args: {
  store: CadStore;
  snapshot: CadSnapshot;
  importRunId: string;
  assemblyNodes: CadAssemblyNode[];
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
}) {
  const rules = await activeRulesForSnapshot(args.store, args.snapshot);
  const mappings = [];

  for (const source of sourceRecords(args)) {
    const matches = findMatches(source, rules);
    if (matches.length === 1) {
      const rule = matches[0]!;
      mappings.push(
        await args.store.upsertSnapshotMapping({
          snapshotId: args.snapshot.id,
          mappingRuleId: rule.id,
          sourceKind: source.kind,
          sourceId: source.item.id,
          targetKind: rule.targetKind,
          targetId: rule.targetId,
          confidence: rule.confidence,
          status: "PROPOSED",
          reviewedBy: null,
          reviewedAt: null,
        }),
      );
      if (rule.confidence === "LOW") {
        await addMappingWarning({
          store: args.store,
          snapshot: args.snapshot,
          importRunId: args.importRunId,
          source,
          code: "step_low_confidence_mapping",
          title: "Low-confidence mapping proposal",
          message: `${itemName(source)} matched a low-confidence carry-forward rule and needs review.`,
        });
      }
      continue;
    }

    mappings.push(
      await args.store.upsertSnapshotMapping({
        snapshotId: args.snapshot.id,
        mappingRuleId: null,
        sourceKind: source.kind,
        sourceId: source.item.id,
        targetKind: matches.length > 1 ? "UNMAPPED" : suggestedTargetKind(source),
        targetId: null,
        confidence: "LOW",
        status: "NEEDS_REVIEW",
        reviewedBy: null,
        reviewedAt: null,
      }),
    );

    if (matches.length > 1) {
      await addMappingWarning({
        store: args.store,
        snapshot: args.snapshot,
        importRunId: args.importRunId,
        source,
        code: "step_mapping_conflict",
        title: "Mapping rules conflict",
        message: `${itemName(source)} matched multiple active mapping rules and must be reviewed manually.`,
      });
    } else {
      await addMappingWarning({
        store: args.store,
        snapshot: args.snapshot,
        importRunId: args.importRunId,
        source,
        code: unresolvedWarningCode(source.kind),
        title: source.kind === "ASSEMBLY_NODE" ? "Assembly is unmapped" : "Part is unmapped",
        message: `${itemName(source)} needs a Mission Control mapping decision.`,
      });
    }
  }

  return mappings;
}

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
  const mappingRules = [];

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
    let mappingRuleId = mappings[0]?.mappingRuleId ?? null;
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
          mappingRuleId: futureRuleIdByMappingKey.get(mappingSourceKey(mapping)) ?? mappingRuleId,
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
  };
}
