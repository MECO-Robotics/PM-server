import { groupPartInstances } from "../cadInstanceGrouping";
import type { CadStore } from "../cadStoreTypes";

function findSourceName(args: {
  sourceKind: string;
  sourceId: string;
  assemblies: Awaited<ReturnType<CadStore["listAssemblyNodes"]>>;
  parts: Awaited<ReturnType<CadStore["listPartDefinitions"]>>;
  instances: Awaited<ReturnType<CadStore["listPartInstances"]>>;
}) {
  if (args.sourceKind === "ASSEMBLY_NODE") {
    return args.assemblies.find((item) => item.id === args.sourceId)?.name ?? args.sourceId;
  }
  if (args.sourceKind === "PART_DEFINITION") {
    return args.parts.find((item) => item.id === args.sourceId)?.name ?? args.sourceId;
  }
  const instance = args.instances.find((item) => item.id === args.sourceId);
  return instance?.instancePath.split("/").filter(Boolean).at(-1) ?? args.sourceId;
}

function findParentAssemblyName(args: {
  sourceKind: string;
  sourceId: string;
  assemblies: Awaited<ReturnType<CadStore["listAssemblyNodes"]>>;
  instances: Awaited<ReturnType<CadStore["listPartInstances"]>>;
}) {
  if (args.sourceKind === "ASSEMBLY_NODE") {
    const assembly = args.assemblies.find((item) => item.id === args.sourceId);
    return assembly?.parentAssemblyNodeId
      ? args.assemblies.find((item) => item.id === assembly.parentAssemblyNodeId)?.name ?? null
      : null;
  }
  if (args.sourceKind === "PART_INSTANCE") {
    const instance = args.instances.find((item) => item.id === args.sourceId);
    return instance?.parentAssemblyNodeId
      ? args.assemblies.find((item) => item.id === instance.parentAssemblyNodeId)?.name ?? null
      : null;
  }
  return null;
}

export async function snapshotMappings(store: CadStore, snapshotId: string) {
  const assemblies = await store.listAssemblyNodes(snapshotId);
  const parts = await store.listPartDefinitions(snapshotId);
  const instances = await store.listPartInstances(snapshotId);
  const mappings = await store.listSnapshotMappings(snapshotId);
  return Promise.all(mappings.map(async (mapping) => ({
    ...mapping,
    sourceName: findSourceName({ sourceKind: mapping.sourceKind, sourceId: mapping.sourceId, assemblies, parts, instances }),
    parentAssemblyName: findParentAssemblyName({ sourceKind: mapping.sourceKind, sourceId: mapping.sourceId, assemblies, instances }),
    source: [...assemblies, ...parts, ...instances].find((item) => item.id === mapping.sourceId) ?? null,
    rule: mapping.mappingRuleId ? await store.findMappingRule(mapping.mappingRuleId) : null,
  })));
}

