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

function unrecognizedBomError() {
  return new Error("Onshape BOM payload was not recognized.");
}

export function normalizeOnshapeBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  const record = asRecord(raw);
  if (!record) {
    throw unrecognizedBomError();
  }

  const normalized = normalizedOutput(record) ?? normalizeNativeBom(record, reference);
  if (!normalized) {
    throw unrecognizedBomError();
  }
  return normalized;
}
