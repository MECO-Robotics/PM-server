import type { CadAssemblyNode, CadMappingTargetKind, CadPartDefinition, CadPartInstance, CadSnapshotMapping } from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";
import { getMechanisms } from "../data/store";
import { buildCadPartMatchProposals, type CadPartMatchProposal } from "./cadPartMatchingService";

export interface CadHierarchyIssue {
  code: string;
  severity: "BLOCKING" | "WARNING";
  sourceKind: "ASSEMBLY_NODE" | "PART_DEFINITION" | "PART_INSTANCE";
  sourceId: string;
  message: string;
}

function isConfirmed(mapping: CadSnapshotMapping | undefined, kind: CadMappingTargetKind) {
  return mapping?.targetKind === kind && mapping.status === "CONFIRMED";
}

function isConfirmedAny(mapping: CadSnapshotMapping | undefined, kinds: CadMappingTargetKind[]) {
  return Boolean(mapping && mapping.status === "CONFIRMED" && kinds.includes(mapping.targetKind));
}

function hasConfirmedAncestor(args: {
  node: CadAssemblyNode;
  kind: CadMappingTargetKind;
  assembliesById: Map<string, CadAssemblyNode>;
  mappingsBySourceId: Map<string, CadSnapshotMapping>;
}) {
  let parentId = args.node.parentAssemblyNodeId;
  while (parentId) {
    const parent = args.assembliesById.get(parentId);
    if (!parent) {
      return false;
    }
    if (isConfirmed(args.mappingsBySourceId.get(parent.id), args.kind)) {
      return true;
    }
    parentId = parent.parentAssemblyNodeId;
  }
  return false;
}

function hasConfirmedSelfOrAncestor(args: {
  node: CadAssemblyNode;
  kind: CadMappingTargetKind;
  assembliesById: Map<string, CadAssemblyNode>;
  mappingsBySourceId: Map<string, CadSnapshotMapping>;
}) {
  if (isConfirmed(args.mappingsBySourceId.get(args.node.id), args.kind)) {
    return true;
  }
  return hasConfirmedAncestor(args);
}

function addIssue(issues: CadHierarchyIssue[], issue: CadHierarchyIssue) {
  if (!issues.some((candidate) => candidate.code === issue.code && candidate.sourceId === issue.sourceId)) {
    issues.push(issue);
  }
}

