import type {
  CadAssemblyInferredType,
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  NormalizedCadWarning,
  StepParseResult,
} from "../cadTypes";
import { normalizeCadName } from "../cadUtils";
import {
  createParserWarning,
  finalizeResult,
  partDefinitionSignature,
  partInstanceSignature,
} from "./stepParserShared";
import type { StepAssemblyUsage, StepProductDefinition } from "./stepTextParserTypes";

function occurrenceNameFor(edge: StepAssemblyUsage, child: StepProductDefinition | undefined) {
  const trimmedOccurrenceName = edge.occurrenceName.trim();
  return trimmedOccurrenceName || child?.name || `Occurrence ${edge.id}`;
}

function inferredChildAssemblyType(depth: number): CadAssemblyInferredType {
  if (depth === 1) {
    return "SUBSYSTEM_CANDIDATE";
  }
  if (depth === 2) {
    return "MECHANISM_CANDIDATE";
  }
  return depth === 3 ? "COMPONENT_ASSEMBLY_CANDIDATE" : "SUBASSEMBLY";
}

function createPartDefinitionFactory(args: {
  productDefinitions: Map<string, StepProductDefinition>;
  partDefinitionsBySourceId: Map<string, NormalizedCadPartDefinition>;
}) {
  return (productDefinitionId: string) => {
    const sourceId = `step-part-def:${productDefinitionId}`;
    const existing = args.partDefinitionsBySourceId.get(sourceId);
    if (existing) {
      return existing;
    }
    const productDefinition = args.productDefinitions.get(productDefinitionId);
    const name = productDefinition?.name ?? `Part ${productDefinitionId}`;
    const partDefinition: NormalizedCadPartDefinition = {
      sourceId,
      name,
      partNumber: null,
      material: null,
      stableSignature: partDefinitionSignature({ sourceId, name, partNumber: null }),
      metadata: {
        productDefinitionId,
        productId: productDefinition?.productId ?? null,
      },
    };
    args.partDefinitionsBySourceId.set(sourceId, partDefinition);
    return partDefinition;
  };
}

function addAssemblyChildren(args: {
  productDefinitionId: string;
  assemblySourceId: string;
  instancePath: string;
  depth: number;
  visitedProductDefinitionIds: Set<string>;
  childrenByParent: Map<string, StepAssemblyUsage[]>;
  productDefinitions: Map<string, StepProductDefinition>;
  warnings: NormalizedCadWarning[];
  assemblyNodes: NormalizedCadAssemblyNode[];
  partInstances: NormalizedCadPartInstance[];
  createPartDefinition: (productDefinitionId: string) => NormalizedCadPartDefinition;
}) {
  const childEdges = args.childrenByParent.get(args.productDefinitionId) ?? [];
  const siblingNameCounts = new Map<string, number>();
  for (const edge of childEdges) {
    const displayName = occurrenceNameFor(edge, args.productDefinitions.get(edge.childProductDefinitionId));
    const key = normalizeCadName(displayName);
    siblingNameCounts.set(key, (siblingNameCounts.get(key) ?? 0) + 1);
  }

  for (const edge of childEdges) {
    const childProductDefinition = args.productDefinitions.get(edge.childProductDefinitionId);
    const displayName = occurrenceNameFor(edge, childProductDefinition);
    const normalizedDisplayName = normalizeCadName(displayName);
    const pathSegment = (siblingNameCounts.get(normalizedDisplayName) ?? 0) > 1 ? `${displayName} (${edge.id})` : displayName;
    const instancePath = `${args.instancePath}/${pathSegment}`;
    const childHasChildren = (args.childrenByParent.get(edge.childProductDefinitionId) ?? []).length > 0;

    if (childHasChildren) {
      addNestedAssembly({ ...args, edge, childProductDefinition, displayName, pathSegment, instancePath });
      continue;
    }
    const partDefinition = args.createPartDefinition(edge.childProductDefinitionId);
    args.partInstances.push({
      sourceId: `step-part-inst:${edge.id}`,
      partDefinitionSourceId: partDefinition.sourceId,
      parentAssemblySourceId: args.assemblySourceId,
      instancePath,
      quantity: 1,
      stableSignature: partInstanceSignature({ sourceId: `step-part-inst:${edge.id}`, instancePath }),
      metadata: {
        nauoId: edge.id,
        parentProductDefinitionId: edge.parentProductDefinitionId,
        childProductDefinitionId: edge.childProductDefinitionId,
        duplicateSiblingPathSegment: pathSegment !== displayName,
      },
    });
  }
}

