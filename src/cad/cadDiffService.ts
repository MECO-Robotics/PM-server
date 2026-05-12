import type { CadAssemblyNode, CadPartDefinition, CadPartInstance, CadSnapshotMapping } from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";

function byStableSignature<T extends { stableSignature: string }>(items: T[]) {
  return new Map(items.map((item) => [item.stableSignature, item] as const));
}

function assemblyName(assemblies: CadAssemblyNode[], id: string | null) {
  return id ? assemblies.find((assembly) => assembly.id === id)?.name ?? null : null;
}

function partParentName(assemblies: CadAssemblyNode[], instance: CadPartInstance | undefined) {
  return instance ? assemblyName(assemblies, instance.parentAssemblyNodeId) : null;
}

function partParentKey(assembliesById: Map<string, CadAssemblyNode>, instance: CadPartInstance) {
  if (!instance.parentAssemblyNodeId) {
    return null;
  }
  return assembliesById.get(instance.parentAssemblyNodeId)?.stableSignature ?? instance.parentAssemblyNodeId;
}

function sourceSignatureForMapping(args: {
  mapping: CadSnapshotMapping;
  assembliesById: Map<string, CadAssemblyNode>;
  partsById: Map<string, CadPartDefinition>;
  instancesById: Map<string, CadPartInstance>;
}) {
  if (args.mapping.sourceKind === "ASSEMBLY_NODE") {
    return args.assembliesById.get(args.mapping.sourceId)?.stableSignature ?? null;
  }
  if (args.mapping.sourceKind === "PART_DEFINITION") {
    return args.partsById.get(args.mapping.sourceId)?.stableSignature ?? null;
  }
  return args.instancesById.get(args.mapping.sourceId)?.stableSignature ?? null;
}

function mappingKey(args: {
  mapping: CadSnapshotMapping;
  assembliesById: Map<string, CadAssemblyNode>;
  partsById: Map<string, CadPartDefinition>;
  instancesById: Map<string, CadPartInstance>;
}) {
  const stableSignature = sourceSignatureForMapping(args);
  return stableSignature
    ? `${args.mapping.sourceKind}:stable:${stableSignature}`
    : `${args.mapping.sourceKind}:source:${args.mapping.sourceId}`;
}

function compactAssembly(item: CadAssemblyNode) {
  return {
    id: item.id,
    sourceId: item.sourceId,
    name: item.name,
    instancePath: item.instancePath,
    stableSignature: item.stableSignature,
  };
}

function compactPart(item: CadPartDefinition) {
  return {
    id: item.id,
    sourceId: item.sourceId,
    name: item.name,
    partNumber: item.partNumber,
    stableSignature: item.stableSignature,
  };
}

function partDefinitionForInstance(parts: CadPartDefinition[], instance: CadPartInstance) {
  return instance.partDefinitionId ? parts.find((part) => part.id === instance.partDefinitionId) ?? null : null;
}

function partGroupKey(args: {
  assemblies: CadAssemblyNode[];
  parts: CadPartDefinition[];
  instance: CadPartInstance;
}) {
  const parent = args.assemblies.find((assembly) => assembly.id === args.instance.parentAssemblyNodeId) ?? null;
  const part = partDefinitionForInstance(args.parts, args.instance);
  return [
    parent?.stableSignature ?? args.instance.parentAssemblyNodeId ?? "root",
    part?.stableSignature ?? args.instance.stableSignature,
  ].join("|");
}

function groupedInstanceQuantities(args: {
  assemblies: CadAssemblyNode[];
  parts: CadPartDefinition[];
  instances: CadPartInstance[];
}) {
  const groups = new Map<string, {
    parentAssemblyName: string | null;
    partName: string;
    quantity: number;
    instancePaths: string[];
  }>();

  for (const instance of args.instances) {
    const key = partGroupKey({ assemblies: args.assemblies, parts: args.parts, instance });
    const parentAssemblyName = assemblyName(args.assemblies, instance.parentAssemblyNodeId);
    const part = partDefinitionForInstance(args.parts, instance);
    const group = groups.get(key) ?? {
      parentAssemblyName,
      partName: part?.name ?? instance.instancePath.split("/").filter(Boolean).at(-1) ?? instance.sourceId,
      quantity: 0,
      instancePaths: [],
    };
    group.quantity += Math.max(instance.quantity, 1);
    group.instancePaths.push(instance.instancePath);
    groups.set(key, group);
  }

  return groups;
}

