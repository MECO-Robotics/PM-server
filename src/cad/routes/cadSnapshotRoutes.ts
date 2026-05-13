import type { FastifyInstance, FastifyReply } from "fastify";

import { buildCadHierarchyReview } from "../cadHierarchyReviewService";
import { getCadStore } from "../cadStoreFactory";
import { readGroupInstancesQuery, readImportRunListQuery, readSnapshotListQuery } from "./cadRouteQueries";
import type { RequireApiSession } from "./cadRouteTypes";
import { registerCadSnapshotActionRoutes } from "./cadSnapshotActionRoutes";
import { buildTree, groupedSnapshotMappings, snapshotMappings } from "./cadSnapshotViewService";

export function registerCadSnapshotRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.get("/api/cad/import-runs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    try {
      return { items: await getCadStore().listImportRuns(readImportRunListQuery(request.query)) };
    } catch (error) {
      return handleCadQueryError(error, reply);
    }
  });

  app.get<{ Params: { importRunId: string } }>("/api/cad/import-runs/:importRunId", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    const item = await store.findImportRun(request.params.importRunId);
    if (!item) {
      return reply.code(404).send({ message: "CAD import run was not found." });
    }
    const snapshot = (await store.listSnapshots()).find((candidate) => candidate.importRunId === item.id) ?? null;
    return { item, snapshot, warnings: await store.listWarnings({ importRunId: item.id }) };
  });

  app.get("/api/cad/snapshots", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    try {
      return { items: await getCadStore().listSnapshots(readSnapshotListQuery(request.query)) };
    } catch (error) {
      return handleCadQueryError(error, reply);
    }
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    const item = await store.findSnapshot(request.params.snapshotId);
    if (!item) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    const importRun = await store.findImportRun(item.importRunId);
    const rawSummaryJson = importRun?.rawSummaryJson ?? {};
    return {
      item,
      summary: {
        assemblyCount: (await store.listAssemblyNodes(item.id)).length,
        partDefinitionCount: (await store.listPartDefinitions(item.id)).length,
        partInstanceCount: (await store.listPartInstances(item.id)).length,
        mappingCount: (await store.listSnapshotMappings(item.id)).length,
        warningCount: (await store.listWarnings({ snapshotId: item.id })).length,
        originalFilename: importRun?.originalFilename ?? null,
        importRunCreatedAt: importRun?.createdAt ?? null,
        configuredParserMode: rawSummaryJson.configuredParserMode ?? rawSummaryJson.parserMode ?? null,
        actualParserVersion: rawSummaryJson.actualParserVersion ?? rawSummaryJson.parserVersion ?? importRun?.parserVersion ?? null,
        parserUsedPlaceholder: rawSummaryJson.parserUsedPlaceholder === true,
        ...rawSummaryJson,
        rawStats: rawSummaryJson,
      },
    };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/tree", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    if (!(await store.findSnapshot(request.params.snapshotId))) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return buildTree(store, request.params.snapshotId, readGroupInstancesQuery(request.query));
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/mappings", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    if (!(await store.findSnapshot(request.params.snapshotId))) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return {
      items: readGroupInstancesQuery(request.query)
        ? await groupedSnapshotMappings(store, request.params.snapshotId)
        : await snapshotMappings(store, request.params.snapshotId),
    };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/hierarchy-review", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const review = await buildCadHierarchyReview({ store: getCadStore(), snapshotId: request.params.snapshotId });
    return review ?? reply.code(404).send({ message: "CAD snapshot was not found." });
  });

  registerCadSnapshotActionRoutes(app, requireApiSession);
}

function handleCadQueryError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error && "statusCode" in error) {
    const statusCode = (error as Error & { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") {
      return reply.code(statusCode).send({ message: error.message });
    }
  }
  throw error;
}
