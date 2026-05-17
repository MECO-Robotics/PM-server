import type {
  CadImportOnshapeClient,
  OnshapeDocumentMetadataResponse,
  OnshapeReference,
} from "./onshapeTypes";
import type { createOnshapeApiClient } from "./onshapeApiClient";
import { normalizeOnshapeBom } from "./onshapeBomNormalizer";

export const ONSHAPE_DOCUMENT_METADATA_REQUEST_HASH = "document-metadata:v1";
export const ONSHAPE_ASSEMBLY_BOM_REQUEST_HASH = "assembly-bom:v1";

type LowLevelClient = ReturnType<typeof createOnshapeApiClient>;

function referenceModePath(reference: OnshapeReference) {
  if (reference.workspaceId) {
    return `w/${reference.workspaceId}`;
  }
  if (reference.versionId) {
    return `v/${reference.versionId}`;
  }
  if (reference.microversionId) {
    return `m/${reference.microversionId}`;
  }
  return "unknown";
}

function readName(value: unknown, fallback: string) {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidate = record.name ?? record.documentName ?? record.elementName;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

function normalizeMetadata(raw: unknown, reference: OnshapeReference): OnshapeDocumentMetadataResponse {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    documentName: readName(record.document, readName(raw, "Onshape document")),
    elementName: readName(record.element, reference.elementId ?? "Linked assembly"),
    versionName: typeof record.versionName === "string" ? record.versionName : undefined,
    microversionId: reference.microversionId,
    raw: { payload: raw },
  };
}

export function createOnshapeCadClient(lowLevelClient: LowLevelClient): CadImportOnshapeClient {
  return {
    getCallsUsed: lowLevelClient.getCallsUsed,
    async fetchDocumentMetadata({ reference, importRunId, policy }) {
      const endpoint = `/api/v10/documents/${reference.documentId}`;
      const raw = await lowLevelClient.requestJson({
        endpoint,
        method: "GET",
        reference,
        requestHash: ONSHAPE_DOCUMENT_METADATA_REQUEST_HASH,
        importRunId,
        policy,
      });
      return normalizeMetadata(raw, reference);
    },
    async fetchAssemblyBom({ reference, importRunId, policy }) {
      if (!reference.elementId) {
        throw new Error("Onshape element ID is required for BOM sync.");
      }
      const modePath = referenceModePath(reference);
      const endpoint = `/api/v10/assemblies/d/${reference.documentId}/${modePath}/e/${reference.elementId}/bom`;
      const raw = await lowLevelClient.requestJson({
        endpoint,
        method: "GET",
        reference,
        requestHash: ONSHAPE_ASSEMBLY_BOM_REQUEST_HASH,
        importRunId,
        policy,
      });
      return normalizeOnshapeBom(raw, reference);
    },
  };
}
