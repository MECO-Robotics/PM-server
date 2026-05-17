import type {
  OnshapeAssemblyBomResponse,
  OnshapeReference,
} from "./onshapeTypes";
import {
  asRecord,
  type NativeRecord,
} from "./bom/onshapeBomReadUtils";
import { normalizeNativeBom } from "./bom/onshapeBomNativeNormalizer";

function normalizedOutput(raw: NativeRecord): OnshapeAssemblyBomResponse | null {
  const record = raw as Partial<OnshapeAssemblyBomResponse>;
  if (
    Array.isArray(record.assemblyNodes) &&
    Array.isArray(record.partDefinitions) &&
    Array.isArray(record.partInstances)
  ) {
    return {
      assemblyNodes: record.assemblyNodes,
      partDefinitions: record.partDefinitions,
      partInstances: record.partInstances,
      raw: record.raw ?? { payload: raw },
    };
  }
  return null;
}

function placeholderBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  return {
    assemblyNodes: [
      {
        sourceId: `assembly:${reference.elementId ?? reference.documentId}`,
        documentId: reference.documentId,
        elementId: reference.elementId,
        instanceId: reference.elementId,
        instancePath: `/${reference.elementId ?? reference.documentId}`,
        name: "Linked Onshape assembly",
        inferredType: "master_assembly",
        metadata: { normalization: "placeholder" },
      },
    ],
    partDefinitions: [],
    partInstances: [],
    raw: { payload: raw },
  };
}

export function normalizeOnshapeBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  const record = asRecord(raw);
  if (!record) {
    return placeholderBom(raw, reference);
  }

  return normalizedOutput(record) ?? normalizeNativeBom(record, reference) ?? placeholderBom(raw, reference);
}