function changedQuantityGroups(args: {
  previousAssemblies: CadAssemblyNode[];
  previousParts: CadPartDefinition[];
  previousInstances: CadPartInstance[];
  currentAssemblies: CadAssemblyNode[];
  currentParts: CadPartDefinition[];
  currentInstances: CadPartInstance[];
}) {
  const previousGroups = groupedInstanceQuantities({
    assemblies: args.previousAssemblies,
    parts: args.previousParts,
    instances: args.previousInstances,
  });
  const currentGroups = groupedInstanceQuantities({
    assemblies: args.currentAssemblies,
    parts: args.currentParts,
    instances: args.currentInstances,
  });

  return Array.from(currentGroups.entries())
    .map(([key, current]) => {
      const previous = previousGroups.get(key);
      if (!previous || previous.quantity === current.quantity) {
        return null;
      }
      const previousPaths = new Set(previous.instancePaths);
      const currentPaths = new Set(current.instancePaths);
      return {
        parentAssemblyName: current.parentAssemblyName,
        partName: current.partName,
        previousQuantity: previous.quantity,
        currentQuantity: current.quantity,
        addedInstancePaths: current.instancePaths.filter((path) => !previousPaths.has(path)),
        removedInstancePaths: previous.instancePaths.filter((path) => !currentPaths.has(path)),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function buildCadSnapshotDiff(args: { store: CadStore; snapshotId: string }) {
  const current = await args.store.findSnapshot(args.snapshotId);
  if (!current) {
    return null;
  }
  const previous = current.previousSnapshotId ? await args.store.findSnapshot(current.previousSnapshotId) : null;
  const currentAssemblies = await args.store.listAssemblyNodes(current.id);
  const currentParts = await args.store.listPartDefinitions(current.id);
  const currentInstances = await args.store.listPartInstances(current.id);
  const currentMappings = await args.store.listSnapshotMappings(current.id);
  const warnings = await args.store.listWarnings({ snapshotId: current.id });

  if (!previous) {
    return {
      previousSnapshotId: null,
      addedAssemblies: currentAssemblies.map(compactAssembly),
      removedAssemblies: [],
      movedAssemblies: [],
      addedParts: currentParts.map(compactPart),
      removedParts: [],
      addedPartInstances: currentInstances,
      removedPartInstances: [],
      movedPartInstances: [],
      mappingChanges: [],
      quantityChangedPartGroups: [],
      warnings,
    };
  }

  const previousAssemblies = await args.store.listAssemblyNodes(previous.id);
  const previousParts = await args.store.listPartDefinitions(previous.id);
  const previousInstances = await args.store.listPartInstances(previous.id);
  const previousMappings = await args.store.listSnapshotMappings(previous.id);
  const previousAssembliesBySignature = byStableSignature(previousAssemblies);
  const currentAssembliesBySignature = byStableSignature(currentAssemblies);
  const previousPartsBySignature = byStableSignature(previousParts);
  const currentPartsBySignature = byStableSignature(currentParts);
  const previousInstancesBySignature = byStableSignature(previousInstances);
  const currentInstancesBySignature = byStableSignature(currentInstances);
  const previousAssembliesById = new Map(previousAssemblies.map((assembly) => [assembly.id, assembly] as const));
  const previousPartsById = new Map(previousParts.map((part) => [part.id, part] as const));
  const previousInstancesById = new Map(previousInstances.map((instance) => [instance.id, instance] as const));
  const currentAssembliesById = new Map(currentAssemblies.map((assembly) => [assembly.id, assembly] as const));
  const currentPartsById = new Map(currentParts.map((part) => [part.id, part] as const));
  const currentInstancesById = new Map(currentInstances.map((instance) => [instance.id, instance] as const));

  const addedAssemblies = currentAssemblies
    .filter((assembly) => !previousAssembliesBySignature.has(assembly.stableSignature))
    .map(compactAssembly);
  const removedAssemblies = previousAssemblies
    .filter((assembly) => !currentAssembliesBySignature.has(assembly.stableSignature))
    .map(compactAssembly);
  const movedAssemblies = currentAssemblies
    .map((assembly) => {
      const prior = previousAssembliesBySignature.get(assembly.stableSignature);
      if (!prior || prior.parentSourceId === assembly.parentSourceId) {
        return null;
      }
      return {
        sourceId: assembly.sourceId,
        name: assembly.name,
        previousParentSourceId: prior.parentSourceId,
        currentParentSourceId: assembly.parentSourceId,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const movedPartInstances = currentInstances
    .map((instance) => {
      const prior = previousInstancesBySignature.get(instance.stableSignature);
      if (
        !prior ||
        partParentKey(previousAssembliesById, prior) === partParentKey(currentAssembliesById, instance)
      ) {
        return null;
      }
      return {
        sourceId: instance.sourceId,
        previousParentAssemblyName: partParentName(previousAssemblies, prior),
        currentParentAssemblyName: partParentName(currentAssemblies, instance),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const previousMappingByKey = new Map(
    previousMappings.map((mapping) => [
      mappingKey({
        mapping,
        assembliesById: previousAssembliesById,
        partsById: previousPartsById,
        instancesById: previousInstancesById,
      }),
      mapping,
    ] as const),
  );
  const mappingChanges = currentMappings
    .map((mapping) => {
      const prior = previousMappingByKey.get(
        mappingKey({
          mapping,
          assembliesById: currentAssembliesById,
          partsById: currentPartsById,
          instancesById: currentInstancesById,
        }),
      );
      if (!prior) {
        return mapping.targetKind === "UNMAPPED"
          ? { type: "new_unmapped_candidate", sourceKind: mapping.sourceKind, sourceId: mapping.sourceId }
          : null;
      }
      if (prior.targetKind !== mapping.targetKind || prior.targetId !== mapping.targetId) {
        return {
          type: "mapping_target_changed",
          sourceKind: mapping.sourceKind,
          sourceId: mapping.sourceId,
          previousTargetKind: prior.targetKind,
          previousTargetId: prior.targetId,
          currentTargetKind: mapping.targetKind,
          currentTargetId: mapping.targetId,
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    previousSnapshotId: previous.id,
    addedAssemblies,
    removedAssemblies,
    movedAssemblies,
    addedParts: currentParts.filter((part) => !previousPartsBySignature.has(part.stableSignature)).map(compactPart),
    removedParts: previousParts.filter((part) => !currentPartsBySignature.has(part.stableSignature)).map(compactPart),
    addedPartInstances: currentInstances.filter(
      (instance) => !previousInstancesBySignature.has(instance.stableSignature),
    ),
    removedPartInstances: previousInstances.filter(
      (instance) => !currentInstancesBySignature.has(instance.stableSignature),
    ),
    movedPartInstances,
    quantityChangedPartGroups: changedQuantityGroups({
      previousAssemblies,
      previousParts,
      previousInstances,
      currentAssemblies,
      currentParts,
      currentInstances,
    }),
    mappingChanges,
    warnings,
  };
}
