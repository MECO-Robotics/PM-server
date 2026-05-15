import type { CadPartDefinition, CadPartInstance, CadSnapshotMapping } from "./cadTypes";
import { normalizeCadName } from "./cadUtils";

export interface CadGroupedPartInstance {
  kind: "part_instance_group";
  groupId: string;
  parentAssemblyNodeId: string | null;
  partDefinitionId: string | null;
  partDefinition: CadPartDefinition | null;
  displayName: string;
  quantity: number;
  instanceIds: string[];
  sourceIds: string[];
  instancePaths: string[];
  stableSignatures: string[];
  mapping: CadSnapshotMapping | null;
  mappings: CadSnapshotMapping[];
  hasMixedMappings: boolean;
  hasMixedMetadata: boolean;
  representativeInstanceId: string;
}

function metadataText(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function instanceDisplayName(instance: CadPartInstance, partDefinition: CadPartDefinition | null) {
  return partDefinition?.name ?? instance.instancePath.split("/").filter(Boolean).at(-1) ?? instance.sourceId;
}

function partDefinitionKey(instance: CadPartInstance, partDefinition: CadPartDefinition | null) {
  if (instance.partDefinitionId) {
    return `part-definition:${instance.partDefinitionId}`;
  }
  if (partDefinition?.stableSignature) {
    return `part-signature:${partDefinition.stableSignature}`;
  }
  return `part-name:${normalizeCadName(instanceDisplayName(instance, partDefinition)) || instance.sourceId}`;
}

function groupMetadata(instance: CadPartInstance, partDefinition: CadPartDefinition | null) {
  return {
    configuration: metadataText(instance.metadataJson, "configuration") || metadataText(partDefinition?.metadataJson ?? {}, "configuration"),
    material: metadataText(instance.metadataJson, "material") || (partDefinition?.material ?? ""),
  };
}

function mappingComparisonKey(mapping: CadSnapshotMapping | undefined) {
  return mapping
    ? `${mapping.targetKind}:${mapping.targetId ?? ""}:${mapping.confidence}:${mapping.status}`
    : "missing";
}

export function partInstanceRuleSignature(
  instance: CadPartInstance,
  definitionsById: Map<string, CadPartDefinition>,
) {
  const partDefinition = instance.partDefinitionId ? definitionsById.get(instance.partDefinitionId) ?? null : null;
  return partDefinition?.stableSignature ?? instance.stableSignature;
}

export function groupPartInstances(args: {
  instances: CadPartInstance[];
  definitionsById: Map<string, CadPartDefinition>;
  mappingsBySourceId?: Map<string, CadSnapshotMapping>;
}) {
  const groups = new Map<string, { metadataKeys: Set<string>; instances: CadPartInstance[] }>();

  for (const instance of args.instances) {
    const partDefinition = instance.partDefinitionId ? args.definitionsById.get(instance.partDefinitionId) ?? null : null;
    const metadata = groupMetadata(instance, partDefinition);
    const key = [
      instance.parentAssemblyNodeId ?? "root",
      partDefinitionKey(instance, partDefinition),
      metadata.configuration,
      metadata.material,
    ].join("|");
    const group = groups.get(key) ?? { metadataKeys: new Set<string>(), instances: [] };
    group.metadataKeys.add(JSON.stringify(metadata));
    group.instances.push(instance);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, group]): CadGroupedPartInstance => {
    const first = group.instances[0]!;
    const partDefinition = first.partDefinitionId ? args.definitionsById.get(first.partDefinitionId) ?? null : null;
    const mappings = group.instances
      .map((instance) => args.mappingsBySourceId?.get(instance.id) ?? null)
      .filter((mapping): mapping is CadSnapshotMapping => Boolean(mapping));
    const mappingKeys = new Set(group.instances.map((instance) => mappingComparisonKey(args.mappingsBySourceId?.get(instance.id))));
    return {
      kind: "part_instance_group",
      groupId: `part-instance-group:${key}`,
      parentAssemblyNodeId: first.parentAssemblyNodeId,
      partDefinitionId: first.partDefinitionId,
      partDefinition,
      displayName: instanceDisplayName(first, partDefinition),
      quantity: group.instances.reduce((total, instance) => total + Math.max(instance.quantity, 1), 0),
      instanceIds: group.instances.map((instance) => instance.id),
      sourceIds: group.instances.map((instance) => instance.id),
      instancePaths: group.instances.map((instance) => instance.instancePath),
      stableSignatures: group.instances.map((instance) => instance.stableSignature),
      mapping: mappingKeys.size === 1 ? args.mappingsBySourceId?.get(first.id) ?? null : null,
      mappings,
      hasMixedMappings: mappingKeys.size > 1,
      hasMixedMetadata: group.metadataKeys.size > 1,
      representativeInstanceId: first.id,
    };
  });
}
