import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getSessionFromRequest, isAuthEnabled } from "../auth/authService";
import { onshapeConfig } from "../config/env";
import { getMembers } from "../data/store";
import { getOnshapeRuntimeStore } from "./cadStore";
import { runCadImport } from "./cadImporter";
import { createConfiguredOnshapeCadClient } from "./onshapeClientFactory";
import {
  onshapeDocumentRefSchema,
  onshapeImportEstimateQuerySchema,
  onshapeImportRunSchema,
  onshapeListQuerySchema,
} from "./onshapeRouteSchemas";
import { canRunDeepReleaseSync, estimateOnshapeSync } from "./onshapeSyncPolicy";
import { parseOnshapeUrl } from "./onshapeUrlParser";
import type { CadImportOnshapeClient } from "./onshapeTypes";

type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;

function createNoopClient(): CadImportOnshapeClient {
  return {
    getCallsUsed: () => 0,
    async fetchDocumentMetadata() {
      throw new Error("Link-only imports do not fetch Onshape metadata.");
    },
    async fetchAssemblyBom() {
      throw new Error("Link-only imports do not fetch Onshape BOM data.");
    },
  };
}

function latestSnapshotId(store: ReturnType<typeof getOnshapeRuntimeStore>, documentRefId?: string) {
  return store.listSnapshots(documentRefId)[0]?.id;
}

function readListQuery(query: unknown) {
  const parsed = onshapeListQuerySchema.safeParse(query ?? {});
  return parsed.success ? parsed.data : {};
}

function readEstimateQuery(query: unknown) {
  return onshapeImportEstimateQuerySchema.safeParse(query ?? {});
}

function requireDeepReleasePermission(request: FastifyRequest, reply: FastifyReply) {
  const session = isAuthEnabled() ? getSessionFromRequest(request) : null;
  if (canRunDeepReleaseSync({
    authEnabled: isAuthEnabled(),
    userEmail: session?.email ?? null,
    members: getMembers(),
  })) {
    return true;
  }

  reply.code(403).send({
    message: "Deep release sync is restricted to leads, mentors, and admins.",
  });
  return false;
}

function getOverview() {
  const store = getOnshapeRuntimeStore();
  const snapshots = store.listSnapshots();
  const latestSnapshot = snapshots[0] ?? null;
  return {
    connection: {
      authMode: onshapeConfig.bearerToken ? "oauth" : "api_key",
      baseUrl: onshapeConfig.baseUrl,
      configured: onshapeConfig.enabled,
      credentialReference: onshapeConfig.credentialReference,
      lastError: null,
    },
    documentRefs: store.listDocumentRefs(),
    importRuns: store.listImportRuns(),
    snapshots,
    latestSnapshot,
    assemblyNodes: latestSnapshot ? store.listAssemblyNodes(latestSnapshot.id) : [],
    partDefinitions: latestSnapshot ? store.listPartDefinitions(latestSnapshot.id) : [],
    partInstances: latestSnapshot ? store.listPartInstances(latestSnapshot.id) : [],
    warnings: store.listWarnings(),
    budget: store.getBudget(),
  };
}

