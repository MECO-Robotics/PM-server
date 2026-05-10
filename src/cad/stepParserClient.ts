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

export function createMockStepParserClient(): StepParserClient {
  return {
    async parseStepFile(input) {
      return parseJsonFixture(input) ?? placeholderResult();
    },
  };
}
