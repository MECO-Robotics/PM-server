import { getMechanisms, getSubsystems } from "../data/store";
import type { CadAssemblyNode, CadMappingTargetKind, CadPartInstance, CadSnapshotMapping } from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";
import { normalizeCadName } from "./cadUtils";
import { buildCadPartMatchProposals } from "./cadPartMatchingService";
import { collectHierarchyIssues, type CadHierarchyIssue } from "./cadHierarchyValidationService";
import { buildHierarchyPartSummary } from "./cadHierarchyPartSummaryService";

type AssemblyMapping = CadSnapshotMapping | undefined;

function classificationFor(node: CadAssemblyNode, mapping: AssemblyMapping): CadMappingTargetKind | "ROOT" {
  if (mapping?.status === "REJECTED") {
    return "UNMAPPED";
  }
  if (mapping && mapping.targetKind !== "UNMAPPED") {
    return mapping.targetKind;
  }
  if (node.inferredType === "ROOT") {
    return "ROOT";
  }
  if (node.inferredType === "SUBSYSTEM_CANDIDATE") {
    return "SUBSYSTEM";
  }
  if (node.inferredType === "MECHANISM_CANDIDATE") {
    return "MECHANISM";
  }
  if (node.inferredType === "COMPONENT_ASSEMBLY_CANDIDATE") {
    return "COMPONENT_ASSEMBLY";
  }
  return "UNMAPPED";
}

function exactDomainTarget(kind: CadMappingTargetKind | "ROOT", name: string) {
  const normalizedName = normalizeCadName(name);
  if (kind === "SUBSYSTEM") {
    return getSubsystems().find((item) => normalizeCadName(item.name) === normalizedName)?.id ?? null;
  }
  if (kind === "MECHANISM") {
    return getMechanisms().find((item) => normalizeCadName(item.name) === normalizedName)?.id ?? null;
  }
  return null;
}

function resolvedTarget(mapping: AssemblyMapping, kind: CadMappingTargetKind | "ROOT", name: string) {
  if (mapping?.targetId && mapping.status === "CONFIRMED") {
    return mapping.targetId;
  }
  if (kind === "COMPONENT_ASSEMBLY") {
    return null;
  }
  return exactDomainTarget(kind, name);
}

function issueTitle(issue: CadHierarchyIssue) {
  return issue.code
    .replace(/^cad[_-]/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function warningFromIssue(issue: CadHierarchyIssue) {
  return {
    code: issue.code,
    title: issueTitle(issue),
    message: issue.message,
    severity: issue.severity === "BLOCKING" ? "WARNING" : "INFO",
    sourceKind: issue.sourceKind,
    sourceId: issue.sourceId,
  };
}

export async function buildCadHierarchyReview(args: { store: CadStore; snapshotId: string }) {
  const snapshot = await args.store.findSnapshot(args.snapshotId);
  if (!snapshot) {
    return null;
  }
  const [assemblies, cadParts, instances, mappings, proposals] = await Promise.all([
    args.store.listAssemblyNodes(args.snapshotId),
    args.store.listPartDefinitions(args.snapshotId),
    args.store.listPartInstances(args.snapshotId),
    args.store.listSnapshotMappings(args.snapshotId),
    buildCadPartMatchProposals(args),
  ]);
  const mappingsBySourceId = new Map(mappings.map((mapping) => [mapping.sourceId, mapping] as const));
  const definitionsById = new Map(cadParts.map((part) => [part.id, part] as const));
  const proposalsByCadPartId = new Map(proposals.items.map((proposal) => [proposal.cadPartDefinitionId, proposal] as const));
  const childrenByParent = new Map<string | null, CadAssemblyNode[]>();
  const instancesByParent = new Map<string | null, CadPartInstance[]>();
  for (const assembly of assemblies) {
    const key = assembly.parentAssemblyNodeId ?? null;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), assembly]);
  }
  for (const instance of instances) {
    const key = instance.parentAssemblyNodeId ?? null;
    instancesByParent.set(key, [...(instancesByParent.get(key) ?? []), instance]);
  }
  const collectInstancesUnder = (nodeId: string): CadPartInstance[] => [
    ...(instancesByParent.get(nodeId) ?? []),
    ...(childrenByParent.get(nodeId) ?? []).flatMap((child) => collectInstancesUnder(child.id)),
  ];
  const visit = (
    node: CadAssemblyNode,
    context: { subsystemId: string | null; mechanismId: string | null; componentAssemblyId: string | null },
  ): CadHierarchyNode => {
    const mapping = mappingsBySourceId.get(node.id);
    const proposedClassification = classificationFor(node, mapping);
    const targetId = resolvedTarget(mapping, proposedClassification, node.name);
    const resolvedSubsystemId = proposedClassification === "SUBSYSTEM" ? targetId : context.subsystemId;
    const resolvedMechanismId = proposedClassification === "MECHANISM"
      ? targetId
      : proposedClassification === "COMPONENT_ASSEMBLY"
        ? mapping?.targetId ?? context.mechanismId
        : context.mechanismId;
    const resolvedComponentAssemblyId = proposedClassification === "COMPONENT_ASSEMBLY"
      ? node.sourceId
      : context.componentAssemblyId;
    const childContext = {
      subsystemId: resolvedSubsystemId,
      mechanismId: resolvedMechanismId,
      componentAssemblyId: resolvedComponentAssemblyId,
    };
    return {
      id: node.id,
      sourceKind: "ASSEMBLY_NODE",
      sourceId: node.sourceId,
      name: node.name,
      instancePath: node.instancePath,
      inferredType: node.inferredType,
      proposedClassification,
      resolvedSubsystemId,
      resolvedMechanismId,
      resolvedComponentAssemblyId,
      resolvedPartDefinitionId: null,
      confidence: mapping?.confidence ?? "LOW",
      status: mapping?.status ?? "NEEDS_REVIEW",
      children: (childrenByParent.get(node.id) ?? []).map((child) => visit(child, childContext)),
      partSummary: buildHierarchyPartSummary({
        instances: collectInstancesUnder(node.id),
        definitionsById,
        mappingsBySourceId,
        proposalsByCadPartId,
      }),
    };
  };
  const roots = (childrenByParent.get(null) ?? []).map((node) => visit(node, {
    subsystemId: null,
    mechanismId: null,
    componentAssemblyId: null,
  }));
  const root = roots[0] ?? null;
  const issues = collectHierarchyIssues({ assemblies, instances, mappingsBySourceId, proposals: proposals.items, definitionsById });
  const unresolved = issues.filter((issue) => issue.severity === "BLOCKING");
  return {
    snapshotId: args.snapshotId,
    root,
    roots,
    unresolved,
    partMatchProposals: proposals.items,
    warnings: issues.filter((issue) => issue.severity !== "BLOCKING").map(warningFromIssue),
  };
}

export interface CadHierarchyNode {
  id: string;
  sourceKind: "ASSEMBLY_NODE";
  sourceId: string;
  name: string;
  instancePath: string;
  inferredType: string;
  proposedClassification: CadMappingTargetKind | "ROOT";
  resolvedSubsystemId: string | null;
  resolvedMechanismId: string | null;
  resolvedComponentAssemblyId: string | null;
  resolvedPartDefinitionId: string | null;
  confidence: string;
  status: string;
  children: CadHierarchyNode[];
  partSummary: ReturnType<typeof buildHierarchyPartSummary>;
}