function addNestedAssembly(args: Parameters<typeof addAssemblyChildren>[0] & {
  edge: StepAssemblyUsage;
  childProductDefinition: StepProductDefinition | undefined;
  displayName: string;
  pathSegment: string;
  instancePath: string;
}) {
  const sourceId = `step-asm-occ:${args.edge.id}`;
  args.assemblyNodes.push({
    sourceId,
    parentSourceId: args.assemblySourceId,
    name: args.displayName,
    instancePath: args.instancePath,
    depth: args.depth + 1,
    inferredType: inferredChildAssemblyType(args.depth + 1),
    stableSignature: `asm:path:${args.instancePath}`,
    metadata: {
      nauoId: args.edge.id,
      parentProductDefinitionId: args.edge.parentProductDefinitionId,
      childProductDefinitionId: args.edge.childProductDefinitionId,
      productId: args.childProductDefinition?.productId ?? null,
      duplicateSiblingPathSegment: args.pathSegment !== args.displayName,
    },
  });
  if (args.visitedProductDefinitionIds.has(args.edge.childProductDefinitionId)) {
    args.warnings.push(
      createParserWarning({
        code: "step_parser_partial",
        title: "STEP graph cycle skipped",
        message: `${args.displayName} appeared again in its own ancestry and was not expanded further.`,
        metadata: { nauoId: args.edge.id, productDefinitionId: args.edge.childProductDefinitionId },
      }),
    );
    return;
  }
  addAssemblyChildren({
    ...args,
    productDefinitionId: args.edge.childProductDefinitionId,
    assemblySourceId: sourceId,
    depth: args.depth + 1,
    visitedProductDefinitionIds: new Set([...args.visitedProductDefinitionIds, args.edge.childProductDefinitionId]),
  });
}

export function createStructuredStepResult(args: {
  roots: string[];
  productDefinitions: Map<string, StepProductDefinition>;
  childrenByParent: Map<string, StepAssemblyUsage[]>;
  warnings: NormalizedCadWarning[];
  rawStats: Partial<StepParseResult["rawStats"]>;
}) {
  const rootNames = args.roots.map((rootId) => args.productDefinitions.get(rootId)?.name ?? `Assembly ${rootId}`);
  const topLevelAssemblyNames = args.roots.flatMap((rootId) =>
    (args.childrenByParent.get(rootId) ?? []).map((edge) => occurrenceNameFor(edge, args.productDefinitions.get(edge.childProductDefinitionId))),
  );
  const assemblyNodes: NormalizedCadAssemblyNode[] = [];
  const partDefinitionsBySourceId = new Map<string, NormalizedCadPartDefinition>();
  const partInstances: NormalizedCadPartInstance[] = [];
  const createPartDefinition = createPartDefinitionFactory({
    productDefinitions: args.productDefinitions,
    partDefinitionsBySourceId,
  });

  for (const rootProductDefinitionId of args.roots) {
    const productDefinition = args.productDefinitions.get(rootProductDefinitionId);
    const rootName = productDefinition?.name ?? `Assembly ${rootProductDefinitionId}`;
    const sourceId = `step-asm-root:${rootProductDefinitionId}`;
    const instancePath = `/${rootName}`;
    assemblyNodes.push({
      sourceId,
      parentSourceId: null,
      name: rootName,
      instancePath,
      depth: 0,
      inferredType: "ROOT",
      stableSignature: `asm:path:${instancePath}`,
      metadata: {
        productDefinitionId: rootProductDefinitionId,
        productId: productDefinition?.productId ?? null,
      },
    });
    addAssemblyChildren({
      productDefinitionId: rootProductDefinitionId,
      assemblySourceId: sourceId,
      instancePath,
      depth: 0,
      visitedProductDefinitionIds: new Set([rootProductDefinitionId]),
      childrenByParent: args.childrenByParent,
      productDefinitions: args.productDefinitions,
      warnings: args.warnings,
      assemblyNodes,
      partInstances,
      createPartDefinition,
    });
  }

  return finalizeResult({
    parserVersion: "step-text-assembly-parser-1",
    rootName: args.roots.length === 1 ? assemblyNodes[0]?.name ?? null : null,
    units: null,
    assemblyNodes,
    partDefinitions: [...partDefinitionsBySourceId.values()],
    partInstances,
    warnings: args.warnings,
    rawStats: {
      ...args.rawStats,
      rootCount: args.roots.length,
      rootNames,
      topLevelAssemblyNames,
      firstTenAssemblyNames: assemblyNodes.slice(0, 10).map((node) => node.name),
    },
  });
}
