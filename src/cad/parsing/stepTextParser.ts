import type { NormalizedCadWarning, StepParseResult } from "../cadTypes";
import { createFlatStepResult } from "./stepFlatResultParser";
import type { StepParserInput } from "./stepParserTypes";
import { createParserWarning } from "./stepParserShared";
import { parseStepEntities, stepStringValue } from "./stepTextEntityParser";
import { createStructuredStepResult } from "./stepTextStructuredResultParser";
import type { StepAssemblyUsage, StepProductDefinition } from "./stepTextParserTypes";

function collectProducts(
  entities: ReturnType<typeof parseStepEntities>,
  products: Map<string, string>,
) {
  for (const entity of entities) {
    if (entity.type === "PRODUCT") {
      const name = stepStringValue(entity.args[0] ?? "")?.trim() || `Product ${entity.id}`;
      products.set(entity.id, name);
    }
  }
}

function collectProductDefinitions(args: {
  entities: ReturnType<typeof parseStepEntities>;
  products: Map<string, string>;
  formationToProductId: Map<string, string>;
  productDefinitions: Map<string, StepProductDefinition>;
}) {
  let partialReferenceCount = 0;
  for (const entity of args.entities) {
    if (entity.type !== "PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE") {
      continue;
    }
    const productId = entity.refs.find((ref) => args.products.has(ref)) ?? entity.refs[0] ?? null;
    if (productId) {
      args.formationToProductId.set(entity.id, productId);
    } else {
      partialReferenceCount += 1;
    }
  }
  for (const entity of args.entities) {
    if (entity.type !== "PRODUCT_DEFINITION") {
      continue;
    }
    const formationId = entity.refs.find((ref) => args.formationToProductId.has(ref)) ?? entity.refs[0] ?? null;
    const productId = formationId ? args.formationToProductId.get(formationId) ?? null : null;
    const name = productId ? args.products.get(productId) ?? `Product definition ${entity.id}` : `Product definition ${entity.id}`;
    if (!productId) {
      partialReferenceCount += 1;
    }
    args.productDefinitions.set(entity.id, { id: entity.id, productId, name });
  }
  return partialReferenceCount;
}

function collectAssemblyUsages(args: {
  entities: ReturnType<typeof parseStepEntities>;
  productDefinitions: Map<string, StepProductDefinition>;
}) {
  const assemblyUsages: StepAssemblyUsage[] = [];
  let partialReferenceCount = 0;
  for (const entity of args.entities) {
    if (entity.type !== "NEXT_ASSEMBLY_USAGE_OCCURRENCE") {
      continue;
    }
    const productDefinitionRefs = entity.refs.filter((ref) => args.productDefinitions.has(ref));
    if (productDefinitionRefs.length < 2) {
      partialReferenceCount += 1;
      continue;
    }
    const stringArgs = entity.args.map(stepStringValue).filter((value): value is string => value !== null);
    assemblyUsages.push({
      id: entity.id,
      occurrenceName: stringArgs[1]?.trim() || stringArgs[0]?.trim() || "",
      parentProductDefinitionId: productDefinitionRefs[0]!,
      childProductDefinitionId: productDefinitionRefs[1]!,
    });
  }
  return { assemblyUsages, partialReferenceCount };
}

function buildAssemblyGraph(assemblyUsages: StepAssemblyUsage[]) {
  const childrenByParent = new Map<string, StepAssemblyUsage[]>();
  const childProductDefinitionIds = new Set<string>();
  const parentProductDefinitionIds = new Set<string>();
  for (const usage of assemblyUsages) {
    childrenByParent.set(usage.parentProductDefinitionId, [
      ...(childrenByParent.get(usage.parentProductDefinitionId) ?? []),
      usage,
    ]);
    parentProductDefinitionIds.add(usage.parentProductDefinitionId);
    childProductDefinitionIds.add(usage.childProductDefinitionId);
  }
  return { childrenByParent, childProductDefinitionIds, parentProductDefinitionIds };
}

