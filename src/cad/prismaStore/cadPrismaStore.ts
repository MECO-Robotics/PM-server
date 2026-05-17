import type { Prisma, PrismaClient } from "@prisma/client";

import type { CadAssemblyNode, CadPartDefinition, CadPartInstance } from "../cadTypes";
import type { CadStore } from "../cadStoreTypes";
import { normalizeCadName } from "../cadUtils";
import {
  assemblyFromDb,
  importRunFromDb,
  instanceFromDb,
  mappingFromDb,
  partFromDb,
  ruleFromDb,
  snapshotFromDb,
  warningFromDb,
} from "./cadPrismaMappers";

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
        where: {
          projectId: filter?.projectId,
          seasonId: filter?.seasonId,
          source: filter?.source,
          status: filter?.status,
        },
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
