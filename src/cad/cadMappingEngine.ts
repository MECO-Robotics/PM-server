import type {
  CadAssemblyNode,
  CadMappingRule,
  CadMappingSourceKind,
  CadMappingTargetKind,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
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

export { applyMappingUpdates } from "./cadMappingUpdateEngine";
export type { MappingUpdateInput } from "./cadMappingUpdateEngine";
