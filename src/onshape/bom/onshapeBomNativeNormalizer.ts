import type {
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadPartInstance,
  OnshapeAssemblyBomResponse,
  OnshapeReference,
} from "../onshapeTypes";
import {
  asRecord,
  type NativeRecord,
  readArray,
  readBoolean,
  readNumber,
  readRecord,
  readString,
} from "./onshapeBomReadUtils";

function rootAssemblySourceId(reference: OnshapeReference, root: NativeRecord | null) {
  return `assembly:${readString(root, ["id", "sourceId", "instanceId"]) ?? reference.elementId ?? reference.documentId}`;
}

function nativeInstanceId(instance: NativeRecord, index: number) {
  return readString(instance, ["id", "sourceId", "instanceId", "occurrenceId", "nodeId"]) ?? `instance-${index + 1}`;
}

function instanceSourceId(instance: NativeRecord, index: number) {
  const existing = readString(instance, ["sourceId"]);
  return existing ?? `instance:${nativeInstanceId(instance, index)}`;
}

function assemblySourceId(instance: NativeRecord, index: number) {
  const existing = readString(instance, ["sourceId"]);
  return existing ?? `assembly:${nativeInstanceId(instance, index)}`;
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

function rootAssemblyNode(args: {
  reference: OnshapeReference;
  root: NativeRecord | null;
  rootSourceId: string;
  rootName: string;
  rootPath: string;
}): NormalizedCadAssemblyNode {
  return {
    sourceId: args.rootSourceId,
    documentId: readString(args.root, ["documentId"]) ?? args.reference.documentId,
    elementId: readString(args.root, ["elementId"]) ?? args.reference.elementId,
    instanceId: readString(args.root, ["id", "instanceId"]) ?? args.reference.elementId,
    instancePath: readString(args.root, ["instancePath", "fullPathAsString"]) ?? args.rootPath,
    name: args.rootName,
    inferredType: "master_assembly",
    metadata: { normalization: "native_onshape" },
  };
}

function normalizeAssemblyInstance(args: {
  instance: NativeRecord;
  index: number;
  name: string;
  rootPath: string;
  rootSourceId: string;
  reference: OnshapeReference;
  sourceIdByNativeId: Map<string, string>;
}): NormalizedCadAssemblyNode {
  const sourceId = assemblySourceId(args.instance, args.index);
  return {
    sourceId,
    parentSourceId: parentAssemblySourceId(args),
    documentId: readString(args.instance, ["documentId"]) ?? args.reference.documentId,
    elementId: readString(args.instance, ["elementId"]) ?? args.reference.elementId,
    instanceId: nativeInstanceId(args.instance, args.index),
    instancePath: instancePath(args.instance, args.name, args.rootPath),
    name: args.name,
    inferredType: "subassembly",
    metadata: {
      normalization: "native_onshape",
      nativeType: readString(args.instance, ["type", "instanceType", "nodeType"]) ?? "Assembly",
    },
  };
}

export function normalizeNativeBom(raw: NativeRecord, reference: OnshapeReference): OnshapeAssemblyBomResponse | null {
  const root = asRecord(raw.rootAssembly);
  const nativeInstances = root ? readArray(root, ["instances"]) : readArray(raw, ["instances"]);
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
  assemblyNodes.push(rootAssemblyNode({ reference, root, rootSourceId, rootName, rootPath }));
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
      sourceIdByNativeId.set(nativeId, assemblySourceId(instance, index));
      assemblyNodes.push(normalizeAssemblyInstance({ instance, index, name, rootPath, rootSourceId, reference, sourceIdByNativeId }));
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
