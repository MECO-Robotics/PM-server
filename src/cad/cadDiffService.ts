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

function mappingKey(mapping: CadSnapshotMapping) {
  return `${mapping.sourceKind}:${mapping.sourceId}`;
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
      if (!prior || prior.parentAssemblyNodeId === instance.parentAssemblyNodeId) {
        return null;
      }
      return {
        sourceId: instance.sourceId,
        previousParentAssemblyName: partParentName(previousAssemblies, prior),
        currentParentAssemblyName: partParentName(currentAssemblies, instance),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const previousMappingByKey = new Map(previousMappings.map((mapping) => [mappingKey(mapping), mapping] as const));
  const mappingChanges = currentMappings
    .map((mapping) => {
      const prior = previousMappingByKey.get(mappingKey(mapping));
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
    mappingChanges,
    warnings,
  };
}
