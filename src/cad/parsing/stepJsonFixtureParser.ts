import type {
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  NormalizedCadWarning,
  StepParseResult,
} from "../cadTypes";
import type { StepParserInput } from "./stepParserTypes";
import {
  assemblySignature,
  coerceInferredType,
  finalizeResult,
  partDefinitionSignature,
  partInstanceSignature,
} from "./stepParserShared";

interface JsonStepFixture {
  rootName?: string | null;
  units?: string | null;
  assemblyNodes?: Array<Partial<NormalizedCadAssemblyNode>>;
  partDefinitions?: Array<Partial<NormalizedCadPartDefinition>>;
  partInstances?: Array<Partial<NormalizedCadPartInstance>>;
  warnings?: NormalizedCadWarning[];
}

export function parseJsonFixture(input: StepParserInput): StepParseResult | null {
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
