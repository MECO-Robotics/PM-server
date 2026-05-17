import type {
  CadAssemblyInferredType,
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  NormalizedCadWarning,
  StepParseResult,
} from "../cadTypes";
import {
  inferAssemblyType,
  isGenericCadName,
  normalizeCadName,
  sourceNameWithParent,
} from "../cadUtils";

export function assemblySignature(
  node: Pick<NormalizedCadAssemblyNode, "instancePath" | "name" | "sourceId">,
  parentName: string | null,
) {
  if (node.instancePath?.trim()) {
    return `asm:path:${node.instancePath.trim()}`;
  }
  if (node.name?.trim()) {
    return `asm:name-parent:${sourceNameWithParent(node.name, parentName)}`;
  }
  return `asm:source:${node.sourceId}`;
}

export function partDefinitionSignature(part: Pick<NormalizedCadPartDefinition, "partNumber" | "name" | "sourceId">) {
  if (part.partNumber?.trim()) {
    return `part:number:${part.partNumber.trim().toUpperCase()}`;
  }
  if (part.name?.trim()) {
    return `part:name:${normalizeCadName(part.name)}`;
  }
  return `part:source:${part.sourceId}`;
}

export function partInstanceSignature(instance: Pick<NormalizedCadPartInstance, "instancePath" | "sourceId">) {
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

export function finalizeResult(result: Omit<StepParseResult, "rawStats"> & { rawStats?: Partial<StepParseResult["rawStats"]> }): StepParseResult {
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
      ...result.rawStats,
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

export function coerceInferredType(value: unknown, name: string, depth: number): CadAssemblyInferredType {
  if (
    value === "ROOT" ||
    value === "SUBSYSTEM_CANDIDATE" ||
    value === "MECHANISM_CANDIDATE" ||
    value === "COMPONENT_ASSEMBLY_CANDIDATE" ||
    value === "SUBASSEMBLY" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  return inferAssemblyType(name, depth);
}

export function createParserWarning(args: {
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
