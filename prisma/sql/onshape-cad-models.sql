CREATE TYPE "OnshapeAuthMode" AS ENUM ('API_KEY', 'OAUTH');
CREATE TYPE "CadSyncLevel" AS ENUM ('LINK_ONLY', 'SHALLOW', 'BOM', 'DEEP_RELEASE');
CREATE TYPE "CadImportSource" AS ENUM ('STEP_UPLOAD', 'ONSHAPE_API', 'ONSHAPE_BOM_CSV', 'MANUAL_BOM_CSV');
CREATE TYPE "CadImportStatus" AS ENUM ('PENDING', 'PARSING', 'PARSED', 'MAPPING_REVIEW', 'MAPPED', 'FINALIZED', 'FAILED', 'CANCELED');
CREATE TYPE "CadSnapshotStatus" AS ENUM ('parsed', 'mapping_review', 'mapped', 'finalized', 'superseded');
CREATE TYPE "CadSnapshotSource" AS ENUM ('MANUAL_SNAPSHOT', 'DESIGN_REVIEW', 'MANUFACTURING_RELEASE', 'AS_BUILT', 'SCHEDULED_CANDIDATE');
CREATE TYPE "CadMappingSourceKind" AS ENUM ('ASSEMBLY_NODE', 'PART_DEFINITION', 'PART_INSTANCE');
CREATE TYPE "CadAssemblyInferredType" AS ENUM ('ROOT', 'SUBSYSTEM_CANDIDATE', 'MECHANISM_CANDIDATE', 'COMPONENT_ASSEMBLY_CANDIDATE', 'SUBASSEMBLY', 'UNKNOWN');
CREATE TYPE "CadWarningSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');
CREATE TYPE "OnshapePlanType" AS ENUM ('EDUCATION', 'FREE', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'UNKNOWN');

CREATE TABLE "OnshapeConnection" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "authMode" "OnshapeAuthMode" NOT NULL DEFAULT 'OAUTH',
  "credentialReference" TEXT,
  "baseUrl" TEXT NOT NULL DEFAULT 'https://cad.onshape.com',
  "disabledAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OnshapeDocumentRef" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT,
  "seasonId" TEXT,
  "subsystemId" TEXT,
  "mechanismId" TEXT,
  "label" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "versionId" TEXT,
  "microversionId" TEXT,
  "elementId" TEXT,
  "originalUrl" TEXT NOT NULL,
  "parsedUrlJson" JSONB NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CadImportRun" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT,
  "seasonId" TEXT,
  "source" "CadImportSource" NOT NULL,
  "status" "CadImportStatus" NOT NULL DEFAULT 'PENDING',
  "originalFilename" TEXT NOT NULL,
  "uploadedFileId" TEXT,
  "uploadedFileHash" TEXT,
  "parserVersion" TEXT,
  "parseStartedAt" TIMESTAMP(3),
  "parseCompletedAt" TIMESTAMP(3),
  "requestedBy" TEXT,
  "errorMessage" TEXT,
  "rawSummaryJson" JSONB NOT NULL,
  "onshapeDocumentRefId" TEXT REFERENCES "OnshapeDocumentRef"("id"),
  "syncLevel" "CadSyncLevel",
  "callsEstimated" INTEGER,
  "callsUsed" INTEGER NOT NULL DEFAULT 0,
  "stoppedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OnshapeApiRequestLog" (
  "id" TEXT PRIMARY KEY,
  "importRunId" TEXT REFERENCES "CadImportRun"("id"),
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "usedCache" BOOLEAN NOT NULL DEFAULT false,
  "statusCode" INTEGER,
  "requestStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestCompletedAt" TIMESTAMP(3),
  "responseHeadersJson" JSONB NOT NULL,
  "rateLimitRemaining" INTEGER,
  "errorMessage" TEXT
);

CREATE TABLE "OnshapeApiCacheEntry" (
  "id" TEXT PRIMARY KEY,
  "cacheKey" TEXT NOT NULL UNIQUE,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "responseJson" JSONB NOT NULL,
  "responseHeadersJson" JSONB NOT NULL,
  "documentId" TEXT,
  "workspaceId" TEXT,
  "versionId" TEXT,
  "microversionId" TEXT,
  "elementId" TEXT,
  "immutable" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3)
);

