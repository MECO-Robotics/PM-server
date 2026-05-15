import type { OnshapeRuntimeStore } from "./cadStore";
import type {
  CadImportWarning,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  NormalizedCadPartDefinition,
  OnshapeDocumentRef,
} from "./onshapeTypes";

function warning(input: Omit<CadImportWarning, "id" | "createdAt">) {
  return input;
}

function customPropertyValue(part: NormalizedCadPartDefinition, names: string[]) {
  const properties = part.customProperties ?? {};
  for (const name of names) {
    const value = properties[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isCotsPart(part: CadPartDefinition) {
  const source = String(part.customPropertiesJson.source ?? part.customPropertiesJson.partSource ?? "").toLowerCase();
  return source.includes("cots") || source.includes("purchase");
}

function fallbackNormalizedPart(part: CadPartDefinition): NormalizedCadPartDefinition {
  return {
    sourceId: part.sourceId,
    documentId: part.documentId,
    elementId: part.elementId ?? undefined,
    partId: part.partId ?? undefined,
    name: part.name,
  };
}

export function addReferenceWarnings(store: OnshapeRuntimeStore, runId: string, ref: OnshapeDocumentRef) {
  if (ref.referenceType === "workspace") {
    store.appendWarning(
      warning({
        importRunId: runId,
        snapshotId: null,
        severity: "warning",
        code: "workspace_reference_not_immutable",
        title: "Workspace reference is draft-like",
        message:
          "This reference points to a workspace. For review or release, create an Onshape version and sync that immutable version instead.",
        cadAssemblyNodeId: null,
        cadPartDefinitionId: null,
        cadPartInstanceId: null,
        metadataJson: { documentRefId: ref.id },
      }),
    );
  }

  if (!ref.elementId) {
    store.appendWarning(
      warning({
        importRunId: runId,
        snapshotId: null,
        severity: "warning",
        code: "missing_element_id",
        title: "Onshape URL is missing an element ID",
        message: "Link-only storage is allowed, but assembly sync usually needs an assembly element ID.",
        cadAssemblyNodeId: null,
        cadPartDefinitionId: null,
        cadPartInstanceId: null,
        metadataJson: { documentRefId: ref.id },
      }),
    );
  }
}

export function addBudgetStopWarning(args: {
  store: OnshapeRuntimeStore;
  runId: string;
  snapshotId: string | null;
  syncLevel: string;
  stoppedReason: string;
}) {
  args.store.appendWarning(
    warning({
      importRunId: args.runId,
      snapshotId: args.snapshotId,
      severity: "warning",
      code: "api_budget_reached",
      title: "Sync stopped early",
      message: `Onshape sync stopped before completion: ${args.stoppedReason}.`,
      cadAssemblyNodeId: null,
      cadPartDefinitionId: null,
      cadPartInstanceId: null,
      metadataJson: { syncLevel: args.syncLevel },
    }),
  );
}

export function addGraphWarnings(args: {
  store: OnshapeRuntimeStore;
  runId: string;
  snapshot: CadSnapshot;
  assemblyNodes: ReturnType<OnshapeRuntimeStore["listAssemblyNodes"]>;
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
  normalizedPartDefinitions: NormalizedCadPartDefinition[];
}) {
  const normalizedPartsById = new Map(args.normalizedPartDefinitions.map((part) => [part.sourceId, part] as const));

  for (const node of args.assemblyNodes) {
    if (!node.subsystemId && !node.mechanismId) {
      args.store.appendWarning(
        warning({
          importRunId: args.runId,
          snapshotId: args.snapshot.id,
          severity: "info",
          code: "assembly_mapping_missing",
          title: "Assembly mapping is not set",
          message: `${node.name} was imported as a CAD assembly node but is not mapped to a Mission Control subsystem or mechanism yet.`,
          cadAssemblyNodeId: node.id,
          cadPartDefinitionId: null,
          cadPartInstanceId: null,
          metadataJson: { inferredType: node.inferredType, instancePath: node.instancePath },
        }),
      );
    }
  }

  for (const part of args.partDefinitions) {
    const normalized = normalizedPartsById.get(part.sourceId) ?? fallbackNormalizedPart(part);
    addPartMetadataWarnings(args.store, args.runId, args.snapshot.id, part, normalized);
  }

  for (const instance of args.partInstances) {
    if (instance.suppressed) {
      args.store.appendWarning(
        warning({
          importRunId: args.runId,
          snapshotId: args.snapshot.id,
          severity: "info",
          code: "suppressed_part_imported",
          title: "Suppressed part appears in import",
          message: `${instance.instancePath} is suppressed but still appears in the imported structure.`,
          cadAssemblyNodeId: null,
          cadPartDefinitionId: instance.cadPartDefinitionId,
          cadPartInstanceId: instance.id,
          metadataJson: { instancePath: instance.instancePath },
        }),
      );
    }
  }
}

function addPartMetadataWarnings(
  store: OnshapeRuntimeStore,
  runId: string,
  snapshotId: string,
  part: CadPartDefinition,
  normalized: NormalizedCadPartDefinition,
) {
  if (!part.material) {
    store.appendWarning(
      warning({
        importRunId: runId,
        snapshotId,
        severity: "warning",
        code: "part_material_missing",
        title: "Part material is missing",
        message: `${part.name} does not include material metadata in the imported CAD snapshot.`,
        cadAssemblyNodeId: null,
        cadPartDefinitionId: part.id,
        cadPartInstanceId: null,
        metadataJson: { partId: part.partId, partNumber: part.partNumber },
      }),
    );
  }

  if (!customPropertyValue(normalized, ["manufacturingMethod", "manufacturing_method"])) {
    store.appendWarning(
      warning({
        importRunId: runId,
        snapshotId,
        severity: "warning",
        code: "manufacturing_method_missing",
        title: "Manufacturing method is missing",
        message: `${part.name} does not include manufacturing method metadata.`,
        cadAssemblyNodeId: null,
        cadPartDefinitionId: part.id,
        cadPartInstanceId: null,
        metadataJson: { partId: part.partId },
      }),
    );
  }

  if (isCotsPart(part) && !customPropertyValue(normalized, ["vendor", "supplier", "purchaseVendor"])) {
    store.appendWarning(
      warning({
        importRunId: runId,
        snapshotId,
        severity: "warning",
        code: "cots_vendor_missing",
        title: "COTS vendor metadata is missing",
        message: `${part.name} appears to be purchased/COTS but has no vendor metadata.`,
        cadAssemblyNodeId: null,
        cadPartDefinitionId: part.id,
        cadPartInstanceId: null,
        metadataJson: { partId: part.partId },
      }),
    );
  }
}
