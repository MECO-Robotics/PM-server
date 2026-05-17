import { applyMappingUpdates } from "./cadMappingEngine";
import type { CadMappingConfidence, CadMappingTargetKind, CadSnapshotMappingStatus } from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";

export interface CadHierarchyApplyInput {
  reviewedBy?: string | null;
  decisions?: Array<{
    nodeId: string;
    sourceId?: string;
    sourceKind?: "ASSEMBLY_NODE" | "PART_DEFINITION" | "PART_INSTANCE";
    targetKind: CadMappingTargetKind;
    targetId?: string | null;
    parentSubsystemId?: string | null;
    parentMechanismId?: string | null;
    status?: "CONFIRMED" | "REJECTED" | "NEEDS_REVIEW";
    applyToFuture?: boolean;
    notes?: string | null;
  }>;
  assemblyDecisions?: Array<{
    sourceId: string;
    targetKind: CadMappingTargetKind;
    targetId?: string | null;
    parentSubsystemId?: string | null;
    parentMechanismId?: string | null;
    confidence?: CadMappingConfidence;
    status?: CadSnapshotMappingStatus;
    applyToFuture?: boolean;
    notes?: string | null;
  }>;
  partMatchConfirmations?: Array<{
    cadPartDefinitionSourceId: string;
    targetPartDefinitionId: string | null;
    status?: "CONFIRMED" | "REJECTED" | "NEEDS_REVIEW";
    applyToFuture?: boolean;
    notes?: string | null;
  }>;
}

export async function applyHierarchyReviewDecisions(args: {
  store: CadStore;
  snapshotId: string;
  input: CadHierarchyApplyInput;
}) {
  const snapshot = await args.store.findSnapshot(args.snapshotId);
  if (!snapshot) {
    return null;
  }
  const [assemblies, cadParts] = await Promise.all([
    args.store.listAssemblyNodes(snapshot.id),
    args.store.listPartDefinitions(snapshot.id),
  ]);
  const partInstances = await args.store.listPartInstances(snapshot.id);
  const assemblyByCadSourceId = new Map(assemblies.map((assembly) => [assembly.sourceId, assembly] as const));
  const cadPartBySourceId = new Map(cadParts.map((part) => [part.sourceId, part] as const));
  const partInstanceByCadSourceId = new Map(partInstances.map((part) => [part.sourceId, part] as const));
  const decisions = args.input.decisions ?? [];
  const assemblyTargetId = (decision: { targetKind: CadMappingTargetKind; targetId?: string | null; parentMechanismId?: string | null }) =>
    decision.targetKind === "COMPONENT_ASSEMBLY"
      ? decision.parentMechanismId ?? decision.targetId ?? null
      : decision.targetId ?? null;
  const partTargetId = (decision: { targetKind: CadMappingTargetKind; targetId?: string | null; status?: string | null }) =>
    decision.status === "REJECTED" || decision.targetKind === "IGNORE" || decision.targetKind === "REFERENCE_GEOMETRY" || decision.targetKind === "UNMAPPED"
      ? null
      : decision.targetId ?? null;
  const partTargetKind = (decision: { targetKind: CadMappingTargetKind; status?: string | null }) => {
    if (decision.status === "REJECTED") {
      return "UNMAPPED" as const;
    }
    if (decision.targetKind === "IGNORE" || decision.targetKind === "REFERENCE_GEOMETRY" || decision.targetKind === "UNMAPPED") {
      return decision.targetKind;
    }
    return "PART_DEFINITION" as const;
  };
  const updates = [
    ...decisions
      .filter((decision) => (decision.sourceKind ?? "ASSEMBLY_NODE") === "ASSEMBLY_NODE")
      .map((decision) => {
        const sourceId = decision.sourceId ?? decision.nodeId;
        const assembly = assemblyByCadSourceId.get(sourceId);
        return {
          sourceKind: "ASSEMBLY_NODE" as const,
          sourceId: assembly?.id ?? sourceId,
          targetKind: decision.targetKind,
          targetId: assemblyTargetId(decision),
          confidence: "MANUAL" as const,
          status: decision.status ?? "CONFIRMED",
          applyToFuture: decision.applyToFuture,
          reviewedBy: args.input.reviewedBy ?? null,
          notes: decision.notes ?? null,
        };
      }),
    ...decisions
      .filter((decision) => (decision.sourceKind === "PART_DEFINITION" || decision.sourceKind === "PART_INSTANCE"))
      .map((decision) => {
        const sourceId = decision.sourceId ?? decision.nodeId;
        const isPartInstance = decision.sourceKind === "PART_INSTANCE";
        const cadPart = isPartInstance ? partInstanceByCadSourceId.get(sourceId) : cadPartBySourceId.get(sourceId);
        return {
          sourceKind: isPartInstance ? "PART_INSTANCE" as const : "PART_DEFINITION" as const,
          sourceId: cadPart?.id ?? sourceId,
          targetKind: partTargetKind(decision),
          targetId: partTargetId(decision),
          confidence: "MANUAL" as const,
          status: decision.status ?? "CONFIRMED",
          applyToFuture: decision.applyToFuture,
          reviewedBy: args.input.reviewedBy ?? null,
          notes: decision.notes ?? null,
        };
      }),
    ...(args.input.assemblyDecisions ?? []).map((decision) => {
      const assembly = assemblyByCadSourceId.get(decision.sourceId);
      return {
        sourceKind: "ASSEMBLY_NODE" as const,
        sourceId: assembly?.id ?? decision.sourceId,
        targetKind: decision.targetKind,
        targetId: assemblyTargetId(decision),
        confidence: decision.confidence ?? "MANUAL",
        status: decision.status ?? "CONFIRMED",
        applyToFuture: decision.applyToFuture,
        reviewedBy: args.input.reviewedBy ?? null,
        notes: decision.notes ?? null,
      };
    }),
    ...(args.input.partMatchConfirmations ?? []).map((confirmation) => {
      const cadPart = cadPartBySourceId.get(confirmation.cadPartDefinitionSourceId);
      return {
        sourceKind: "PART_DEFINITION" as const,
        sourceId: cadPart?.id ?? confirmation.cadPartDefinitionSourceId,
        targetKind: confirmation.status === "REJECTED" ? "UNMAPPED" as const : "PART_DEFINITION" as const,
        targetId: confirmation.status === "REJECTED" ? null : confirmation.targetPartDefinitionId,
        confidence: "MANUAL" as const,
        status: confirmation.status ?? "CONFIRMED",
        applyToFuture: confirmation.applyToFuture,
        reviewedBy: args.input.reviewedBy ?? null,
        notes: confirmation.notes ?? null,
      };
    }),
  ];
  return applyMappingUpdates({
    store: args.store,
    snapshot,
    updates,
    reviewedBy: args.input.reviewedBy ?? null,
  });
}
