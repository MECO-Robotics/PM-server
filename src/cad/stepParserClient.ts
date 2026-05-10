import type {
  CadAssemblyInferredType,
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  NormalizedCadWarning,
  StepParseResult,
} from "./cadTypes";
import {
  inferAssemblyType,
  isGenericCadName,
  normalizeCadName,
  sourceNameWithParent,
} from "./cadUtils";

export interface StepParserInput {
  fileText: string;
  originalFilename: string;
  importRunId: string;
  options?: Record<string, unknown>;
}

export interface StepParserClient {
  parseStepFile(input: StepParserInput): Promise<StepParseResult>;
}

export type StepParserMode = "auto" | "step_text" | "json_fixture" | "placeholder";

interface JsonStepFixture {
  rootName?: string | null;
  units?: string | null;
  assemblyNodes?: Array<Partial<NormalizedCadAssemblyNode>>;
  partDefinitions?: Array<Partial<NormalizedCadPartDefinition>>;
  partInstances?: Array<Partial<NormalizedCadPartInstance>>;
  warnings?: NormalizedCadWarning[];
}

function assemblySignature(node: Pick<NormalizedCadAssemblyNode, "instancePath" | "name" | "sourceId">, parentName: string | null) {
  if (node.instancePath?.trim()) {
    return `asm:path:${node.instancePath.trim()}`;
  }
  if (node.name?.trim()) {
    return `asm:name-parent:${sourceNameWithParent(node.name, parentName)}`;
  }
  return `asm:source:${node.sourceId}`;
}

function partDefinitionSignature(part: Pick<NormalizedCadPartDefinition, "partNumber" | "name" | "sourceId">) {
  if (part.partNumber?.trim()) {
    return `part:number:${part.partNumber.trim().toUpperCase()}`;
  }
  if (part.name?.trim()) {
    return `part:name:${normalizeCadName(part.name)}`;
  }
  return `part:source:${part.sourceId}`;
}

function partInstanceSignature(instance: Pick<NormalizedCadPartInstance, "instancePath" | "sourceId">) {
  if (instance.instancePath?.trim()) {
    return `inst:path:${instance.instancePath.trim()}`;
  }
  return `inst:source:${instance.sourceId}`;
}

