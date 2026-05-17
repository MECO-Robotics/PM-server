import type {
  CadAssemblyNode,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  OnshapeDocumentRef,
} from "./onshapeTypes";
import type { OnshapeRuntimeState } from "./cadStoreTypes";
import {
  clone,
  isImmutableReference,
  nextId,
  normalizeName,
  nowIso,
} from "./cadStoreUtils";

type AssemblyNodeInput = Parameters<import("./cadStoreTypes").OnshapeRuntimeStore["upsertAssemblyNodes"]>[1][number];
type PartDefinitionInput = Parameters<import("./cadStoreTypes").OnshapeRuntimeStore["upsertPartDefinitions"]>[1][number];
type PartInstanceInput = Parameters<import("./cadStoreTypes").OnshapeRuntimeStore["upsertPartInstances"]>[1][number];

function findExistingSnapshot(state: OnshapeRuntimeState, ref: OnshapeDocumentRef) {
  if (!isImmutableReference(ref)) {
    return null;
  }
  return state.snapshots.find(
    (snapshot) =>
      snapshot.onshapeDocumentRefId === ref.id &&
      snapshot.documentId === ref.documentId &&
      snapshot.versionId === (ref.versionId ?? null) &&
      snapshot.microversionId === (ref.microversionId ?? null) &&
      snapshot.elementId === (ref.elementId ?? null),
  ) ?? null;
}

function partIdentity(part: PartDefinitionInput) {
  if (part.missionControlExternalKey) {
    return `external:${part.missionControlExternalKey}`;
  }
  if (part.partId) {
    return `onshape:${part.documentId}:${part.elementId ?? ""}:${part.partId}:${part.configuration ?? ""}`;
  }
  return `source:${part.sourceId}`;
}

function existingPartIdentity(part: CadPartDefinition) {
  if (part.missionControlExternalKey) {
    return `external:${part.missionControlExternalKey}`;
  }
  if (part.partId) {
    return `onshape:${part.documentId}:${part.elementId ?? ""}:${part.partId}:${part.configuration ?? ""}`;
  }
  return `source:${part.sourceId}`;
}