CREATE TABLE "CadSnapshot" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT,
  "seasonId" TEXT,
  "importRunId" TEXT NOT NULL REFERENCES "CadImportRun"("id"),
  "source" "CadImportSource" NOT NULL,
  "label" TEXT NOT NULL,
  "uploadedFileId" TEXT,
  "uploadedFileHash" TEXT,
  "previousSnapshotId" TEXT REFERENCES "CadSnapshot"("id"),
  "status" "CadSnapshotStatus" NOT NULL DEFAULT 'parsed',
  "createdBy" TEXT,
  "finalizedBy" TEXT,
  "finalizedAt" TIMESTAMP(3),
  "notes" TEXT,
  "subsystemId" TEXT,
  "mechanismId" TEXT,
  "onshapeDocumentRefId" TEXT REFERENCES "OnshapeDocumentRef"("id"),
  "snapshotSource" "CadSnapshotSource",
  "documentId" TEXT,
  "workspaceId" TEXT,
  "versionId" TEXT,
  "microversionId" TEXT,
  "elementId" TEXT,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CadAssemblyNode" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL REFERENCES "CadSnapshot"("id"),
  "parentSourceId" TEXT,
  "parentAssemblyNodeId" TEXT REFERENCES "CadAssemblyNode"("id"),
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "instancePath" TEXT NOT NULL,
  "depth" INTEGER NOT NULL,
  "inferredType" "CadAssemblyInferredType" NOT NULL DEFAULT 'UNKNOWN',
  "subsystemId" TEXT,
  "mechanismId" TEXT,
  "stableSignature" TEXT NOT NULL,
  "metadataJson" JSONB NOT NULL,
  "documentId" TEXT,
  "elementId" TEXT,
  "assemblyInstanceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("snapshotId", "sourceId")
);

CREATE TABLE "CadPartDefinition" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL REFERENCES "CadSnapshot"("id"),
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "partNumber" TEXT,
  "material" TEXT,
  "stableSignature" TEXT NOT NULL,
  "metadataJson" JSONB NOT NULL,
  "documentId" TEXT,
  "elementId" TEXT,
  "partId" TEXT,
  "versionId" TEXT,
  "microversionId" TEXT,
  "mass" DOUBLE PRECISION,
  "configuration" TEXT,
  "customPropertiesJson" JSONB,
  "metadataHash" TEXT,
  "missionControlExternalKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("snapshotId", "sourceId")
);

CREATE TABLE "CadPartInstance" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL REFERENCES "CadSnapshot"("id"),
  "partDefinitionId" TEXT REFERENCES "CadPartDefinition"("id"),
  "parentAssemblyNodeId" TEXT,
  "instancePath" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "stableSignature" TEXT NOT NULL,
  "metadataJson" JSONB NOT NULL,
  "documentId" TEXT,
  "elementId" TEXT,
  "assemblyInstanceId" TEXT,
  "partId" TEXT,
  "suppressed" BOOLEAN,
  "configuration" TEXT,
  "transformJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("snapshotId", "sourceId")
);

