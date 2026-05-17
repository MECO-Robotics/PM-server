import type { CadPartDefinition, CadPartInstance, CadSnapshotMapping } from "./cadTypes";
import { groupPartInstances } from "./cadInstanceGrouping";
import type { CadPartMatchProposal } from "./cadPartMatchingService";

function partTarget(args: {
  cadPart: CadPartDefinition | null;
  mappingsBySourceId: Map<string, CadSnapshotMapping>;
  proposalsByCadPartId: Map<string, CadPartMatchProposal>;
}) {
  if (!args.cadPart) {
    return null;
  }
  const mapping = args.mappingsBySourceId.get(args.cadPart.id);
  if (mapping?.targetKind === "PART_DEFINITION" && mapping.targetId && mapping.status === "CONFIRMED") {
    return mapping.targetId;
  }
  const proposal = args.proposalsByCadPartId.get(args.cadPart.id);
  return proposal?.status === "EXACT" ? proposal.recommendedPartDefinitionId : null;
}

function proposalStatus(
  cadPart: CadPartDefinition | null,
  proposalsByCadPartId: Map<string, CadPartMatchProposal>,
) {
  return cadPart ? proposalsByCadPartId.get(cadPart.id)?.status ?? "NO_MATCH" : "NO_MATCH";
}

export function buildHierarchyPartSummary(args: {
  instances: CadPartInstance[];
  definitionsById: Map<string, CadPartDefinition>;
  mappingsBySourceId: Map<string, CadSnapshotMapping>;
  proposalsByCadPartId: Map<string, CadPartMatchProposal>;
}) {
  const groups = groupPartInstances({
    instances: args.instances,
    definitionsById: args.definitionsById,
    mappingsBySourceId: args.mappingsBySourceId,
  }).map((group) => ({
    name: group.displayName,
    quantity: group.quantity,
    cadPartDefinitionId: group.partDefinitionId,
    cadPartDefinitionSourceId: group.partDefinition?.sourceId ?? null,
    instanceIds: group.instanceIds,
    resolvedPartDefinitionId: partTarget({
      cadPart: group.partDefinition,
      mappingsBySourceId: args.mappingsBySourceId,
      proposalsByCadPartId: args.proposalsByCadPartId,
    }),
    matchStatus: proposalStatus(group.partDefinition, args.proposalsByCadPartId),
    status: group.hasMixedMappings ? "NEEDS_REVIEW" : group.mapping?.status ?? "NEEDS_REVIEW",
  }));
  const totalQuantity = groups.reduce((total, group) => total + group.quantity, 0);
  return {
    rawInstanceCount: totalQuantity,
    groupedPartCount: groups.length,
    matchedExistingDefinitionCount: groups.filter((group) => Boolean(group.resolvedPartDefinitionId)).length,
    proposedNewDefinitionCount: groups.filter((group) => group.matchStatus === "NO_MATCH").length,
    ambiguousMatchCount: groups.filter((group) => group.matchStatus === "AMBIGUOUS" || group.matchStatus === "SUGGESTED").length,
    unresolvedCount: groups.filter((group) => !group.resolvedPartDefinitionId && group.status !== "CONFIRMED").length,
    totalQuantity,
    groups,
  };
}