export function collectHierarchyIssues(args: {
  assemblies: CadAssemblyNode[];
  instances: CadPartInstance[];
  mappingsBySourceId: Map<string, CadSnapshotMapping>;
  proposals: CadPartMatchProposal[];
  definitionsById: Map<string, CadPartDefinition>;
}) {
  const issues: CadHierarchyIssue[] = [];
  const assembliesById = new Map(args.assemblies.map((assembly) => [assembly.id, assembly] as const));
  const mechanismIds = new Set(getMechanisms().map((mechanism) => mechanism.id));
  const unmatchedNames = new Map<string, CadPartMatchProposal[]>();
  for (const assembly of args.assemblies) {
    const mapping = args.mappingsBySourceId.get(assembly.id);
    if (
      assembly.parentAssemblyNodeId &&
      assembly.depth === 1 &&
      !isConfirmedAny(mapping, ["SUBSYSTEM", "REFERENCE_GEOMETRY", "IGNORE"])
    ) {
      addIssue(issues, {
        code: "cad_unresolved_subsystem_layer",
        severity: "BLOCKING",
        sourceKind: "ASSEMBLY_NODE",
        sourceId: assembly.sourceId,
        message: `${assembly.name} needs a subsystem or ignore decision.`,
      });
    }
    if (
      assembly.depth > 1 &&
      !isConfirmedAny(mapping, ["SUBSYSTEM", "MECHANISM", "COMPONENT_ASSEMBLY", "REFERENCE_GEOMETRY", "IGNORE"])
    ) {
      addIssue(issues, {
        code: "cad_unresolved_mechanism_layer",
        severity: "BLOCKING",
        sourceKind: "ASSEMBLY_NODE",
        sourceId: assembly.sourceId,
        message: `${assembly.name} needs a mechanism, component assembly, or ignore decision.`,
      });
    }
    const componentHasParentMechanism =
      isConfirmed(mapping, "COMPONENT_ASSEMBLY") &&
      (
        hasConfirmedAncestor({
          node: assembly,
          kind: "MECHANISM",
          assembliesById,
          mappingsBySourceId: args.mappingsBySourceId,
        }) ||
        Boolean(mapping?.targetId && mechanismIds.has(mapping.targetId))
      );
    if (isConfirmed(mapping, "COMPONENT_ASSEMBLY") && !componentHasParentMechanism) {
      addIssue(issues, {
        code: "cad_component_assembly_missing_parent",
        severity: "BLOCKING",
        sourceKind: "ASSEMBLY_NODE",
        sourceId: assembly.sourceId,
        message: `${assembly.name} is a component assembly but has no mapped parent mechanism.`,
      });
    }
  }
  for (const proposal of args.proposals) {
    const mapping = args.mappingsBySourceId.get(proposal.cadPartDefinitionId);
    if (!isConfirmed(mapping, "PART_DEFINITION") && !isConfirmed(mapping, "IGNORE") && proposal.status !== "EXACT") {
      addIssue(issues, {
        code: proposal.status === "AMBIGUOUS" ? "cad_part_match_ambiguous" : "cad_part_match_missing",
        severity: "BLOCKING",
        sourceKind: "PART_DEFINITION",
        sourceId: proposal.cadPartDefinitionId,
        message: `${proposal.cadPartName} needs a part definition match decision.`,
      });
    }
    if (proposal.status === "NO_MATCH") {
      const key = proposal.cadPartName.trim().toLowerCase();
      unmatchedNames.set(key, [...(unmatchedNames.get(key) ?? []), proposal]);
    }
  }
  for (const duplicates of unmatchedNames.values()) {
    if (duplicates.length < 2) {
      continue;
    }
    for (const proposal of duplicates) {
      addIssue(issues, {
        code: "cad_duplicate_part_definition_candidate",
        severity: "WARNING",
        sourceKind: "PART_DEFINITION",
        sourceId: proposal.cadPartDefinitionId,
        message: `${proposal.cadPartName} appears more than once without an existing part definition match.`,
      });
    }
  }
  const outsideHierarchyIssueKeys = new Set<string>();
  for (const instance of args.instances) {
    const parent = instance.parentAssemblyNodeId ? assembliesById.get(instance.parentAssemblyNodeId) : null;
    if (parent && !hasConfirmedSelfOrAncestor({ node: parent, kind: "SUBSYSTEM", assembliesById, mappingsBySourceId: args.mappingsBySourceId })) {
      const issueKey = `${parent.id}:${instance.partDefinitionId ?? instance.sourceId}`;
      if (outsideHierarchyIssueKeys.has(issueKey)) {
        continue;
      }
      outsideHierarchyIssueKeys.add(issueKey);
      addIssue(issues, {
        code: "cad_part_outside_mapped_hierarchy",
        severity: "BLOCKING",
        sourceKind: "PART_INSTANCE",
        sourceId: instance.id,
        message: `${args.definitionsById.get(instance.partDefinitionId ?? "")?.name ?? instance.instancePath} is outside a mapped subsystem hierarchy.`,
      });
    }
  }
  return issues;
}

export async function validateCadHierarchyForFinalize(args: { store: CadStore; snapshotId: string }) {
  const [assemblies, cadParts, instances, mappings, proposals] = await Promise.all([
    args.store.listAssemblyNodes(args.snapshotId),
    args.store.listPartDefinitions(args.snapshotId),
    args.store.listPartInstances(args.snapshotId),
    args.store.listSnapshotMappings(args.snapshotId),
    buildCadPartMatchProposals(args),
  ]);
  return collectHierarchyIssues({
    assemblies,
    instances,
    mappingsBySourceId: new Map(mappings.map((mapping) => [mapping.sourceId, mapping] as const)),
    proposals: proposals.items,
    definitionsById: new Map(cadParts.map((part) => [part.id, part] as const)),
  });
}
