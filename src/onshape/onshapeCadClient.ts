import type {
  CadImportOnshapeClient,
  OnshapeAssemblyBomResponse,
  OnshapeDocumentMetadataResponse,
  OnshapeReference,
} from "./onshapeTypes";
import type { createOnshapeApiClient } from "./onshapeApiClient";

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

function normalizeBom(raw: unknown, reference: OnshapeReference): OnshapeAssemblyBomResponse {
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Partial<OnshapeAssemblyBomResponse>;
    if (Array.isArray(record.assemblyNodes) && Array.isArray(record.partDefinitions) && Array.isArray(record.partInstances)) {
      return {
        assemblyNodes: record.assemblyNodes,
        partDefinitions: record.partDefinitions,
        partInstances: record.partInstances,
        raw: record.raw ?? { payload: raw },
      };
    }
  }

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

export function createOnshapeCadClient(lowLevelClient: LowLevelClient): CadImportOnshapeClient {
  return {
    getCallsUsed: lowLevelClient.getCallsUsed,
    async fetchDocumentMetadata({ reference, importRunId, policy }) {
      const endpoint = `/api/documents/d/${reference.documentId}`;
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
      const endpoint = `/api/assemblies/d/${reference.documentId}/${modePath}/e/${reference.elementId}/bom`;
      const raw = await lowLevelClient.requestJson({
        endpoint,
        method: "GET",
        reference,
        requestHash: ONSHAPE_ASSEMBLY_BOM_REQUEST_HASH,
        importRunId,
        policy,
      });
      return normalizeBom(raw, reference);
    },
  };
}
