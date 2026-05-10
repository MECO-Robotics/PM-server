CREATE TYPE "OnshapeAuthMode" AS ENUM ('API_KEY', 'OAUTH');
CREATE TYPE "CadSyncLevel" AS ENUM ('LINK_ONLY', 'SHALLOW', 'BOM', 'DEEP_RELEASE');
CREATE TYPE "CadImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELED');
CREATE TYPE "CadSnapshotSource" AS ENUM ('MANUAL_SNAPSHOT', 'DESIGN_REVIEW', 'MANUFACTURING_RELEASE', 'AS_BUILT', 'SCHEDULED_CANDIDATE');
CREATE TYPE "CadAssemblyInferredType" AS ENUM ('MASTER_ASSEMBLY', 'SUBSYSTEM_CANDIDATE', 'MECHANISM_CANDIDATE', 'SUBASSEMBLY', 'UNKNOWN');
CREATE TYPE "CadWarningSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');
CREATE TYPE "OnshapePlanType" AS ENUM ('EDUCATION', 'FREE', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'UNKNOWN');

CREATE TABLE "OnshapeConnection" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "authMode" "OnshapeAuthMode" NOT NULL DEFAULT 'API_KEY',
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
  "onshapeDocumentRefId" TEXT NOT NULL REFERENCES "OnshapeDocumentRef"("id"),
  "syncLevel" "CadSyncLevel" NOT NULL,
  "status" "CadImportStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "requestedBy" TEXT,
  "callsEstimated" INTEGER,
  "callsUsed" INTEGER NOT NULL DEFAULT 0,
  "stoppedReason" TEXT,
  "errorMessage" TEXT,
  "rawSummaryJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  "seasonId" TEXT,
  "projectId" TEXT,
  "subsystemId" TEXT,
  "mechanismId" TEXT,
  "onshapeDocumentRefId" TEXT NOT NULL REFERENCES "OnshapeDocumentRef"("id"),
  "importRunId" TEXT NOT NULL REFERENCES "CadImportRun"("id"),
  "label" TEXT NOT NULL,
  "source" "CadSnapshotSource" NOT NULL DEFAULT 'MANUAL_SNAPSHOT',
  "documentId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "versionId" TEXT,
  "microversionId" TEXT,
  "elementId" TEXT,
  "createdBy" TEXT,
  "previousSnapshotId" TEXT REFERENCES "CadSnapshot"("id"),
  "notes" TEXT,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CadAssemblyNode" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL REFERENCES "CadSnapshot"("id"),
  "parentAssemblyNodeId" TEXT REFERENCES "CadAssemblyNode"("id"),
  "documentId" TEXT NOT NULL,
  "elementId" TEXT,
  "assemblyInstanceId" TEXT,
  "instancePath" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "inferredType" "CadAssemblyInferredType" NOT NULL DEFAULT 'UNKNOWN',
  "subsystemId" TEXT,
  "mechanismId" TEXT,
  "metadataJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("snapshotId", "sourceId")
);

CREATE TABLE "CadPartDefinition" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL REFERENCES "CadSnapshot"("id"),
  "documentId" TEXT NOT NULL,
  "elementId" TEXT,
  "partId" TEXT,
  "versionId" TEXT,
  "microversionId" TEXT,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "partNumber" TEXT,
  "material" TEXT,
  "mass" DOUBLE PRECISION,
  "configuration" TEXT,
  "customPropertiesJson" JSONB NOT NULL,
  "metadataHash" TEXT,
  "missionControlExternalKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("snapshotId", "sourceId")
);

CREATE TABLE "CadPartInstance" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL REFERENCES "CadSnapshot"("id"),
  "cadPartDefinitionId" TEXT REFERENCES "CadPartDefinition"("id"),
  "parentAssemblyNodeId" TEXT,
  "documentId" TEXT NOT NULL,
  "elementId" TEXT,
  "assemblyInstanceId" TEXT,
  "partId" TEXT,
  "instancePath" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "suppressed" BOOLEAN,
  "configuration" TEXT,
  "transformJson" JSONB,
  "metadataJson" JSONB NOT NULL,
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
  "cadAssemblyNodeId" TEXT REFERENCES "CadAssemblyNode"("id"),
  "cadPartDefinitionId" TEXT REFERENCES "CadPartDefinition"("id"),
  "cadPartInstanceId" TEXT REFERENCES "CadPartInstance"("id"),
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
CREATE INDEX "OnshapeDocumentRef_elementId_idx" ON "OnshapeDocumentRef"("elementId");
CREATE INDEX "CadImportRun_onshapeDocumentRefId_idx" ON "CadImportRun"("onshapeDocumentRefId");
CREATE INDEX "OnshapeApiRequestLog_importRunId_idx" ON "OnshapeApiRequestLog"("importRunId");
CREATE INDEX "OnshapeApiRequestLog_cacheKey_idx" ON "OnshapeApiRequestLog"("cacheKey");
CREATE INDEX "OnshapeApiCacheEntry_documentId_idx" ON "OnshapeApiCacheEntry"("documentId");
CREATE INDEX "CadSnapshot_importRunId_idx" ON "CadSnapshot"("importRunId");
CREATE INDEX "CadAssemblyNode_snapshotId_idx" ON "CadAssemblyNode"("snapshotId");
CREATE INDEX "CadPartDefinition_partId_idx" ON "CadPartDefinition"("partId");
CREATE INDEX "CadPartInstance_snapshotId_idx" ON "CadPartInstance"("snapshotId");
CREATE INDEX "CadImportWarning_importRunId_idx" ON "CadImportWarning"("importRunId");