export function buildCadGraphStore(state: OnshapeRuntimeState) {
  return {
    upsertSnapshot(input: {
      documentRef: OnshapeDocumentRef;
      importRunId: string;
      label: string;
      createdBy?: string | null;
      source?: CadSnapshot["source"];
      notes?: string | null;
    }) {
      const existing = findExistingSnapshot(state, input.documentRef);
      if (existing) {
        existing.importRunId = input.importRunId;
        existing.label = input.label;
        existing.notes = input.notes ?? existing.notes;
        return clone(existing);
      }

      const previous = state.snapshots
        .filter((snapshot) => snapshot.onshapeDocumentRefId === input.documentRef.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      const snapshot: CadSnapshot = {
        id: nextId("cad-snapshot", state.snapshots.map((item) => item.id)),
        seasonId: input.documentRef.seasonId,
        projectId: input.documentRef.projectId,
        subsystemId: input.documentRef.subsystemId,
        mechanismId: input.documentRef.mechanismId,
        onshapeDocumentRefId: input.documentRef.id,
        importRunId: input.importRunId,
        label: input.label,
        source: input.source ?? "manual_snapshot",
        documentId: input.documentRef.documentId,
        workspaceId: input.documentRef.workspaceId ?? null,
        versionId: input.documentRef.versionId ?? null,
        microversionId: input.documentRef.microversionId ?? null,
        elementId: input.documentRef.elementId ?? null,
        createdBy: input.createdBy ?? null,
        createdAt: nowIso(),
        previousSnapshotId: previous?.id ?? null,
        notes: input.notes ?? null,
        immutable: isImmutableReference(input.documentRef),
      };
      state.snapshots.push(snapshot);
      return clone(snapshot);
    },
    findSnapshot(id: string) {
      const found = state.snapshots.find((item) => item.id === id);
      return found ? clone(found) : null;
    },
    listSnapshots(documentRefId?: string) {
      return clone(
        state.snapshots
          .filter((snapshot) => !documentRefId || snapshot.onshapeDocumentRefId === documentRefId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    upsertAssemblyNodes(snapshotId: string, nodes: AssemblyNodeInput[]) {
      const bySourceId = new Map<string, CadAssemblyNode>();
      const recordsBySourceId = new Map<string, CadAssemblyNode>();

      for (const node of nodes) {
        const existing = state.assemblyNodes.find(
          (candidate) => candidate.snapshotId === snapshotId && candidate.sourceId === node.sourceId,
        );
        const nextNode: CadAssemblyNode = {
          id: existing?.id ?? nextId("cad-assembly", state.assemblyNodes.map((item) => item.id)),
          sourceId: node.sourceId,
          snapshotId,
          parentAssemblyNodeId: existing?.parentAssemblyNodeId ?? null,
          documentId: node.documentId,
          elementId: node.elementId ?? null,
          assemblyInstanceId: node.instanceId ?? null,
          instancePath: node.instancePath,
          name: node.name,
          normalizedName: normalizeName(node.name),
          inferredType: node.inferredType,
          subsystemId: existing?.subsystemId ?? null,
          mechanismId: existing?.mechanismId ?? null,
          metadataJson: clone(node.metadata ?? {}),
          createdAt: existing?.createdAt ?? nowIso(),
        };
        const record = existing ?? nextNode;
        if (existing) {
          Object.assign(existing, nextNode);
        } else {
          state.assemblyNodes.push(record);
        }
        recordsBySourceId.set(node.sourceId, record);
        bySourceId.set(node.sourceId, clone(record));
      }

      for (const node of nodes) {
        const record = recordsBySourceId.get(node.sourceId);
        if (!record) {
          continue;
        }
        const parentId = node.parentSourceId
          ? recordsBySourceId.get(node.parentSourceId)?.id ?? null
          : null;
        record.parentAssemblyNodeId = parentId;
        bySourceId.set(node.sourceId, clone(record));
      }

      return bySourceId;
    },
    upsertPartDefinitions(snapshotId: string, parts: PartDefinitionInput[]) {
      const bySourceId = new Map<string, CadPartDefinition>();
      for (const part of parts) {
        const identityKey = partIdentity(part);
        const existing = state.partDefinitions.find(
          (candidate) =>
            candidate.snapshotId === snapshotId &&
            (candidate.sourceId === part.sourceId ||
              candidate.missionControlExternalKey === part.missionControlExternalKey ||
              existingPartIdentity(candidate) === identityKey),
        );
        const nextPart: CadPartDefinition = {
          id: existing?.id ?? nextId("cad-part-def", state.partDefinitions.map((item) => item.id)),
          sourceId: part.sourceId,
          snapshotId,
          documentId: part.documentId,
          elementId: part.elementId ?? null,
          partId: part.partId ?? null,
          versionId: part.versionId ?? null,
          microversionId: part.microversionId ?? null,
          name: part.name,
          normalizedName: normalizeName(part.name),
          partNumber: part.partNumber ?? null,
          material: part.material ?? null,
          mass: part.mass ?? null,
          configuration: part.configuration ?? null,
          customPropertiesJson: clone(part.customProperties ?? {}),
          metadataHash: part.metadataHash ?? null,
          missionControlExternalKey: part.missionControlExternalKey ?? null,
          createdAt: existing?.createdAt ?? nowIso(),
        };
        if (existing) {
          Object.assign(existing, nextPart);
          bySourceId.set(part.sourceId, clone(existing));
        } else {
          state.partDefinitions.push(nextPart);
          bySourceId.set(part.sourceId, clone(nextPart));
        }
      }
      return bySourceId;
    },
    upsertPartInstances(snapshotId: string, parts: PartInstanceInput[], partDefinitionsBySourceId: Map<string, CadPartDefinition>, assemblyNodesBySourceId: Map<string, CadAssemblyNode>) {
      const imported: CadPartInstance[] = [];
      for (const part of parts) {
        const existing = state.partInstances.find(
          (candidate) => candidate.snapshotId === snapshotId && candidate.sourceId === part.sourceId,
        );
        const nextInstance: CadPartInstance = {
          id: existing?.id ?? nextId("cad-part-inst", state.partInstances.map((item) => item.id)),
          sourceId: part.sourceId,
          snapshotId,
          cadPartDefinitionId: part.partDefinitionSourceId ? partDefinitionsBySourceId.get(part.partDefinitionSourceId)?.id ?? null : null,
          parentAssemblyNodeId: part.parentAssemblySourceId ? assemblyNodesBySourceId.get(part.parentAssemblySourceId)?.id ?? null : null,
          documentId: part.documentId,
          elementId: part.elementId ?? null,
          assemblyInstanceId: part.instanceId ?? null,
          partId: part.partId ?? null,
          instancePath: part.instancePath,
          quantity: part.quantity ?? 1,
          suppressed: part.suppressed ?? null,
          configuration: part.configuration ?? null,
          transformJson: clone(part.transform ?? null),
          metadataJson: clone(part.metadata ?? {}),
          createdAt: existing?.createdAt ?? nowIso(),
        };
        if (existing) {
          Object.assign(existing, nextInstance);
          imported.push(clone(existing));
        } else {
          state.partInstances.push(nextInstance);
          imported.push(clone(nextInstance));
        }
      }
      return imported;
    },
    listAssemblyNodes(snapshotId?: string) {
      return clone(state.assemblyNodes.filter((item) => !snapshotId || item.snapshotId === snapshotId));
    },
    listPartDefinitions(snapshotId?: string) {
      return clone(state.partDefinitions.filter((item) => !snapshotId || item.snapshotId === snapshotId));
    },
    listPartInstances(snapshotId?: string) {
      return clone(state.partInstances.filter((item) => !snapshotId || item.snapshotId === snapshotId));
    },
    appendWarning(input: Omit<import("./onshapeTypes").CadImportWarning, "id" | "createdAt">) {
      const warning = {
        ...input,
        id: nextId("cad-warning", state.warnings.map((item) => item.id)),
        createdAt: nowIso(),
      };
      state.warnings.push(warning);
      return clone(warning);
    },
    listWarnings(filter?: { importRunId?: string; snapshotId?: string }) {
      return clone(
        state.warnings.filter(
          (warning) =>
            (!filter?.importRunId || warning.importRunId === filter.importRunId) &&
            (!filter?.snapshotId || warning.snapshotId === filter.snapshotId),
        ),
      );
    },
  };
}
