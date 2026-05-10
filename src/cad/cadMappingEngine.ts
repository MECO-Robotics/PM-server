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

type CadSourceRecord =
  | { kind: "ASSEMBLY_NODE"; item: CadAssemblyNode; parentName: string | null }
  | { kind: "PART_DEFINITION"; item: CadPartDefinition; parentName: null }
  | { kind: "PART_INSTANCE"; item: CadPartInstance; parentName: string | null };

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
    return source.item.stableSignature;
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
  return [
    ...args.assemblyNodes.map((item): CadSourceRecord => ({
      kind: "ASSEMBLY_NODE",
      item,
      parentName: item.parentAssemblyNodeId ? assembliesById.get(item.parentAssemblyNodeId)?.name ?? null : null,
    })),
    ...args.partDefinitions.map((item): CadSourceRecord => ({ kind: "PART_DEFINITION", item, parentName: null })),
    ...args.partInstances.map((item): CadSourceRecord => ({
      kind: "PART_INSTANCE",
      item,
      parentName: item.parentAssemblyNodeId ? assembliesById.get(item.parentAssemblyNodeId)?.name ?? null : null,
    })),
  ];
}

function unresolvedWarningCode(sourceKind: CadMappingSourceKind) {
  return sourceKind === "ASSEMBLY_NODE" ? "step_unmapped_assembly" : "step_unmapped_part";
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
    .filter((rule) => matchValueForRule(source, rule) === rule.matchValue)
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
        targetKind: "UNMAPPED",
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
    return { kind: "ASSEMBLY_NODE", item, parentName } satisfies CadSourceRecord;
  }
  if (args.mapping.sourceKind === "PART_DEFINITION") {
    const item = args.partDefinitions.find((part) => part.id === args.mapping.sourceId);
    return item ? ({ kind: "PART_DEFINITION", item, parentName: null } satisfies CadSourceRecord) : null;
  }
  const item = args.partInstances.find((instance) => instance.id === args.mapping.sourceId);
  if (!item) {
    return null;
  }
  const parentName = item.parentAssemblyNodeId
    ? args.assemblyNodes.find((node) => node.id === item.parentAssemblyNodeId)?.name ?? null
    : null;
  return { kind: "PART_INSTANCE", item, parentName } satisfies CadSourceRecord;
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
    if (rule.matchValue === args.source.item.stableSignature && rule.id !== args.newRuleId) {
      await args.store.updateMappingRule(rule.id, {
        active: false,
        supersededByRuleId: args.newRuleId,
      });
    }
  }
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
    const mapping = update.mappingId
      ? existingMappings.find((item) => item.id === update.mappingId)
      : existingMappings.find((item) => item.sourceKind === update.sourceKind && item.sourceId === update.sourceId);
    if (!mapping) {
      continue;
    }

    let mappingRuleId = mapping.mappingRuleId;
    const source = sourceRecordForMapping({ mapping, assemblyNodes, partDefinitions, partInstances });
    if (update.applyToFuture && source && args.snapshot.projectId) {
      const rule = await args.store.createMappingRule({
        projectId: args.snapshot.projectId,
        seasonId: args.snapshot.seasonId,
        sourceKind: mapping.sourceKind,
        matchStrategy: "STABLE_SIGNATURE",
        matchValue: source.item.stableSignature,
        targetKind: update.targetKind,
        targetId: update.targetId ?? null,
        confidence: "MANUAL",
        createdFromSnapshotId: args.snapshot.id,
        createdBy: update.reviewedBy ?? args.reviewedBy ?? null,
        notes: update.notes ?? null,
      });
      await supersedeMatchingRules({ store: args.store, snapshot: args.snapshot, source, newRuleId: rule.id });
      mappingRuleId = rule.id;
      mappingRules.push(rule);
    }

    updated.push(
      await args.store.updateSnapshotMapping(mapping.id, {
        mappingRuleId,
        targetKind: update.targetKind,
        targetId: update.targetId ?? null,
        confidence: update.confidence ?? (update.applyToFuture ? "MANUAL" : mapping.confidence),
        status: update.status ?? "CONFIRMED",
        reviewedBy: update.reviewedBy ?? args.reviewedBy ?? null,
        reviewedAt: new Date().toISOString(),
      }),
    );
  }

  return {
    updated: updated.filter((item): item is NonNullable<typeof item> => Boolean(item)),
    mappingRules,
  };
}
