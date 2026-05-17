import type {
  CadAssemblyNode,
  CadImportRun,
  CadImportWarning,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  OnshapeApiBudget,
  OnshapeApiCacheEntry,
  OnshapeApiRequestLog,
  OnshapeDocumentRef,
  OnshapeOAuthTokenSet,
  OnshapeReference,
  OnshapeUrlParseResult,
  SyncLevel,
} from "./onshapeTypes";

export interface OnshapeRuntimeState {
  documentRefs: OnshapeDocumentRef[];
  importRuns: CadImportRun[];
  requestLogs: OnshapeApiRequestLog[];
  cacheEntries: OnshapeApiCacheEntry[];
  snapshots: CadSnapshot[];
  snapshotRunLinks: Array<{ importRunId: string; snapshotId: string; createdAt: string }>;
  assemblyNodes: CadAssemblyNode[];
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
  warnings: CadImportWarning[];
  budget: OnshapeApiBudget;
  oauthTokenSet: OnshapeOAuthTokenSet | null;
  oauthStates: Array<{ state: string; createdAt: string; sessionKey: string }>;
}

export interface OnshapeRuntimeStore {
  createDocumentRef(input: {
    label: string;
    parsed: OnshapeUrlParseResult;
    originalUrl?: string;
    createdBy?: string | null;
    projectId?: string | null;
    seasonId?: string | null;
    subsystemId?: string | null;
    mechanismId?: string | null;
  }): OnshapeDocumentRef;
  listDocumentRefs(): OnshapeDocumentRef[];
  findDocumentRef(id: string): OnshapeDocumentRef | null;
  createImportRun(input: {
    documentRefId: string;
    syncLevel: SyncLevel;
    requestedBy?: string | null;
    callsEstimated?: number | null;
  }): CadImportRun;
  updateImportRun(id: string, patch: Partial<Omit<CadImportRun, "id" | "createdAt">>): CadImportRun | null;
  findImportRun(id: string): CadImportRun | null;
  listImportRuns(documentRefId?: string): CadImportRun[];
  appendRequestLog(input: Omit<OnshapeApiRequestLog, "id">): OnshapeApiRequestLog;
  listRequestLogs(importRunId?: string): OnshapeApiRequestLog[];
  findCacheEntry(cacheKey: string): OnshapeApiCacheEntry | null;
  listCacheEntries(): OnshapeApiCacheEntry[];
  writeCacheEntry(input: Omit<OnshapeApiCacheEntry, "id" | "createdAt" | "documentId" | "workspaceId" | "versionId" | "microversionId" | "elementId"> & {
    reference: Partial<OnshapeReference>;
  }): OnshapeApiCacheEntry;
  upsertSnapshot(input: {
    documentRef: OnshapeDocumentRef;
    importRunId: string;
    label: string;
    createdBy?: string | null;
    source?: CadSnapshot["source"];
    notes?: string | null;
  }): CadSnapshot;
  findSnapshot(id: string): CadSnapshot | null;
  listSnapshots(documentRefId?: string): CadSnapshot[];
  listSnapshotsForImportRun(importRunId: string): CadSnapshot[];
  upsertAssemblyNodes(snapshotId: string, nodes: Array<{
    sourceId: string;
    parentSourceId?: string;
    documentId: string;
    elementId?: string;
    instanceId?: string;
    instancePath: string;
    name: string;
    inferredType: CadAssemblyNode["inferredType"];
    metadata?: Record<string, unknown>;
  }>): Map<string, CadAssemblyNode>;
  upsertPartDefinitions(snapshotId: string, parts: Array<{
    sourceId: string;
    documentId: string;
    elementId?: string;
    partId?: string;
    versionId?: string;
    microversionId?: string;
    name: string;
    partNumber?: string;
    material?: string;
    mass?: number;
    configuration?: string;
    customProperties?: Record<string, unknown>;
    metadataHash?: string;
    missionControlExternalKey?: string;
  }>): Map<string, CadPartDefinition>;
  upsertPartInstances(snapshotId: string, parts: Array<{
    sourceId: string;
    partDefinitionSourceId?: string;
    parentAssemblySourceId?: string;
    documentId: string;
    elementId?: string;
    instanceId?: string;
    partId?: string;
    instancePath: string;
    quantity?: number;
    suppressed?: boolean;
    configuration?: string;
    transform?: unknown;
    metadata?: Record<string, unknown>;
  }>, partDefinitionsBySourceId: Map<string, CadPartDefinition>, assemblyNodesBySourceId: Map<string, CadAssemblyNode>): CadPartInstance[];
  listAssemblyNodes(snapshotId?: string): CadAssemblyNode[];
  listPartDefinitions(snapshotId?: string): CadPartDefinition[];
  listPartInstances(snapshotId?: string): CadPartInstance[];
  appendWarning(input: Omit<CadImportWarning, "id" | "createdAt">): CadImportWarning;
  listWarnings(filter?: { importRunId?: string; snapshotId?: string }): CadImportWarning[];
  getBudget(): OnshapeApiBudget;
  recordApiCall(count: number, rateLimitRemaining?: number | null): OnshapeApiBudget;
  createOAuthState(input: { sessionKey: string }): { state: string; createdAt: string; sessionKey: string };
  consumeOAuthState(state: string, input: { sessionKey: string }): boolean;
  getOAuthTokenSet(): OnshapeOAuthTokenSet | null;
  setOAuthTokenSet(tokenSet: OnshapeOAuthTokenSet | null): OnshapeOAuthTokenSet | null;
  reset(): void;
}