export async function registerOnshapeRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.get("/api/onshape/overview", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    return getOverview();
  });

  app.get("/api/onshape/document-refs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    return { items: getOnshapeRuntimeStore().listDocumentRefs() };
  });

  app.get("/api/onshape/import-estimate", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const parsedQuery = readEstimateQuery(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({
        message: "Onshape import estimate query is invalid.",
        issues: parsedQuery.error.flatten(),
      });
    }

    const item = estimateOnshapeSync({
      store: getOnshapeRuntimeStore(),
      documentRefId: parsedQuery.data.documentRefId,
      syncLevel: parsedQuery.data.syncLevel,
    });
    if (!item) {
      return reply.code(404).send({ message: "Onshape document reference not found." });
    }

    return { item };
  });

  app.post("/api/onshape/document-refs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const parsedBody = onshapeDocumentRefSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        message: "Onshape document reference payload is invalid.",
        issues: parsedBody.error.flatten(),
      });
    }

    const parsedUrl = parseOnshapeUrl(parsedBody.data.url);
    if (!parsedUrl.ok) {
      return reply.code(400).send({
        message: "Onshape URL is invalid.",
        issues: parsedUrl.errors,
      });
    }

    const item = getOnshapeRuntimeStore().createDocumentRef({
      label: parsedBody.data.label ?? parsedUrl.elementId ?? parsedUrl.documentId ?? "Onshape reference",
      parsed: parsedUrl,
      createdBy: parsedBody.data.createdBy ?? null,
      projectId: parsedBody.data.projectId ?? null,
      seasonId: parsedBody.data.seasonId ?? null,
      subsystemId: parsedBody.data.subsystemId ?? null,
      mechanismId: parsedBody.data.mechanismId ?? null,
    });

    return reply.code(201).send({ item, parse: parsedUrl, warnings: parsedUrl.errors });
  });

  app.post("/api/onshape/import-runs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const parsedBody = onshapeImportRunSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        message: "Onshape import run payload is invalid.",
        issues: parsedBody.error.flatten(),
      });
    }

    const store = getOnshapeRuntimeStore();
    const documentRef = store.findDocumentRef(parsedBody.data.documentRefId);
    if (!documentRef) {
      return reply.code(404).send({ message: "Onshape document reference not found." });
    }
    if (parsedBody.data.syncLevel === "deep_release" && !requireDeepReleasePermission(request, reply)) {
      return;
    }

    const client = parsedBody.data.syncLevel === "link_only"
      ? createNoopClient()
      : createConfiguredOnshapeCadClient(store, onshapeConfig);
    const result = await runCadImport({
      store,
      documentRefId: documentRef.id,
      syncLevel: parsedBody.data.syncLevel,
      requestedBy: parsedBody.data.requestedBy ?? null,
      client,
    });

    return reply.code(result.status === "failed" ? 502 : 201).send({ result });
  });

  app.get("/api/onshape/import-runs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const query = readListQuery(request.query);
    return { items: getOnshapeRuntimeStore().listImportRuns(query.documentRefId) };
  });

  app.get<{ Params: { importRunId: string } }>(
    "/api/onshape/import-runs/:importRunId",
    async (request, reply) => {
      if (!requireApiSession(request, reply)) {
        return;
      }

      const store = getOnshapeRuntimeStore();
      const item = store.findImportRun(request.params.importRunId);
      if (!item) {
        return reply.code(404).send({ message: "Onshape import run not found." });
      }

      return {
        item,
        requestLogs: store.listRequestLogs(item.id),
        warnings: store.listWarnings({ importRunId: item.id }),
        snapshots: store.listSnapshots(item.onshapeDocumentRefId).filter(
          (snapshot) => snapshot.importRunId === item.id,
        ),
      };
    },
  );

  app.get("/api/onshape/snapshots", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const query = readListQuery(request.query);
    return { items: getOnshapeRuntimeStore().listSnapshots(query.documentRefId) };
  });

  app.get("/api/onshape/cad-tree", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const store = getOnshapeRuntimeStore();
    const query = readListQuery(request.query);
    const snapshotId = query.snapshotId ?? latestSnapshotId(store, query.documentRefId);
    return {
      snapshotId: snapshotId ?? null,
      items: snapshotId ? store.listAssemblyNodes(snapshotId) : [],
    };
  });

  app.get("/api/onshape/parts", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const store = getOnshapeRuntimeStore();
    const query = readListQuery(request.query);
    const snapshotId = query.snapshotId ?? latestSnapshotId(store, query.documentRefId);
    return {
      snapshotId: snapshotId ?? null,
      partDefinitions: snapshotId ? store.listPartDefinitions(snapshotId) : [],
      partInstances: snapshotId ? store.listPartInstances(snapshotId) : [],
    };
  });

  app.get("/api/onshape/warnings", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const query = readListQuery(request.query);
    return { items: getOnshapeRuntimeStore().listWarnings({ snapshotId: query.snapshotId }) };
  });

  app.get("/api/onshape/budget", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    return { item: getOnshapeRuntimeStore().getBudget() };
  });
}