function duplicateNameWarnings(
  items: Array<{ name: string; sourceId: string }>,
  code: string,
  title: string,
  sourceKind: "ASSEMBLY_NODE" | "PART_DEFINITION",
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeCadName(item.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return items
    .filter((item) => (counts.get(normalizeCadName(item.name)) ?? 0) > 1)
    .map((item): NormalizedCadWarning => ({
      severity: "WARNING",
      code,
      title,
      message: `${item.name} appears more than once in the STEP assembly structure.`,
      sourceKind,
      sourceId: item.sourceId,
      metadata: { name: item.name },
    }));
}

function finalizeResult(result: Omit<StepParseResult, "rawStats">): StepParseResult {
  const duplicateNameCount =
    duplicateNameWarnings(result.assemblyNodes.map((node) => ({ name: node.name, sourceId: node.sourceId })), "", "", "ASSEMBLY_NODE").length +
    duplicateNameWarnings(result.partDefinitions.map((part) => ({ name: part.name, sourceId: part.sourceId })), "", "", "PART_DEFINITION").length;
  const hadNames =
    result.assemblyNodes.every((node) => !isGenericCadName(node.name)) &&
    result.partDefinitions.every((part) => !isGenericCadName(part.name));
  const hadHierarchy = result.assemblyNodes.some((node) => Boolean(node.parentSourceId)) || result.assemblyNodes.length <= 1;

  const warnings = [...result.warnings];
  if (!hadHierarchy && result.assemblyNodes.length > 1) {
    warnings.push({
      severity: "WARNING",
      code: "step_hierarchy_missing",
      title: "Assembly hierarchy is missing",
      message: "The STEP file did not preserve a usable assembly hierarchy. Mission Control imported a flat structure.",
      metadata: {},
    });
    warnings.push({
      severity: "WARNING",
      code: "step_flattened_file",
      title: "STEP export appears flattened",
      message: "Export from the master assembly and preserve assembly structure to improve mapping proposals.",
      metadata: {},
    });
  }
  if (!hadNames) {
    warnings.push({
      severity: "WARNING",
      code: "step_names_missing",
      title: "STEP names are generic",
      message: "Some assembly or part names are generic. Use SUB, MECH, ASM, or PRT naming conventions for better carry-forward.",
      metadata: {},
    });
  }
  if (!result.units) {
    warnings.push({
      severity: "INFO",
      code: "step_unknown_units",
      title: "STEP units are unknown",
      message: "The parser output did not include units. Geometry is not interpreted in this MVP.",
      metadata: {},
    });
  }

  warnings.push(
    ...duplicateNameWarnings(
      result.assemblyNodes.map((node) => ({ name: node.name, sourceId: node.sourceId })),
      "step_duplicate_assembly_name",
      "Duplicate assembly names",
      "ASSEMBLY_NODE",
    ),
    ...duplicateNameWarnings(
      result.partDefinitions.map((part) => ({ name: part.name, sourceId: part.sourceId })),
      "step_duplicate_part_name",
      "Duplicate part names",
      "PART_DEFINITION",
    ),
  );

  return {
    ...result,
    warnings,
    rawStats: {
      assemblyCount: result.assemblyNodes.length,
      partDefinitionCount: result.partDefinitions.length,
      partInstanceCount: result.partInstances.length,
      maxDepth: result.assemblyNodes.reduce((max, node) => Math.max(max, node.depth), 0),
      hadNames,
      hadHierarchy,
      duplicateNameCount,
    },
  };
}

function coerceInferredType(value: unknown, name: string, depth: number): CadAssemblyInferredType {
  if (
    value === "ROOT" ||
    value === "SUBSYSTEM_CANDIDATE" ||
    value === "MECHANISM_CANDIDATE" ||
    value === "SUBASSEMBLY" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  return inferAssemblyType(name, depth);
}

interface StepEntity {
  id: string;
  type: string;
  args: string[];
  refs: string[];
}

interface StepProductDefinition {
  id: string;
  productId: string | null;
  name: string;
}

interface StepAssemblyUsage {
  id: string;
  occurrenceName: string;
  parentProductDefinitionId: string;
  childProductDefinitionId: string;
}

function normalizeEntityId(value: string) {
  return value.trim().toUpperCase();
}

function stepStringValue(arg: string) {
  const value = arg.trim();
  if (!value.startsWith("'")) {
    return null;
  }
  let output = "";
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      if (value[index + 1] === "'") {
        output += "'";
        index += 1;
        continue;
      }
      break;
    }
    output += character;
  }
  return output;
}

function splitStepArgs(argsText: string) {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let index = 0; index < argsText.length; index += 1) {
    const character = argsText[index];
    if (character === "'") {
      current += character;
      if (inString && argsText[index + 1] === "'") {
        current += argsText[index + 1];
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth = Math.max(0, depth - 1);
      } else if (character === "," && depth === 0) {
        args.push(current.trim());
        current = "";
        continue;
      }
    }
    current += character;
  }

  if (current.trim() || argsText.trim()) {
    args.push(current.trim());
  }
  return args;
}