export async function groupedSnapshotMappings(store: CadStore, snapshotId: string) {
  const rawMappings = await snapshotMappings(store, snapshotId);
  const parts = await store.listPartDefinitions(snapshotId);
  const instances = await store.listPartInstances(snapshotId);
  const assemblies = await store.listAssemblyNodes(snapshotId);
  const definitionsById = new Map(parts.map((part) => [part.id, part] as const));
  const mappingsBySourceId = new Map((await store.listSnapshotMappings(snapshotId)).map((mapping) => [mapping.sourceId, mapping]));
  const partInstanceMappingIds = new Set<string>();
  const groups = groupPartInstances({ instances, definitionsById, mappingsBySourceId })
    .filter((group) => group.quantity > 1)
    .map((group) => {
      for (const mapping of group.mappings) {
        partInstanceMappingIds.add(mapping.id);
      }
      const representativeMapping = group.mapping ?? group.mappings[0] ?? null;
      return {
        ...(representativeMapping ?? {}),
        id: group.groupId,
        kind: "part_instance_group",
        snapshotId,
        mappingRuleId: group.hasMixedMappings ? null : representativeMapping?.mappingRuleId ?? null,
        sourceKind: "PART_INSTANCE",
        sourceId: group.representativeInstanceId,
        sourceIds: group.instanceIds,
        sourceName: group.displayName,
        parentAssemblyName: group.parentAssemblyNodeId
          ? assemblies.find((assembly) => assembly.id === group.parentAssemblyNodeId)?.name ?? null
          : null,
        source: group,
        targetKind: group.hasMixedMappings ? "UNMAPPED" : representativeMapping?.targetKind ?? "UNMAPPED",
        targetId: group.hasMixedMappings ? null : representativeMapping?.targetId ?? null,
        confidence: group.hasMixedMappings ? "LOW" : representativeMapping?.confidence ?? "LOW",
        status: group.hasMixedMappings ? "NEEDS_REVIEW" : representativeMapping?.status ?? "NEEDS_REVIEW",
        rule: !group.hasMixedMappings && representativeMapping?.mappingRuleId
          ? rawMappings.find((mapping) => mapping.id === representativeMapping.id)?.rule ?? null
          : null,
        updatedAt: representativeMapping?.updatedAt ?? null,
        quantity: group.quantity,
        instanceIds: group.instanceIds,
        instancePaths: group.instancePaths,
        stableSignatures: group.stableSignatures,
        representativeInstanceId: group.representativeInstanceId,
        hasMixedMappings: group.hasMixedMappings,
        hasMixedMetadata: group.hasMixedMetadata,
        mappings: group.mappings,
        warningCode: group.hasMixedMappings ? "cad_instance_group_mixed_mappings" : null,
        warning: group.hasMixedMappings ? "Repeated instances have mixed mappings. Review before finalizing." : null,
      };
    });
  return [
    ...rawMappings.filter((mapping) => mapping.sourceKind !== "PART_INSTANCE" || !partInstanceMappingIds.has(mapping.id)),
    ...groups,
  ];
}

export async function buildTree(store: CadStore, snapshotId: string, groupInstances = true) {
  const assemblies = await store.listAssemblyNodes(snapshotId);
  const instances = await store.listPartInstances(snapshotId);
  const definitions = await store.listPartDefinitions(snapshotId);
  const mappingsBySourceId = new Map((await store.listSnapshotMappings(snapshotId)).map((mapping) => [mapping.sourceId, mapping]));
  const definitionsById = new Map(definitions.map((part) => [part.id, part] as const));
  const instancesById = new Map(instances.map((instance) => [instance.id, instance] as const));
  const byParent = new Map<string | null, typeof assemblies>();
  for (const assembly of assemblies) {
    const key = assembly.parentAssemblyNodeId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), assembly]);
  }
  const instancesByParent = new Map<string | null, typeof instances>();
  for (const instance of instances) {
    const key = instance.parentAssemblyNodeId ?? null;
    instancesByParent.set(key, [...(instancesByParent.get(key) ?? []), instance]);
  }
  const visit = (assembly: (typeof assemblies)[number]): unknown => ({
    ...assembly,
    mapping: mappingsBySourceId.get(assembly.id) ?? null,
    children: (byParent.get(assembly.id) ?? []).map(visit),
    partInstances: groupInstances
      ? groupPartInstances({ instances: instancesByParent.get(assembly.id) ?? [], definitionsById, mappingsBySourceId }).map((group) => {
          if (group.quantity > 1) {
            return group;
          }
          const instance = instancesById.get(group.representativeInstanceId);
          return instance
            ? { ...instance, mapping: mappingsBySourceId.get(instance.id) ?? null, partDefinition: definitions.find((part) => part.id === instance.partDefinitionId) ?? null }
            : group;
        })
      : (instancesByParent.get(assembly.id) ?? []).map((instance) => ({
          ...instance,
          mapping: mappingsBySourceId.get(instance.id) ?? null,
          partDefinition: definitions.find((part) => part.id === instance.partDefinitionId) ?? null,
        })),
  });
  return { snapshotId, rootNodes: (byParent.get(null) ?? []).map(visit) };
}
