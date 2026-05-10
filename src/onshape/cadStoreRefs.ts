import type { OnshapeDocumentRef } from "./onshapeTypes";
import type { OnshapeRuntimeState } from "./cadStoreTypes";
import { clone, nextId, nowIso } from "./cadStoreUtils";

export function buildCadReferenceStore(state: OnshapeRuntimeState) {
  return {
    createDocumentRef(input: {
      label: string;
      parsed: Parameters<import("./cadStoreTypes").OnshapeRuntimeStore["createDocumentRef"]>[0]["parsed"];
      originalUrl?: string;
      createdBy?: string | null;
      projectId?: string | null;
      seasonId?: string | null;
      subsystemId?: string | null;
      mechanismId?: string | null;
    }): OnshapeDocumentRef {
      const timestamp = nowIso();
      const parsed = input.parsed;
      const originalUrl = input.originalUrl ?? parsed.originalUrl;
      const existing = state.documentRefs.find((candidate) => candidate.originalUrl === originalUrl);
      if (existing) {
        existing.label = input.label;
        existing.projectId = input.projectId ?? null;
        existing.seasonId = input.seasonId ?? null;
        existing.subsystemId = input.subsystemId ?? null;
        existing.mechanismId = input.mechanismId ?? null;
        existing.updatedAt = timestamp;
        return clone(existing);
      }

      const ref: OnshapeDocumentRef = {
        id: nextId("onshape-ref", state.documentRefs.map((item) => item.id)),
        projectId: input.projectId ?? null,
        seasonId: input.seasonId ?? null,
        subsystemId: input.subsystemId ?? null,
        mechanismId: input.mechanismId ?? null,
        label: input.label,
        documentId: parsed.documentId ?? "",
        workspaceId: parsed.workspaceId,
        versionId: parsed.versionId,
        microversionId: parsed.microversionId,
        elementId: parsed.elementId,
        originalUrl,
        parsedUrlJson: clone(parsed) as unknown as Record<string, unknown>,
        referenceType: parsed.referenceType,
        createdBy: input.createdBy ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.documentRefs.push(ref);
      return clone(ref);
    },
    listDocumentRefs() {
      return clone(state.documentRefs);
    },
    findDocumentRef(id: string) {
      const found = state.documentRefs.find((item) => item.id === id);
      return found ? clone(found) : null;
    },
  };
}