CREATE TABLE "CadImportWarning" (
  "id" TEXT PRIMARY KEY,
  "importRunId" TEXT NOT NULL REFERENCES "CadImportRun"("id"),
  "snapshotId" TEXT REFERENCES "CadSnapshot"("id"),
  "severity" "CadWarningSeverity" NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "sourceKind" "CadMappingSourceKind",
  "sourceId" TEXT,
  "metadataJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OnshapeApiBudget" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "planType" "OnshapePlanType" NOT NULL DEFAULT 'EDUCATION',
  "annualCallBudget" INTEGER,
  "monthlyCallBudget" INTEGER,
  "dailySoftBudget" INTEGER,
  "perSyncSoftBudget" INTEGER,
  "callsUsedToday" INTEGER NOT NULL DEFAULT 0,
  "callsUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
  "callsUsedThisYear" INTEGER NOT NULL DEFAULT 0,
  "warningThresholdPercent" INTEGER NOT NULL DEFAULT 70,
  "hardStopThresholdPercent" INTEGER NOT NULL DEFAULT 90,
  "lastResetAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OnshapeDocumentRef_documentId_idx" ON "OnshapeDocumentRef"("documentId");
CREATE INDEX "OnshapeDocumentRef_workspaceId_idx" ON "OnshapeDocumentRef"("workspaceId");
CREATE INDEX "OnshapeDocumentRef_versionId_idx" ON "OnshapeDocumentRef"("versionId");
CREATE INDEX "OnshapeDocumentRef_microversionId_idx" ON "OnshapeDocumentRef"("microversionId");
CREATE INDEX "OnshapeDocumentRef_elementId_idx" ON "OnshapeDocumentRef"("elementId");
CREATE INDEX "OnshapeDocumentRef_createdAt_idx" ON "OnshapeDocumentRef"("createdAt");
CREATE INDEX "CadImportRun_projectId_idx" ON "CadImportRun"("projectId");
CREATE INDEX "CadImportRun_seasonId_idx" ON "CadImportRun"("seasonId");
CREATE INDEX "CadImportRun_source_idx" ON "CadImportRun"("source");
CREATE INDEX "CadImportRun_onshapeDocumentRefId_idx" ON "CadImportRun"("onshapeDocumentRefId");
CREATE INDEX "CadImportRun_status_idx" ON "CadImportRun"("status");
CREATE INDEX "CadImportRun_createdAt_idx" ON "CadImportRun"("createdAt");
CREATE INDEX "OnshapeApiRequestLog_importRunId_idx" ON "OnshapeApiRequestLog"("importRunId");
CREATE INDEX "OnshapeApiRequestLog_cacheKey_idx" ON "OnshapeApiRequestLog"("cacheKey");
CREATE INDEX "OnshapeApiRequestLog_requestStartedAt_idx" ON "OnshapeApiRequestLog"("requestStartedAt");
CREATE INDEX "OnshapeApiCacheEntry_documentId_idx" ON "OnshapeApiCacheEntry"("documentId");
CREATE INDEX "OnshapeApiCacheEntry_workspaceId_idx" ON "OnshapeApiCacheEntry"("workspaceId");
CREATE INDEX "OnshapeApiCacheEntry_versionId_idx" ON "OnshapeApiCacheEntry"("versionId");
CREATE INDEX "OnshapeApiCacheEntry_microversionId_idx" ON "OnshapeApiCacheEntry"("microversionId");
CREATE INDEX "OnshapeApiCacheEntry_elementId_idx" ON "OnshapeApiCacheEntry"("elementId");
CREATE INDEX "OnshapeApiCacheEntry_createdAt_idx" ON "OnshapeApiCacheEntry"("createdAt");
CREATE INDEX "CadSnapshot_projectId_idx" ON "CadSnapshot"("projectId");
CREATE INDEX "CadSnapshot_seasonId_idx" ON "CadSnapshot"("seasonId");
CREATE INDEX "CadSnapshot_source_idx" ON "CadSnapshot"("source");
CREATE INDEX "CadSnapshot_status_idx" ON "CadSnapshot"("status");
CREATE INDEX "CadSnapshot_onshapeDocumentRefId_idx" ON "CadSnapshot"("onshapeDocumentRefId");
CREATE INDEX "CadSnapshot_importRunId_idx" ON "CadSnapshot"("importRunId");
CREATE INDEX "CadSnapshot_documentId_idx" ON "CadSnapshot"("documentId");
CREATE INDEX "CadSnapshot_elementId_idx" ON "CadSnapshot"("elementId");
CREATE INDEX "CadSnapshot_createdAt_idx" ON "CadSnapshot"("createdAt");
CREATE INDEX "CadAssemblyNode_snapshotId_idx" ON "CadAssemblyNode"("snapshotId");
CREATE INDEX "CadAssemblyNode_stableSignature_idx" ON "CadAssemblyNode"("stableSignature");
CREATE INDEX "CadAssemblyNode_normalizedName_idx" ON "CadAssemblyNode"("normalizedName");
CREATE INDEX "CadAssemblyNode_documentId_idx" ON "CadAssemblyNode"("documentId");
CREATE INDEX "CadAssemblyNode_elementId_idx" ON "CadAssemblyNode"("elementId");
CREATE INDEX "CadPartDefinition_snapshotId_idx" ON "CadPartDefinition"("snapshotId");
CREATE INDEX "CadPartDefinition_stableSignature_idx" ON "CadPartDefinition"("stableSignature");
CREATE INDEX "CadPartDefinition_partId_idx" ON "CadPartDefinition"("partId");
CREATE INDEX "CadPartDefinition_partNumber_idx" ON "CadPartDefinition"("partNumber");
CREATE INDEX "CadPartDefinition_normalizedName_idx" ON "CadPartDefinition"("normalizedName");
CREATE INDEX "CadPartDefinition_documentId_idx" ON "CadPartDefinition"("documentId");
CREATE INDEX "CadPartDefinition_elementId_idx" ON "CadPartDefinition"("elementId");
CREATE INDEX "CadPartInstance_snapshotId_idx" ON "CadPartInstance"("snapshotId");
CREATE INDEX "CadPartInstance_stableSignature_idx" ON "CadPartInstance"("stableSignature");
CREATE INDEX "CadPartInstance_parentAssemblyNodeId_idx" ON "CadPartInstance"("parentAssemblyNodeId");
CREATE INDEX "CadPartInstance_partDefinitionId_idx" ON "CadPartInstance"("partDefinitionId");
CREATE INDEX "CadPartInstance_documentId_idx" ON "CadPartInstance"("documentId");
CREATE INDEX "CadPartInstance_elementId_idx" ON "CadPartInstance"("elementId");
CREATE INDEX "CadPartInstance_partId_idx" ON "CadPartInstance"("partId");
CREATE INDEX "CadImportWarning_importRunId_idx" ON "CadImportWarning"("importRunId");
CREATE INDEX "CadImportWarning_snapshotId_idx" ON "CadImportWarning"("snapshotId");
CREATE INDEX "CadImportWarning_sourceKind_sourceId_idx" ON "CadImportWarning"("sourceKind", "sourceId");
CREATE INDEX "CadImportWarning_code_idx" ON "CadImportWarning"("code");
CREATE INDEX "CadImportWarning_createdAt_idx" ON "CadImportWarning"("createdAt");
CREATE INDEX "OnshapeApiBudget_organizationId_idx" ON "OnshapeApiBudget"("organizationId");
CREATE INDEX "OnshapeApiBudget_createdAt_idx" ON "OnshapeApiBudget"("createdAt");
