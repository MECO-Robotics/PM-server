import type {
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  OnshapeAssemblyBomResponse,
  OnshapeReference,
} from "./onshapeTypes";

type NativeRecord = Record<string, unknown>;

function asRecord(value: unknown): NativeRecord | null {
  return typeof value === "object" && value !== null ? (value as NativeRecord) : null;
}

function readString(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumber(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readBoolean(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function readRecord(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = asRecord(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readArray(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

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

function rootAssemblySourceId(reference: OnshapeReference, root: NativeRecord | null) {
  return `assembly:${readString(root, ["id", "sourceId", "instanceId"]) ?? reference.elementId ?? reference.documentId}`;
}

function nativeInstanceId(instance: NativeRecord, index: number) {
  return readString(instance, ["id", "sourceId", "instanceId", "occurrenceId", "nodeId"]) ?? `instance-${index + 1}`;
}

function instanceSourceId(instance: NativeRecord, index: number) {
  const existing = readString(instance, ["sourceId"]);
  if (existing) {
    return existing;
  }

  return `instance:${nativeInstanceId(instance, index)}`;
}

function assemblySourceId(instance: NativeRecord, index: number) {
  const existing = readString(instance, ["sourceId"]);
  if (existing) {
    return existing;
  }

  return `assembly:${nativeInstanceId(instance, index)}`;
}

function partDefinitionSourceId(instance: NativeRecord, reference: OnshapeReference, index: number) {
  const existing = readString(instance, ["partDefinitionSourceId"]);
  if (existing) {
    return existing;
  }

  const documentId = readString(instance, ["documentId"]) ?? reference.documentId;
  const elementId = readString(instance, ["elementId"]) ?? reference.elementId ?? "";
  const partId = readString(instance, ["partId"]) ?? nativeInstanceId(instance, index);
  const configuration = readString(instance, ["fullConfiguration", "configuration"]) ?? "default";
  return `part:${documentId}:${elementId}:${partId}:${configuration}`;
}

function instancePath(instance: NativeRecord, fallbackName: string, parentPath: string) {
  return readString(instance, ["instancePath", "fullPathAsString", "pathString"]) ?? `${parentPath}/${fallbackName}`;
}

function isPartInstance(instance: NativeRecord) {
  const type = readString(instance, ["type", "instanceType", "nodeType"])?.toLowerCase();
  return Boolean(type?.includes("part") || readString(instance, ["partId", "partNumber"]));
}

function isAssemblyInstance(instance: NativeRecord) {
  const type = readString(instance, ["type", "instanceType", "nodeType"])?.toLowerCase();
  return Boolean(type?.includes("assembly"));
}

function parentAssemblySourceId(args: {
  instance: NativeRecord;
  rootSourceId: string;
  sourceIdByNativeId: Map<string, string>;
}) {
  const nativeParentId = readString(args.instance, [
    "parentId",
    "parentInstanceId",
    "parentSourceId",
    "parentNodeId",
  ]);
  if (!nativeParentId) {
    return args.rootSourceId;
  }
  return args.sourceIdByNativeId.get(nativeParentId) ?? nativeParentId;
}

function customProperties(instance: NativeRecord) {
  return readRecord(instance, ["customProperties", "properties", "metadata"]);
}

function normalizeNativeBom(raw: NativeRecord, reference: OnshapeReference): OnshapeAssemblyBomResponse | null {
  const root = asRecord(raw.rootAssembly);
  const nativeInstances = root
    ? readArray(root, ["instances"])
    : readArray(raw, ["instances"]);
  if (!root && nativeInstances.length === 0) {
    return null;
  }

  const assemblyNodes: NormalizedCadAssemblyNode[] = [];
  const partDefinitionsBySourceId = new Map<string, NormalizedCadPartDefinition>();
  const partInstances: NormalizedCadPartInstance[] = [];
  const sourceIdByNativeId = new Map<string, string>();
  const rootSourceId = rootAssemblySourceId(reference, root);
  const rootName = readString(root, ["name", "elementName"]) ?? "Linked Onshape assembly";
  const rootPath = `/${rootName}`;

  assemblyNodes.push({
    sourceId: rootSourceId,
    documentId: readString(root, ["documentId"]) ?? reference.documentId,
    elementId: readString(root, ["elementId"]) ?? reference.elementId,
    instanceId: readString(root, ["id", "instanceId"]) ?? reference.elementId,
    instancePath: readString(root, ["instancePath", "fullPathAsString"]) ?? rootPath,
    name: rootName,
    inferredType: "master_assembly",
    metadata: { normalization: "native_onshape" },
  });
  sourceIdByNativeId.set(readString(root, ["id", "instanceId"]) ?? rootSourceId, rootSourceId);

  nativeInstances.forEach((value, index) => {
    const instance = asRecord(value);
    if (instance && isAssemblyInstance(instance) && !isPartInstance(instance)) {
      sourceIdByNativeId.set(nativeInstanceId(instance, index), assemblySourceId(instance, index));
    }
  });

  nativeInstances.forEach((value, index) => {
    const instance = asRecord(value);
    if (!instance) {
      return;
    }

    const nativeId = nativeInstanceId(instance, index);
    const name = readString(instance, ["name", "partName"]) ?? nativeId;
    if (isAssemblyInstance(instance) && !isPartInstance(instance)) {
      const sourceId = assemblySourceId(instance, index);
      sourceIdByNativeId.set(nativeId, sourceId);
      assemblyNodes.push({
        sourceId,
        parentSourceId: parentAssemblySourceId({ instance, rootSourceId, sourceIdByNativeId }),
        documentId: readString(instance, ["documentId"]) ?? reference.documentId,
        elementId: readString(instance, ["elementId"]) ?? reference.elementId,
        instanceId: nativeId,
        instancePath: instancePath(instance, name, rootPath),
        name,
        inferredType: "subassembly",
        metadata: {
          normalization: "native_onshape",
          nativeType: readString(instance, ["type", "instanceType", "nodeType"]) ?? "Assembly",
        },
      });
      return;
    }

    if (!isPartInstance(instance)) {
      return;
    }

    const definitionSourceId = partDefinitionSourceId(instance, reference, index);
    const documentId = readString(instance, ["documentId"]) ?? reference.documentId;
    const elementId = readString(instance, ["elementId"]) ?? reference.elementId;
    const partId = readString(instance, ["partId"]);
    const configuration = readString(instance, ["fullConfiguration", "configuration"]);
    if (!partDefinitionsBySourceId.has(definitionSourceId)) {
      partDefinitionsBySourceId.set(definitionSourceId, {
        sourceId: definitionSourceId,
        documentId,
        elementId,
        partId,
        versionId: readString(instance, ["documentVersion", "versionId"]),
        microversionId: readString(instance, ["documentMicroversion", "microversionId"]),
        name: readString(instance, ["partName", "name"]) ?? name,
        partNumber: readString(instance, ["partNumber"]),
        material: readString(instance, ["material"]),
        mass: readNumber(instance, ["mass", "massKg"]),
        configuration,
        customProperties: customProperties(instance),
      });
    }

    partInstances.push({
      sourceId: instanceSourceId(instance, index),
      partDefinitionSourceId: definitionSourceId,
      parentAssemblySourceId: parentAssemblySourceId({ instance, rootSourceId, sourceIdByNativeId }),
      documentId,
      elementId,
      instanceId: nativeId,
      partId,
      instancePath: instancePath(instance, name, rootPath),
      quantity: readNumber(instance, ["quantity"]),
      suppressed: readBoolean(instance, ["suppressed"]),
      configuration,
      transform: instance.transform ?? instance.transformMatrix,
      metadata: {
        normalization: "native_onshape",
        nativeType: readString(instance, ["type", "instanceType", "nodeType"]) ?? "Part",
      },
    });
  });

  return {
    assemblyNodes,
    partDefinitions: [...partDefinitionsBySourceId.values()],
    partInstances,
    raw: { payload: raw },
  };
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
