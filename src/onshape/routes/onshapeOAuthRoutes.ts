import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getSessionFromRequest, isAuthEnabled } from "../../auth/authService";
import { onshapeConfig } from "../../config/env";
import { getMembers } from "../../data/store";
import { getOnshapeRuntimeStore } from "../cadStore";
import { canManageOnshapeOAuthCredentials } from "../onshapeSyncPolicy";
import {
  buildOnshapeOAuthAuthorizationUrl,
  exchangeOnshapeOAuthCode,
  isOnshapeOAuthClientConfigured,
  isOnshapeOAuthRefreshConfigured,
  refreshOnshapeOAuthToken,
} from "../onshapeOAuth";

type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;

const ONSHAPE_OAUTH_SESSION_COOKIE = "meco_onshape_oauth_session";
const ONSHAPE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

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

function getApiSessionAccountId(request: FastifyRequest) {
  if (!isAuthEnabled()) {
    return null;
  }

  return getSessionFromRequest(request)?.accountId ?? null;
}

function canRequestManageOAuthCredentials(request: FastifyRequest) {
  const session = isAuthEnabled() ? getSessionFromRequest(request) : null;
  return canManageOnshapeOAuthCredentials({
    authEnabled: isAuthEnabled(),
    userEmail: session?.email ?? null,
    members: getMembers(),
  });
}

function requireOAuthCredentialPermission(request: FastifyRequest, reply: FastifyReply) {
  if (canRequestManageOAuthCredentials(request)) {
    return true;
  }

  reply.code(403).send({
    message: "Onshape OAuth credential management is restricted to leads, mentors, and admins.",
  });
  return false;
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

export async function registerOnshapeOAuthRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
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
    const apiSessionAccountId = getApiSessionAccountId(request);
    if (isAuthEnabled() && !apiSessionAccountId) {
      return reply.code(401).send({ message: "A signed-in Mission Control session is required." });
    }
    if (!requireOAuthCredentialPermission(request, reply)) {
      return;
    }

    const { state } = getOnshapeRuntimeStore().createOAuthState({
      sessionKey,
      apiSessionAccountId,
      apiSessionCanManageOAuthCredentials: true,
    });
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

    const store = getOnshapeRuntimeStore();
    if (!store.consumeOAuthState(state, {
      sessionKey,
      requireApiSession: isAuthEnabled(),
      requireCredentialManagementPermission: isAuthEnabled(),
    })) {
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
    if (!requireOAuthCredentialPermission(request, reply)) {
      return;
    }

    const store = getOnshapeRuntimeStore();
    const refreshToken = store.getOAuthTokenSet()?.refreshToken ?? onshapeConfig.oauthRefreshToken;
    if (!refreshToken) {
      return reply.code(409).send({ message: "No Onshape OAuth refresh token is available." });
    }

    const config = getOAuthConfig();
    if (!isOnshapeOAuthRefreshConfigured(config)) {
      return reply.code(409).send({
        message: "Onshape OAuth client ID and client secret are not configured.",
      });
    }

    const tokenSet = await refreshOnshapeOAuthToken({ config, refreshToken });
    store.setOAuthTokenSet(tokenSet);
    return { item: { connected: true, tokenExpiresAt: tokenSet.expiresAt } };
  });
}
