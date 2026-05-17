import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { onshapeConfig } from "../../config/env";
import { getOnshapeRuntimeStore } from "../cadStore";
import {
  hasUsableOnshapeOAuthCredentials,
  isOnshapeOAuthClientConfigured,
  isOnshapeOAuthRefreshConfigured,
} from "../onshapeOAuth";
import {
  onshapeDocumentRefSchema,
  onshapeImportEstimateQuerySchema,
} from "../onshapeRouteSchemas";
import { estimateOnshapeSync } from "../onshapeSyncPolicy";
import { parseOnshapeUrl } from "../onshapeUrlParser";

type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;

function readEstimateQuery(query: unknown) {
  return onshapeImportEstimateQuerySchema.safeParse(query ?? {});
}

function getOAuthConfig() {
  return {
    clientId: onshapeConfig.oauthClientId,
    clientSecret: onshapeConfig.oauthClientSecret,
    redirectUri: onshapeConfig.oauthRedirectUri,
    authorizationUrl: onshapeConfig.oauthAuthorizationUrl,
    tokenUrl: onshapeConfig.oauthTokenUrl,
    scopes: onshapeConfig.oauthScopes,
  };
}

function getOAuthStatus(store: ReturnType<typeof getOnshapeRuntimeStore>) {
  const tokenSet = store.getOAuthTokenSet();
  const config = getOAuthConfig();
  const clientConfigured = isOnshapeOAuthClientConfigured(config);
  const refreshConfigured = isOnshapeOAuthRefreshConfigured(config);
  const runtimeConnected = hasUsableOnshapeOAuthCredentials({
    accessToken: tokenSet?.accessToken,
    refreshToken: tokenSet?.refreshToken,
    refreshConfigured,
  });
  const envConnected = hasUsableOnshapeOAuthCredentials({
    accessToken: onshapeConfig.oauthAccessToken,
    refreshToken: onshapeConfig.oauthRefreshToken,
    refreshConfigured,
  });
  return {
    clientConfigured,
    connected: runtimeConnected || envConnected,
    authorizationUrlAvailable: clientConfigured,
    scopes: onshapeConfig.oauthScopes,
    tokenExpiresAt: tokenSet?.expiresAt ?? onshapeConfig.oauthTokenExpiresAt ?? null,
    credentialSource: tokenSet ? "runtime" : (envConnected ? "env" : "none"),
  };
}

function getOverview() {
  const store = getOnshapeRuntimeStore();
  const snapshots = store.listSnapshots();
  const latestSnapshot = snapshots[0] ?? null;
  return {
    connection: {
      authMode: "oauth",
      baseUrl: onshapeConfig.baseUrl,
      configured: onshapeConfig.enabled,
      credentialReference: onshapeConfig.credentialReference,
      oauth: getOAuthStatus(store),
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

export async function registerOnshapeReferenceRoutes(
  app: FastifyInstance,
  requireApiSession: RequireApiSession,
) {
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

  app.get("/api/onshape/budget", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    return { item: getOnshapeRuntimeStore().getBudget() };
  });
}
