import type { OnshapeOAuthTokenSet } from "./onshapeTypes";

export interface OnshapeOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface OnshapeOAuthTokenTransportResponse {
  statusCode: number;
  json: unknown;
}

export type OnshapeOAuthTokenTransport = (request: {
  tokenUrl: string;
  body: URLSearchParams;
  headers: Record<string, string>;
}) => Promise<OnshapeOAuthTokenTransportResponse>;

let testTokenTransport: OnshapeOAuthTokenTransport | null = null;

export function setOnshapeOAuthTokenTransportForTests(transport: OnshapeOAuthTokenTransport | null) {
  testTokenTransport = transport;
}

export function isOnshapeOAuthClientConfigured(config: Pick<OnshapeOAuthConfig, "clientId" | "clientSecret" | "redirectUri">) {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

function isOnshapeOAuthRefreshConfigured(config: Pick<OnshapeOAuthConfig, "clientId" | "clientSecret">) {
  return Boolean(config.clientId && config.clientSecret);
}

export function buildOnshapeOAuthAuthorizationUrl(args: {
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}) {
  const url = new URL(args.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  if (args.scopes.length > 0) {
    url.searchParams.set("scope", args.scopes.join(" "));
  }
  return url;
}

export function normalizeOnshapeOAuthTokenResponse(args: {
  json: unknown;
  receivedAtMs?: number;
  fallbackRefreshToken?: string | null;
}): OnshapeOAuthTokenSet {
  const payload = args.json && typeof args.json === "object" ? args.json as Record<string, unknown> : {};
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  if (!accessToken) {
    throw new Error("Onshape OAuth token response did not include an access token.");
  }

  const receivedAtMs = args.receivedAtMs ?? Date.now();
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;
  const refreshToken = typeof payload.refresh_token === "string"
    ? payload.refresh_token
    : (args.fallbackRefreshToken ?? null);

  return {
    accessToken,
    refreshToken,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    scope: typeof payload.scope === "string" ? payload.scope : null,
    expiresAt: expiresIn ? new Date(receivedAtMs + expiresIn * 1000).toISOString() : null,
    receivedAt: new Date(receivedAtMs).toISOString(),
  };
}

export function shouldRefreshOnshapeOAuthToken(tokenSet: OnshapeOAuthTokenSet | null, nowMs = Date.now(), skewMs = 60_000) {
  if (!tokenSet?.expiresAt) {
    return false;
  }
  return Date.parse(tokenSet.expiresAt) - nowMs <= skewMs;
}

export async function exchangeOnshapeOAuthCode(args: {
  config: OnshapeOAuthConfig;
  code: string;
  transport?: OnshapeOAuthTokenTransport;
}) {
  requireOAuthClientConfig(args.config);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: args.config.clientId!,
    client_secret: args.config.clientSecret!,
    redirect_uri: args.config.redirectUri!,
  });
  return requestOAuthToken({
    tokenUrl: args.config.tokenUrl,
    body,
    transport: args.transport,
  });
}

export async function refreshOnshapeOAuthToken(args: {
  config: OnshapeOAuthConfig;
  refreshToken: string;
  transport?: OnshapeOAuthTokenTransport;
}) {
  requireOAuthRefreshConfig(args.config);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.config.clientId!,
    client_secret: args.config.clientSecret!,
  });
  return requestOAuthToken({
    tokenUrl: args.config.tokenUrl,
    body,
    fallbackRefreshToken: args.refreshToken,
    transport: args.transport,
  });
}

function requireOAuthClientConfig(config: OnshapeOAuthConfig) {
  if (!isOnshapeOAuthClientConfigured(config)) {
    throw new Error("Onshape OAuth client ID, client secret, and redirect URI are required.");
  }
}

function requireOAuthRefreshConfig(config: OnshapeOAuthConfig) {
  if (!isOnshapeOAuthRefreshConfigured(config)) {
    throw new Error("Onshape OAuth client ID and client secret are required.");
  }
}

async function requestOAuthToken(args: {
  tokenUrl: string;
  body: URLSearchParams;
  fallbackRefreshToken?: string | null;
  transport?: OnshapeOAuthTokenTransport;
}) {
  const transport = args.transport ?? testTokenTransport ?? defaultTokenTransport;
  const response = await transport({
    tokenUrl: args.tokenUrl,
    body: args.body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Onshape OAuth token request failed with status ${response.statusCode}.`);
  }
  return normalizeOnshapeOAuthTokenResponse({
    json: response.json,
    fallbackRefreshToken: args.fallbackRefreshToken,
  });
}

async function defaultTokenTransport(request: {
  tokenUrl: string;
  body: URLSearchParams;
  headers: Record<string, string>;
}) {
  const response = await fetch(request.tokenUrl, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  const text = await response.text();
  let json: unknown = {};
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { rawText: text };
    }
  }
  return { statusCode: response.status, json };
}