function resolveRoots(args: {
  parentProductDefinitionIds: Set<string>;
  childProductDefinitionIds: Set<string>;
  warnings: NormalizedCadWarning[];
}) {
  let partialReferenceCount = 0;
  const roots = [...args.parentProductDefinitionIds].filter((productDefinitionId) => !args.childProductDefinitionIds.has(productDefinitionId));
  if (roots.length === 0) {
    partialReferenceCount += 1;
    roots.push([...args.parentProductDefinitionIds][0]!);
    args.warnings.push(
      createParserWarning({
        code: "step_hierarchy_missing",
        title: "Assembly hierarchy root is missing",
        message: "The STEP assembly graph did not expose a clear root. Mission Control imported the first assembly parent as the root.",
        metadata: { rootCandidate: roots[0] },
      }),
    );
  } else if (roots.length > 1) {
    args.warnings.push(
      createParserWarning({
        code: "step_multiple_roots_detected",
        title: "Multiple STEP assembly roots detected",
        message: "The STEP file has more than one top-level assembly root. Review the detected structure before mapping.",
        metadata: { roots },
      }),
    );
  }
  return { roots, partialReferenceCount };
}

export function parseStepTextAssemblyGraph(input: StepParserInput): StepParseResult {
  const entities = parseStepEntities(input.fileText);
  const products = new Map<string, string>();
  const formationToProductId = new Map<string, string>();
  const productDefinitions = new Map<string, StepProductDefinition>();
  const warnings: NormalizedCadWarning[] = [];

  collectProducts(entities, products);
  let partialReferenceCount = collectProductDefinitions({ entities, products, formationToProductId, productDefinitions });
  const collectedUsages = collectAssemblyUsages({ entities, productDefinitions });
  const assemblyUsages = collectedUsages.assemblyUsages;
  partialReferenceCount += collectedUsages.partialReferenceCount;
  const baseRawStats = () => ({
    entityCount: entities.length,
    productCount: products.size,
    productDefinitionFormationCount: formationToProductId.size,
    productDefinitionCount: productDefinitions.size,
    nextAssemblyUsageOccurrenceCount: assemblyUsages.length,
    assemblyUsageCount: assemblyUsages.length,
  });

  if (assemblyUsages.length === 0) {
    warnings.push(
      createParserWarning({
        code: "step_hierarchy_missing",
        title: "Assembly hierarchy is missing",
        message: "The STEP file did not include usable NEXT_ASSEMBLY_USAGE_OCCURRENCE assembly edges.",
        metadata: { productCount: products.size, productDefinitionCount: productDefinitions.size },
      }),
    );
    if (products.size > 1 || productDefinitions.size > 1) {
      warnings.push(
        createParserWarning({
          code: "step_flattened_file",
          title: "STEP export appears flattened",
          message: "The STEP file contains products but no assembly usage graph. Export from the master assembly with structure preserved.",
          metadata: { productCount: products.size, productDefinitionCount: productDefinitions.size },
        }),
      );
    }
    return createFlatStepResult({
      productDefinitions,
      products,
      warnings,
      rawStats: {
        ...baseRawStats(),
        rootCount: productDefinitions.size > 0 || products.size > 0 ? 1 : 0,
        rootNames: productDefinitions.size > 0
          ? [[...productDefinitions.values()][0]?.name ?? "STEP import"]
          : [[...products.values()][0] ?? "STEP import"],
        topLevelAssemblyNames: [],
        firstTenAssemblyNames: [],
      },
    });
  }

  const graph = buildAssemblyGraph(assemblyUsages);
  const resolvedRoots = resolveRoots({ ...graph, warnings });
  const roots = resolvedRoots.roots;
  partialReferenceCount += resolvedRoots.partialReferenceCount;
  if (partialReferenceCount > 0) {
    warnings.push(
      createParserWarning({
        code: "step_parser_partial",
        title: "STEP graph parse was partial",
        message: "The lightweight STEP parser recovered the assembly graph but skipped some unresolved product references.",
        metadata: { partialReferenceCount },
      }),
    );
  }

  return createStructuredStepResult({
    roots,
    productDefinitions,
    childrenByParent: graph.childrenByParent,
    warnings,
    rawStats: baseRawStats(),
  });
}