function matchingParenIndex(text: string, openIndex: number) {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (character === "'") {
      if (inString && text[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function parseStepEntities(fileText: string) {
  const entities: StepEntity[] = [];
  const entityPattern = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = entityPattern.exec(fileText)) !== null) {
    const openIndex = match.index + match[0]!.lastIndexOf("(");
    const closeIndex = matchingParenIndex(fileText, openIndex);
    if (closeIndex < 0) {
      break;
    }
    const argsText = fileText.slice(openIndex + 1, closeIndex);
    const args = splitStepArgs(argsText);
    entities.push({
      id: normalizeEntityId(`#${match[1]}`),
      type: match[2]!.toUpperCase(),
      args,
      refs: [...argsText.matchAll(/#\d+/g)].map((ref) => normalizeEntityId(ref[0])),
    });
    entityPattern.lastIndex = closeIndex + 1;
  }
  return entities;
}

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
  return "SUBASSEMBLY";
}

function createParserWarning(args: {
  severity?: "INFO" | "WARNING" | "ERROR";
  code: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): NormalizedCadWarning {
  return {
    severity: args.severity ?? "WARNING",
    code: args.code,
    title: args.title,
    message: args.message,
    metadata: args.metadata ?? {},
  };
}

function createFlatStepResult(args: {
  productDefinitions: Map<string, StepProductDefinition>;
  products: Map<string, string>;
  warnings: NormalizedCadWarning[];
}) {
  const assemblyNodes: NormalizedCadAssemblyNode[] = [];
  const partDefinitions: NormalizedCadPartDefinition[] = [];
  const productDefinitions = [...args.productDefinitions.values()];

  if (productDefinitions.length > 0) {
    const [root, ...leaves] = productDefinitions;
    const rootPath = `/${root.name}`;
    assemblyNodes.push({
      sourceId: `step-asm-root:${root.id}`,
      parentSourceId: null,
      name: root.name,
      instancePath: rootPath,
      depth: 0,
      inferredType: "ROOT",
      stableSignature: `asm:path:${rootPath}`,
      metadata: {
        productDefinitionId: root.id,
        productId: root.productId,
        parserFallback: "flat-step-products",
      },
    });
    for (const part of leaves) {
      partDefinitions.push({
        sourceId: `step-part-def:${part.id}`,
        name: part.name,
        partNumber: null,
        material: null,
        stableSignature: partDefinitionSignature({ sourceId: `step-part-def:${part.id}`, name: part.name, partNumber: null }),
        metadata: {
          productDefinitionId: part.id,
          productId: part.productId,
          parserFallback: "flat-step-products",
        },
      });
    }
  } else {
    const products = [...args.products.entries()];
    const [rootProduct, ...leafProducts] = products;
    const rootName = rootProduct?.[1] ?? "STEP import";
    const rootId = rootProduct?.[0] ?? "unknown";
    const rootPath = `/${rootName}`;
    assemblyNodes.push({
      sourceId: `step-asm-root:${rootId}`,
      parentSourceId: null,
      name: rootName,
      instancePath: rootPath,
      depth: 0,
      inferredType: "ROOT",
      stableSignature: `asm:path:${rootPath}`,
      metadata: {
        productId: rootId,
        parserFallback: "flat-step-products",
      },
    });
    for (const [productId, name] of leafProducts) {
      partDefinitions.push({
        sourceId: `step-part-def:${productId}`,
        name,
        partNumber: null,
        material: null,
        stableSignature: partDefinitionSignature({ sourceId: `step-part-def:${productId}`, name, partNumber: null }),
        metadata: {
          productId,
          parserFallback: "flat-step-products",
        },
      });
    }
  }

  return finalizeResult({
    parserVersion: "step-text-assembly-parser-1",
    rootName: assemblyNodes[0]?.name ?? null,
    units: null,
    assemblyNodes,
    partDefinitions,
    partInstances: [],
    warnings: args.warnings,
  });
}

function parseStepTextAssemblyGraph(input: StepParserInput): StepParseResult {
  const entities = parseStepEntities(input.fileText);
  const products = new Map<string, string>();
  const formationToProductId = new Map<string, string>();
  const productDefinitions = new Map<string, StepProductDefinition>();
  const warnings: NormalizedCadWarning[] = [];
  let partialReferenceCount = 0;

  for (const entity of entities) {
    if (entity.type === "PRODUCT") {
      const name = stepStringValue(entity.args[0] ?? "")?.trim() || `Product ${entity.id}`;
      products.set(entity.id, name);
    }
  }

  for (const entity of entities) {
    if (entity.type !== "PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE") {
      continue;
    }
    const productId = entity.refs.find((ref) => products.has(ref)) ?? entity.refs[0] ?? null;
    if (productId) {
      formationToProductId.set(entity.id, productId);
    } else {
      partialReferenceCount += 1;
    }
  }

  for (const entity of entities) {
    if (entity.type !== "PRODUCT_DEFINITION") {
      continue;
    }
    const formationId = entity.refs.find((ref) => formationToProductId.has(ref)) ?? entity.refs[0] ?? null;
    const productId = formationId ? formationToProductId.get(formationId) ?? null : null;
    const name = productId ? products.get(productId) ?? `Product definition ${entity.id}` : `Product definition ${entity.id}`;
    if (!productId) {
      partialReferenceCount += 1;
    }
    productDefinitions.set(entity.id, {
      id: entity.id,
      productId,
      name,
    });
  }

  const assemblyUsages: StepAssemblyUsage[] = [];
  for (const entity of entities) {
    if (entity.type !== "NEXT_ASSEMBLY_USAGE_OCCURRENCE") {
      continue;
    }
    const productDefinitionRefs = entity.refs.filter((ref) => productDefinitions.has(ref));
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
    return createFlatStepResult({ productDefinitions, products, warnings });
  }

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

  const roots = [...parentProductDefinitionIds].filter((productDefinitionId) => !childProductDefinitionIds.has(productDefinitionId));
  if (roots.length === 0) {
    partialReferenceCount += 1;
    roots.push([...parentProductDefinitionIds][0]!);
    warnings.push(
      createParserWarning({
        code: "step_hierarchy_missing",
        title: "Assembly hierarchy root is missing",
        message: "The STEP assembly graph did not expose a clear root. Mission Control imported the first assembly parent as the root.",
        metadata: { rootCandidate: roots[0] },
      }),
    );
  } else if (roots.length > 1) {
    warnings.push(
      createParserWarning({
        code: "step_multiple_roots_detected",
        title: "Multiple STEP assembly roots detected",
        message: "The STEP file has more than one top-level assembly root. Review the detected structure before mapping.",
        metadata: { roots },
      }),
    );
  }

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

  const assemblyNodes: NormalizedCadAssemblyNode[] = [];
  const partDefinitionsBySourceId = new Map<string, NormalizedCadPartDefinition>();
  const partInstances: NormalizedCadPartInstance[] = [];

  const createPartDefinition = (productDefinitionId: string) => {
    const sourceId = `step-part-def:${productDefinitionId}`;
    const existing = partDefinitionsBySourceId.get(sourceId);
    if (existing) {
      return existing;
    }
    const productDefinition = productDefinitions.get(productDefinitionId);
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
    partDefinitionsBySourceId.set(sourceId, partDefinition);
    return partDefinition;
  };

  const visitAssemblyChildren = (args: {
    productDefinitionId: string;
    assemblySourceId: string;
    instancePath: string;
    depth: number;
    visitedProductDefinitionIds: Set<string>;
  }) => {
    const childEdges = childrenByParent.get(args.productDefinitionId) ?? [];
    const siblingNameCounts = new Map<string, number>();
    for (const edge of childEdges) {
      const displayName = occurrenceNameFor(edge, productDefinitions.get(edge.childProductDefinitionId));
      const key = normalizeCadName(displayName);
      siblingNameCounts.set(key, (siblingNameCounts.get(key) ?? 0) + 1);
    }

    for (const edge of childEdges) {
      const childProductDefinition = productDefinitions.get(edge.childProductDefinitionId);
      const displayName = occurrenceNameFor(edge, childProductDefinition);
      const normalizedDisplayName = normalizeCadName(displayName);
      const pathSegment =
        (siblingNameCounts.get(normalizedDisplayName) ?? 0) > 1 ? `${displayName} (${edge.id})` : displayName;
      const instancePath = `${args.instancePath}/${pathSegment}`;
      const childHasChildren = (childrenByParent.get(edge.childProductDefinitionId) ?? []).length > 0;

      if (childHasChildren) {
        const sourceId = `step-asm-occ:${edge.id}`;
        assemblyNodes.push({
          sourceId,
          parentSourceId: args.assemblySourceId,
          name: displayName,
          instancePath,
          depth: args.depth + 1,
          inferredType: inferredChildAssemblyType(args.depth + 1),
          stableSignature: `asm:path:${instancePath}`,
          metadata: {
            nauoId: edge.id,
            parentProductDefinitionId: edge.parentProductDefinitionId,
            childProductDefinitionId: edge.childProductDefinitionId,
            productId: childProductDefinition?.productId ?? null,
            duplicateSiblingPathSegment: pathSegment !== displayName,
          },
        });
        if (args.visitedProductDefinitionIds.has(edge.childProductDefinitionId)) {
          warnings.push(
            createParserWarning({
              code: "step_parser_partial",
              title: "STEP graph cycle skipped",
              message: `${displayName} appeared again in its own ancestry and was not expanded further.`,
              metadata: { nauoId: edge.id, productDefinitionId: edge.childProductDefinitionId },
            }),
          );
          continue;
        }
        visitAssemblyChildren({
          productDefinitionId: edge.childProductDefinitionId,
          assemblySourceId: sourceId,
          instancePath,
          depth: args.depth + 1,
          visitedProductDefinitionIds: new Set([...args.visitedProductDefinitionIds, edge.childProductDefinitionId]),
        });
        continue;
      }

      const partDefinition = createPartDefinition(edge.childProductDefinitionId);
      partInstances.push({
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
  };

  for (const rootProductDefinitionId of roots) {
    const productDefinition = productDefinitions.get(rootProductDefinitionId);
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
    visitAssemblyChildren({
      productDefinitionId: rootProductDefinitionId,
      assemblySourceId: sourceId,
      instancePath,
      depth: 0,
      visitedProductDefinitionIds: new Set([rootProductDefinitionId]),
    });
  }

  return finalizeResult({
    parserVersion: "step-text-assembly-parser-1",
    rootName: roots.length === 1 ? assemblyNodes[0]?.name ?? null : null,
    units: null,
    assemblyNodes,
    partDefinitions: [...partDefinitionsBySourceId.values()],
    partInstances,
    warnings,
  });
}

function parseJsonFixture(input: StepParserInput): StepParseResult | null {
  let fixture: JsonStepFixture;
  try {
    fixture = JSON.parse(input.fileText) as JsonStepFixture;
  } catch {
    return null;
  }
  if (!Array.isArray(fixture.assemblyNodes)) {
    return null;
  }

  const namesBySourceId = new Map<string, string>();
  for (const raw of fixture.assemblyNodes) {
    if (raw.sourceId && raw.name) {
      namesBySourceId.set(raw.sourceId, raw.name);
    }
  }

  const assemblyNodes = fixture.assemblyNodes.map((raw, index): NormalizedCadAssemblyNode => {
    const sourceId = raw.sourceId?.trim() || `asm-${index + 1}`;
    const name = raw.name?.trim() || `Assembly ${index + 1}`;
    const parentSourceId = raw.parentSourceId ?? null;
    const depth = Number.isFinite(raw.depth) ? Number(raw.depth) : parentSourceId ? 1 : 0;
    const instancePath = raw.instancePath?.trim() || `/${name}`;
    const parentName = parentSourceId ? namesBySourceId.get(parentSourceId) ?? null : null;
    return {
      sourceId,
      parentSourceId,
      name,
      instancePath,
      depth,
      inferredType: coerceInferredType(raw.inferredType, name, depth),
      stableSignature: raw.stableSignature ?? assemblySignature({ sourceId, name, instancePath }, parentName),
      metadata: raw.metadata ?? {},
    };
  });

  const partDefinitions = (fixture.partDefinitions ?? []).map((raw, index): NormalizedCadPartDefinition => {
    const sourceId = raw.sourceId?.trim() || `part-${index + 1}`;
    const name = raw.name?.trim() || `Part ${index + 1}`;
    const partNumber = raw.partNumber?.trim() || null;
    return {
      sourceId,
      name,
      partNumber,
      material: raw.material?.trim() || null,
      stableSignature: raw.stableSignature ?? partDefinitionSignature({ sourceId, name, partNumber }),
      metadata: raw.metadata ?? {},
    };
  });

  const partInstances = (fixture.partInstances ?? []).map((raw, index): NormalizedCadPartInstance => {
    const sourceId = raw.sourceId?.trim() || `inst-${index + 1}`;
    const instancePath = raw.instancePath?.trim() || `/${sourceId}`;
    return {
      sourceId,
      partDefinitionSourceId: raw.partDefinitionSourceId ?? null,
      parentAssemblySourceId: raw.parentAssemblySourceId ?? null,
      instancePath,
      quantity: raw.quantity && raw.quantity > 0 ? Math.trunc(raw.quantity) : 1,
      stableSignature: raw.stableSignature ?? partInstanceSignature({ sourceId, instancePath }),
      metadata: raw.metadata ?? {},
    };
  });

  return finalizeResult({
    parserVersion: "mock-step-parser-json-1",
    rootName: fixture.rootName ?? assemblyNodes[0]?.name ?? null,
    units: fixture.units ?? null,
    assemblyNodes,
    partDefinitions,
    partInstances,
    warnings: fixture.warnings ?? [],
  });
}

function placeholderResult(): StepParseResult {
  return finalizeResult({
    parserVersion: "mock-step-parser-placeholder-1",
    rootName: "ASM - Robot",
    units: null,
    assemblyNodes: [
      {
        sourceId: "asm-root",
        parentSourceId: null,
        name: "ASM - Robot",
        instancePath: "/Robot",
        depth: 0,
        inferredType: "ROOT",
        stableSignature: "asm:path:/Robot",
        metadata: { placeholder: true },
      },
      {
        sourceId: "asm-shooter",
        parentSourceId: "asm-root",
        name: "MECH - Shooter - Flywheel",
        instancePath: "/Robot/MECH - Shooter - Flywheel",
        depth: 1,
        inferredType: "MECHANISM_CANDIDATE",
        stableSignature: "asm:path:/Robot/MECH - Shooter - Flywheel",
        metadata: { placeholder: true },
      },
    ],
    partDefinitions: [
      {
        sourceId: "part-spacer",
        name: "PRT - Shooter - Flywheel - Spacer",
        partNumber: "SHR-001",
        material: null,
        stableSignature: "part:number:SHR-001",
        metadata: { placeholder: true },
      },
    ],
    partInstances: [
      {
        sourceId: "inst-spacer-1",
        partDefinitionSourceId: "part-spacer",
        parentAssemblySourceId: "asm-shooter",
        instancePath: "/Robot/MECH - Shooter - Flywheel/Spacer-1",
        quantity: 1,
        stableSignature: "inst:path:/Robot/MECH - Shooter - Flywheel/Spacer-1",
        metadata: { placeholder: true },
      },
    ],
    warnings: [
      {
        severity: "INFO",
        code: "step_parser_placeholder_used",
        title: "Placeholder STEP parser used",
        message:
          "Mission Control used the MVP placeholder parser. A future Open CASCADE worker can replace this without changing the review workflow.",
        metadata: {},
      },
    ],
  });
}

export function createJsonFixtureStepParserClient(): StepParserClient {
  return {
    async parseStepFile(input) {
      const parsed = parseJsonFixture(input);
      if (!parsed) {
        throw new Error("STEP parser JSON fixture input is invalid.");
      }
      return parsed;
    },
  };
}

export function createPlaceholderStepParserClient(): StepParserClient {
  return {
    async parseStepFile() {
      return placeholderResult();
    },
  };
}

export function createStepTextAssemblyParserClient(): StepParserClient {
  return {
    async parseStepFile(input) {
      return parseStepTextAssemblyGraph(input);
    },
  };
}

export function createStepParserClient(options?: { mode?: StepParserMode }): StepParserClient {
  const mode = options?.mode ?? "auto";
  if (mode === "placeholder") {
    return createPlaceholderStepParserClient();
  }
  if (mode === "json_fixture") {
    return createJsonFixtureStepParserClient();
  }
  if (mode === "step_text") {
    return createStepTextAssemblyParserClient();
  }
  return {
    async parseStepFile(input) {
      const trimmed = input.fileText.trimStart();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = parseJsonFixture(input);
        if (parsed) {
          return parsed;
        }
      }
      return parseStepTextAssemblyGraph(input);
    },
  };
}

export function createMockStepParserClient(): StepParserClient {
  return {
    async parseStepFile(input) {
      return parseJsonFixture(input) ?? placeholderResult();
    },
  };
}
