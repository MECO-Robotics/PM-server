export type OnshapeReferenceType = "workspace" | "version" | "microversion" | "unknown";
export type SyncLevel = "link_only" | "shallow" | "bom" | "deep_release";
export type CadImportStatus = "pending" | "running" | "completed" | "partial" | "failed" | "canceled";
export type CadSnapshotSource =
  | "manual_snapshot"
  | "design_review"
  | "manufacturing_release"
  | "as_built"
  | "scheduled_candidate";
export type CadWarningSeverity = "info" | "warning" | "error";
export type CadAssemblyInferredType =
  | "master_assembly"
  | "subsystem_candidate"
  | "mechanism_candidate"
  | "subassembly"
  | "unknown";

export interface OnshapeReference {
  documentId: string;
  workspaceId?: string;
  versionId?: string;
  microversionId?: string;
  elementId?: string;
  originalUrl: string;
  referenceType: OnshapeReferenceType;
}

export interface OnshapeUrlParseResult extends Partial<OnshapeReference> {
  ok: boolean;
  originalUrl: string;
  referenceType: OnshapeReferenceType;
  errors: string[];
}

export interface RequestPolicy {
  priority: "interactive" | "snapshot" | "background";
  maxCallsAllowed: number;
  allowCached: boolean;
  requireFresh: boolean;
  stopIfRemainingBelow?: number;
}

export interface OnshapeCredentials {
  mode: "api_key" | "oauth";
  accessKey?: string;
  secretKey?: string;
  bearerToken?: string;
}

export interface OnshapeOAuthTokenSet {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresAt: string | null;
  receivedAt: string;
}

export interface OnshapeOAuthStatus {
  clientConfigured: boolean;
  connected: boolean;
  authorizationUrlAvailable: boolean;
  scopes: string[];
  tokenExpiresAt: string | null;
  credentialSource: "runtime" | "env" | "none";
}

export interface OnshapeTransportResponse {
  statusCode: number;
  headers: Record<string, string | number | undefined>;
  json: unknown;
}

export type OnshapeTransport = (request: {
  endpoint: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
}) => Promise<OnshapeTransportResponse>;

export interface OnshapeDocumentMetadataResponse {
  documentName?: string;
  elementName?: string;
  versionName?: string;
  microversionId?: string;
  raw: Record<string, unknown>;
}

export interface NormalizedCadAssemblyNode {
  sourceId: string;
  parentSourceId?: string;
  documentId: string;
  elementId?: string;
  instanceId?: string;
  instancePath: string;
  name: string;
  inferredType: CadAssemblyInferredType;
  metadata?: Record<string, unknown>;
}

export interface NormalizedCadPartDefinition {
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
  missionControlExternalKey?: string;
  metadataHash?: string;
}

export interface NormalizedCadPartInstance {
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
}

export interface OnshapeAssemblyBomResponse {
  assemblyNodes: NormalizedCadAssemblyNode[];
  partDefinitions: NormalizedCadPartDefinition[];
  partInstances: NormalizedCadPartInstance[];
  raw: Record<string, unknown>;
}

export interface CadImportOnshapeClient {
  getCallsUsed(): number;
  fetchDocumentMetadata(args: {
    reference: OnshapeReference;
    importRunId: string;
    policy: RequestPolicy;
  }): Promise<OnshapeDocumentMetadataResponse>;
  fetchAssemblyBom(args: {
    reference: OnshapeReference;
    importRunId: string;
    policy: RequestPolicy;
  }): Promise<OnshapeAssemblyBomResponse>;
}

export interface CadGraphImportResult {
  importRunId: string;
  snapshotId?: string;
  status: "completed" | "partial" | "failed";
  callsUsed: number;
  assemblyNodeCount: number;
  partDefinitionCount: number;
  partInstanceCount: number;
  warningCount: number;
  stoppedReason?: string;
}

export interface OnshapeConnection {
  id: string;
  organizationId: string | null;
  authMode: "api_key" | "oauth";
  credentialReference: string | null;
  baseUrl: string;
  oauth?: OnshapeOAuthStatus;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  lastError: string | null;
}

