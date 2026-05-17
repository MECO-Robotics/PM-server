import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getSessionFromRequest, isAuthEnabled } from "../auth/authService";
import { onshapeConfig } from "../config/env";
import { getMembers } from "../data/store";
import { getOnshapeRuntimeStore } from "./cadStore";
import { runCadImport } from "./cadImporter";
import {
  buildOnshapeOAuthAuthorizationUrl,
  exchangeOnshapeOAuthCode,
  isOnshapeOAuthClientConfigured,
  refreshOnshapeOAuthToken,
} from "./onshapeOAuth";
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

const ONSHAPE_OAUTH_SESSION_COOKIE = "meco_onshape_oauth_session";
const ONSHAPE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

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

function getCookieHeader(request: FastifyRequest) {
  const header = request.headers.cookie;
  return Array.isArray(header) ? header.join(";") : (header ?? "");
}

function readCookieValue(request: FastifyRequest, name: string) {
  const cookieHeader = getCookieHeader(request);
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function buildOAuthSessionCookie(sessionKey: string) {
  const secureAttribute = onshapeConfig.oauthRedirectUri?.startsWith("https://") ? "Secure" : "";
  return [
    `${ONSHAPE_OAUTH_SESSION_COOKIE}=${encodeURIComponent(sessionKey)}`,
    "Path=/api/onshape/oauth/callback",
    `Max-Age=${ONSHAPE_OAUTH_STATE_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    secureAttribute,
  ].filter(Boolean).join("; ");
}

function buildExpiredOAuthSessionCookie() {
  return `${ONSHAPE_OAUTH_SESSION_COOKIE}=; Path=/api/onshape/oauth/callback; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function resolveOAuthCallbackSessionKey(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const sessionKey = readCookieValue(request, ONSHAPE_OAUTH_SESSION_COOKIE);
  if (sessionKey) {
    return sessionKey;
  }

  reply.code(400).send({ message: "Onshape OAuth session state is missing or expired. Start the connection again in the same browser session." });
  return null;
}

function getOAuthStatus(store: ReturnType<typeof getOnshapeRuntimeStore>) {
  const tokenSet = store.getOAuthTokenSet();
  const envConnected = Boolean(onshapeConfig.oauthAccessToken || onshapeConfig.oauthRefreshToken);
  return {
    clientConfigured: isOnshapeOAuthClientConfigured(getOAuthConfig()),
    connected: Boolean(tokenSet || envConnected),
    authorizationUrlAvailable: isOnshapeOAuthClientConfigured(getOAuthConfig()),
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

export async function registerOnshapeRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.get("/api/onshape/overview", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    return getOverview();
  });

  app.post("/api/onshape/oauth/authorization-url", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const config = getOAuthConfig();
    if (!isOnshapeOAuthClientConfigured(config)) {
      return reply.code(409).send({
        message: "Onshape OAuth client ID, client secret, and redirect URI are not configured.",
      });
    }

    const sessionKey = randomUUID();
    const { state } = getOnshapeRuntimeStore().createOAuthState({ sessionKey });
    reply.header("Set-Cookie", buildOAuthSessionCookie(sessionKey));
    return {
      authorizationUrl: buildOnshapeOAuthAuthorizationUrl({
        authorizationUrl: config.authorizationUrl,
        clientId: config.clientId!,
        redirectUri: config.redirectUri!,
        scopes: config.scopes,
        state,
      }).toString(),
      state,
    };
  });

  app.get("/api/onshape/oauth/callback", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const code = typeof query.code === "string" ? query.code : null;
    const state = typeof query.state === "string" ? query.state : null;
    if (!code || !state) {
      return reply
        .header("Set-Cookie", buildExpiredOAuthSessionCookie())
        .code(400)
        .send({ message: "Onshape OAuth callback requires code and state." });
    }

    const sessionKey = resolveOAuthCallbackSessionKey(request, reply);
    if (!sessionKey) {
      return;
    }

    // Browser redirects cannot attach the SPA bearer token; the callback is tied
    // to the authenticated initiation route by the short-lived state cookie.
    const store = getOnshapeRuntimeStore();
    if (!store.consumeOAuthState(state, { sessionKey })) {
      return reply
        .header("Set-Cookie", buildExpiredOAuthSessionCookie())
        .code(400)
        .send({ message: "Onshape OAuth state is invalid, expired, or belongs to a different browser session." });
    }

    const tokenSet = await exchangeOnshapeOAuthCode({ config: getOAuthConfig(), code });
    store.setOAuthTokenSet(tokenSet);
    return reply
      .header("Set-Cookie", buildExpiredOAuthSessionCookie())
      .type("text/html")
      .send(
        "<!doctype html><title>Onshape connected</title><p>Onshape OAuth connection complete. You can close this tab and return to Mission Control.</p>",
      );
  });

  app.post("/api/onshape/oauth/refresh", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }

    const store = getOnshapeRuntimeStore();
    const refreshToken = store.getOAuthTokenSet()?.refreshToken ?? onshapeConfig.oauthRefreshToken;
    if (!refreshToken) {
      return reply.code(409).send({ message: "No Onshape OAuth refresh token is available." });
    }

    const tokenSet = await refreshOnshapeOAuthToken({ config: getOAuthConfig(), refreshToken });
    store.setOAuthTokenSet(tokenSet);
    return { item: { connected: true, tokenExpiresAt: tokenSet.expiresAt } };
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
      : await createConfiguredOnshapeCadClient(store, onshapeConfig);
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
