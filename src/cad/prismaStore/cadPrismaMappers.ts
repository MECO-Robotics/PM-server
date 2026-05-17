import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  CadAssemblyNode,
  CadImportRun,
  CadImportWarning,
  CadMappingRule,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  CadSnapshotMapping,
} from "../cadTypes";

type JsonValue = Prisma.JsonValue | null | undefined;

function asRecord(value: JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

export function importRunFromDb(item: Awaited<ReturnType<PrismaClient["cadImportRun"]["create"]>>): CadImportRun {
  return {
    id: item.id,
    projectId: item.projectId,
    seasonId: item.seasonId,
    source: item.source,
    status: item.status,
    originalFilename: item.originalFilename,
    uploadedFileId: item.uploadedFileId,
    uploadedFileHash: item.uploadedFileHash,
    parserVersion: item.parserVersion,
    parseStartedAt: iso(item.parseStartedAt),
    parseCompletedAt: iso(item.parseCompletedAt),
    requestedBy: item.requestedBy,
    errorMessage: item.errorMessage,
    rawSummaryJson: asRecord(item.rawSummaryJson),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function snapshotFromDb(item: Awaited<ReturnType<PrismaClient["cadSnapshot"]["create"]>>): CadSnapshot {
  return {
    id: item.id,
    projectId: item.projectId,
    seasonId: item.seasonId,
    importRunId: item.importRunId,
    source: item.source,
    label: item.label,
    uploadedFileId: item.uploadedFileId,
    uploadedFileHash: item.uploadedFileHash,
    previousSnapshotId: item.previousSnapshotId,
    status: item.status,
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
    finalizedBy: item.finalizedBy,
    finalizedAt: iso(item.finalizedAt),
    notes: item.notes,
  };
}

export function assemblyFromDb(item: Awaited<ReturnType<PrismaClient["cadAssemblyNode"]["create"]>>): CadAssemblyNode {
  return {
    id: item.id,
    snapshotId: item.snapshotId,
    sourceId: item.sourceId,
    parentSourceId: item.parentSourceId,
    parentAssemblyNodeId: item.parentAssemblyNodeId,
    name: item.name,
    normalizedName: item.normalizedName,
    instancePath: item.instancePath,
    depth: item.depth,
    inferredType: item.inferredType,
    stableSignature: item.stableSignature,
    metadataJson: asRecord(item.metadataJson),
    createdAt: item.createdAt.toISOString(),
  };
}

export function partFromDb(item: Awaited<ReturnType<PrismaClient["cadPartDefinition"]["create"]>>): CadPartDefinition {
  return {
    id: item.id,
    snapshotId: item.snapshotId,
    sourceId: item.sourceId,
    name: item.name,
    normalizedName: item.normalizedName,
    partNumber: item.partNumber,
    material: item.material,
    stableSignature: item.stableSignature,
    metadataJson: asRecord(item.metadataJson),
    createdAt: item.createdAt.toISOString(),
  };
}

export function instanceFromDb(item: Awaited<ReturnType<PrismaClient["cadPartInstance"]["create"]>>): CadPartInstance {
  return {
    id: item.id,
    snapshotId: item.snapshotId,
    sourceId: item.sourceId,
    partDefinitionId: item.partDefinitionId,
    parentAssemblyNodeId: item.parentAssemblyNodeId,
    instancePath: item.instancePath,
    quantity: item.quantity,
    stableSignature: item.stableSignature,
    metadataJson: asRecord(item.metadataJson),
    createdAt: item.createdAt.toISOString(),
  };
}

export function ruleFromDb(item: Awaited<ReturnType<PrismaClient["cadMappingRule"]["create"]>>): CadMappingRule {
  return {
    id: item.id,
    projectId: item.projectId,
    seasonId: item.seasonId,
    sourceKind: item.sourceKind,
    matchStrategy: item.matchStrategy,
    matchValue: item.matchValue,
    targetKind: item.targetKind,
    targetId: item.targetId,
    confidence: item.confidence,
    createdFromSnapshotId: item.createdFromSnapshotId,
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
    supersededByRuleId: item.supersededByRuleId,
    active: item.active,
    notes: item.notes,
  };
}

export function mappingFromDb(item: Awaited<ReturnType<PrismaClient["cadSnapshotMapping"]["create"]>>): CadSnapshotMapping {
  return {
    id: item.id,
    snapshotId: item.snapshotId,
    mappingRuleId: item.mappingRuleId,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    targetKind: item.targetKind,
    targetId: item.targetId,
    confidence: item.confidence,
    status: item.status,
    reviewedBy: item.reviewedBy,
    reviewedAt: iso(item.reviewedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function warningFromDb(item: Awaited<ReturnType<PrismaClient["cadImportWarning"]["create"]>>): CadImportWarning {
  return {
    id: item.id,
    importRunId: item.importRunId,
    snapshotId: item.snapshotId,
    severity: item.severity,
    code: item.code,
    title: item.title,
    message: item.message,
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    metadataJson: asRecord(item.metadataJson),
    createdAt: item.createdAt.toISOString(),
  };
}