export interface OnshapeDocumentRef extends OnshapeReference {
  id: string;
  projectId: string | null;
  seasonId: string | null;
  subsystemId: string | null;
  mechanismId: string | null;
  label: string;
  parsedUrlJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CadImportRun {
  id: string;
  onshapeDocumentRefId: string;
  syncLevel: SyncLevel;
  status: CadImportStatus;
  startedAt: string;
  completedAt: string | null;
  requestedBy: string | null;
  callsEstimated: number | null;
  callsUsed: number;
  stoppedReason: string | null;
  errorMessage: string | null;
  rawSummaryJson: Record<string, unknown>;
  createdAt: string;
}

export interface OnshapeApiRequestLog {
  id: string;
  importRunId: string | null;
  endpoint: string;
  method: "GET" | "POST";
  cacheKey: string;
  usedCache: boolean;
  statusCode: number | null;
  requestStartedAt: string;
  requestCompletedAt: string | null;
  responseHeadersJson: Record<string, unknown>;
  rateLimitRemaining: number | null;
  errorMessage: string | null;
}

export interface OnshapeApiCacheEntry {
  id: string;
  cacheKey: string;
  endpoint: string;
  method: "GET" | "POST";
  requestHash: string;
  responseJson: unknown;
  responseHeadersJson: Record<string, unknown>;
  documentId: string | null;
  workspaceId: string | null;
  versionId: string | null;
  microversionId: string | null;
  elementId: string | null;
  immutable: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface CadSnapshot {
  id: string;
  seasonId: string | null;
  projectId: string | null;
  subsystemId: string | null;
  mechanismId: string | null;
  onshapeDocumentRefId: string;
  importRunId: string;
  label: string;
  source: CadSnapshotSource;
  documentId: string;
  workspaceId: string | null;
  versionId: string | null;
  microversionId: string | null;
  elementId: string | null;
  createdBy: string | null;
  createdAt: string;
  previousSnapshotId: string | null;
  notes: string | null;
  immutable: boolean;
}

export interface CadAssemblyNode {
  id: string;
  sourceId: string;
  snapshotId: string;
  parentAssemblyNodeId: string | null;
  documentId: string;
  elementId: string | null;
  assemblyInstanceId: string | null;
  instancePath: string;
  name: string;
  normalizedName: string;
  inferredType: CadAssemblyInferredType;
  subsystemId: string | null;
  mechanismId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface CadPartDefinition {
  id: string;
  sourceId: string;
  snapshotId: string;
  documentId: string;
  elementId: string | null;
  partId: string | null;
  versionId: string | null;
  microversionId: string | null;
  name: string;
  normalizedName: string;
  partNumber: string | null;
  material: string | null;
  mass: number | null;
  configuration: string | null;
  customPropertiesJson: Record<string, unknown>;
  metadataHash: string | null;
  missionControlExternalKey: string | null;
  createdAt: string;
}

export interface CadPartInstance {
  id: string;
  sourceId: string;
  snapshotId: string;
  cadPartDefinitionId: string | null;
  parentAssemblyNodeId: string | null;
  documentId: string;
  elementId: string | null;
  assemblyInstanceId: string | null;
  partId: string | null;
  instancePath: string;
  quantity: number;
  suppressed: boolean | null;
  configuration: string | null;
  transformJson: unknown;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface CadImportWarning {
  id: string;
  importRunId: string;
  snapshotId: string | null;
  severity: CadWarningSeverity;
  code: string;
  title: string;
  message: string;
  cadAssemblyNodeId: string | null;
  cadPartDefinitionId: string | null;
  cadPartInstanceId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface OnshapeApiBudget {
  id: string;
  organizationId: string | null;
  planType: "education" | "free" | "standard" | "professional" | "enterprise" | "unknown";
  annualCallBudget: number | null;
  monthlyCallBudget: number | null;
  dailySoftBudget: number | null;
  perSyncSoftBudget: number | null;
  callsUsedToday: number;
  callsUsedThisMonth: number;
  callsUsedThisYear: number;
  warningThresholdPercent: number;
  hardStopThresholdPercent: number;
  lastRateLimitRemaining: number | null;
  lastResetAt: string | null;
  createdAt: string;
  updatedAt: string;
}
