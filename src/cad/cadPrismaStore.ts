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
} from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";
import { normalizeCadName } from "./cadUtils";

type JsonValue = Prisma.JsonValue | null | undefined;

function asRecord(value: JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function importRunFromDb(item: Awaited<ReturnType<PrismaClient["cadImportRun"]["create"]>>): CadImportRun {
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

function snapshotFromDb(item: Awaited<ReturnType<PrismaClient["cadSnapshot"]["create"]>>): CadSnapshot {
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

function assemblyFromDb(item: Awaited<ReturnType<PrismaClient["cadAssemblyNode"]["create"]>>): CadAssemblyNode {
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

function partFromDb(item: Awaited<ReturnType<PrismaClient["cadPartDefinition"]["create"]>>): CadPartDefinition {
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

function instanceFromDb(item: Awaited<ReturnType<PrismaClient["cadPartInstance"]["create"]>>): CadPartInstance {
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

function ruleFromDb(item: Awaited<ReturnType<PrismaClient["cadMappingRule"]["create"]>>): CadMappingRule {
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

function mappingFromDb(item: Awaited<ReturnType<PrismaClient["cadSnapshotMapping"]["create"]>>): CadSnapshotMapping {
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

function warningFromDb(item: Awaited<ReturnType<PrismaClient["cadImportWarning"]["create"]>>): CadImportWarning {
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

export function createPrismaCadStore(prisma: PrismaClient): CadStore {
  return {
    async createImportRun(input) {
      return importRunFromDb(await prisma.cadImportRun.create({ data: input as Prisma.CadImportRunCreateInput }));
    },
    async updateImportRun(id, patch) {
      const item = await prisma.cadImportRun.update({ where: { id }, data: patch as Prisma.CadImportRunUpdateInput }).catch(() => null);
      return item ? importRunFromDb(item) : null;
    },
    async listImportRuns(filter) {
      const items = await prisma.cadImportRun.findMany({
        where: { projectId: filter?.projectId, seasonId: filter?.seasonId },
        orderBy: { createdAt: "desc" },
      });
      return items.map(importRunFromDb);
    },
    async findImportRun(id) {
      const item = await prisma.cadImportRun.findUnique({ where: { id } });
      return item ? importRunFromDb(item) : null;
    },
    async createSnapshot(input) {
      const previous = await prisma.cadSnapshot.findFirst({
        where: { projectId: input.projectId, seasonId: input.seasonId, source: input.source },
        orderBy: { createdAt: "desc" },
      });
      return snapshotFromDb(
        await prisma.cadSnapshot.create({
          data: { ...input, previousSnapshotId: previous?.id ?? null } as Prisma.CadSnapshotUncheckedCreateInput,
        }),
      );
    },
    async updateSnapshot(id, patch) {
      const item = await prisma.cadSnapshot.update({ where: { id }, data: patch as Prisma.CadSnapshotUpdateInput }).catch(() => null);
      return item ? snapshotFromDb(item) : null;
    },
    async listSnapshots(filter) {
      const items = await prisma.cadSnapshot.findMany({
        where: {
          projectId: filter?.projectId,
          seasonId: filter?.seasonId,
          source: filter?.source as Prisma.EnumCadImportSourceFilter | undefined,
          status: filter?.status as Prisma.EnumCadSnapshotStatusFilter | undefined,
        },
        orderBy: { createdAt: "desc" },
      });
      return items.map(snapshotFromDb);
    },
    async findSnapshot(id) {
      const item = await prisma.cadSnapshot.findUnique({ where: { id } });
      return item ? snapshotFromDb(item) : null;
    },
    async createAssemblyNodes(snapshotId, input) {
      const bySourceId = new Map<string, CadAssemblyNode>();
      for (const node of input) {
        const parent = node.parentSourceId ? bySourceId.get(node.parentSourceId) : null;
        const item = assemblyFromDb(
          await prisma.cadAssemblyNode.create({
            data: {
              ...node,
              snapshotId,
              normalizedName: normalizeCadName(node.name),
              parentAssemblyNodeId: parent?.id ?? null,
            } as Prisma.CadAssemblyNodeUncheckedCreateInput,
          }),
        );
        bySourceId.set(item.sourceId, item);
      }
      return bySourceId;
    },
    async createPartDefinitions(snapshotId, input) {
      const bySourceId = new Map<string, CadPartDefinition>();
      for (const part of input) {
        const item = partFromDb(
          await prisma.cadPartDefinition.create({
            data: {
              ...part,
              snapshotId,
              normalizedName: normalizeCadName(part.name),
            } as Prisma.CadPartDefinitionUncheckedCreateInput,
          }),
        );
        bySourceId.set(item.sourceId, item);
      }
      return bySourceId;
    },
    async createPartInstances(snapshotId, input) {
      const items: CadPartInstance[] = [];
      for (const instance of input) {
        items.push(
          instanceFromDb(
            await prisma.cadPartInstance.create({
              data: { ...instance, snapshotId } as Prisma.CadPartInstanceUncheckedCreateInput,
            }),
          ),
        );
      }
      return items;
    },
    async listAssemblyNodes(snapshotId) {
      return (await prisma.cadAssemblyNode.findMany({ where: { snapshotId } })).map(assemblyFromDb);
    },
    async listPartDefinitions(snapshotId) {
      return (await prisma.cadPartDefinition.findMany({ where: { snapshotId } })).map(partFromDb);
    },
    async listPartInstances(snapshotId) {
      return (await prisma.cadPartInstance.findMany({ where: { snapshotId } })).map(instanceFromDb);
    },
    async createMappingRule(input) {
      return ruleFromDb(await prisma.cadMappingRule.create({ data: input as Prisma.CadMappingRuleUncheckedCreateInput }));
    },
    async updateMappingRule(id, patch) {
      const item = await prisma.cadMappingRule.update({ where: { id }, data: patch }).catch(() => null);
      return item ? ruleFromDb(item) : null;
    },
    async listMappingRules(filter) {
      const seasonFilter = filter?.seasonId === undefined ? undefined : [{ seasonId: filter.seasonId }, { seasonId: null }];
      const items = await prisma.cadMappingRule.findMany({
        where: {
          projectId: filter?.projectId ?? undefined,
          active: filter?.active,
          OR: seasonFilter,
        },
      });
      return items.map(ruleFromDb);
    },
    async findMappingRule(id) {
      const item = await prisma.cadMappingRule.findUnique({ where: { id } });
      return item ? ruleFromDb(item) : null;
    },
    async upsertSnapshotMapping(input) {
      return mappingFromDb(
        await prisma.cadSnapshotMapping.upsert({
          where: {
            snapshotId_sourceKind_sourceId: {
              snapshotId: input.snapshotId,
              sourceKind: input.sourceKind,
              sourceId: input.sourceId,
            },
          },
          create: input as Prisma.CadSnapshotMappingUncheckedCreateInput,
          update: input as Prisma.CadSnapshotMappingUpdateInput,
        }),
      );
    },
    async updateSnapshotMapping(id, patch) {
      const item = await prisma.cadSnapshotMapping.update({ where: { id }, data: patch as Prisma.CadSnapshotMappingUpdateInput }).catch(() => null);
      return item ? mappingFromDb(item) : null;
    },
    async listSnapshotMappings(snapshotId) {
      return (await prisma.cadSnapshotMapping.findMany({ where: { snapshotId } })).map(mappingFromDb);
    },
    async appendWarning(input) {
      return warningFromDb(await prisma.cadImportWarning.create({ data: input as Prisma.CadImportWarningUncheckedCreateInput }));
    },
    async listWarnings(filter) {
      const items = await prisma.cadImportWarning.findMany({
        where: { importRunId: filter?.importRunId, snapshotId: filter?.snapshotId },
        orderBy: { createdAt: "asc" },
      });
      return items.map(warningFromDb);
    },
  };
}
