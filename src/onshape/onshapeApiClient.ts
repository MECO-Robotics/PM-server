import type { OnshapeCredentials, OnshapeReference, OnshapeTransport, RequestPolicy } from "./onshapeTypes";
import type { OnshapeRuntimeStore } from "./cadStore";

export class OnshapeCallBudgetExceededError extends Error {
  constructor(message = "max_calls_allowed") {
    super(message);
    this.name = "OnshapeCallBudgetExceededError";
  }
}

export class OnshapeRateLimitError extends Error {
  constructor(message = "rate_limit_429") {
    super(message);
    this.name = "OnshapeRateLimitError";
  }
}

export class OnshapeConfigurationError extends Error {
  constructor(message = "Onshape credentials are not configured.") {
    super(message);
    this.name = "OnshapeConfigurationError";
  }
}

export interface OnshapeRequestJsonArgs {
  endpoint: string;
  method: "GET" | "POST";
  reference: Partial<OnshapeReference>;
  requestHash: string;
  importRunId?: string | null;
  policy: RequestPolicy;
}

interface CreateClientArgs {
  store: OnshapeRuntimeStore;
  credentials: OnshapeCredentials;
  transport?: OnshapeTransport;
  baseUrl?: string;
}

function isImmutableReference(reference: Partial<OnshapeReference>) {
  return reference.referenceType === "version" || reference.referenceType === "microversion";
}

function normalizeHeaders(headers: Record<string, string | number | undefined>) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized[key.toLowerCase()] = String(value);
    }
  }
  return normalized;
}

function readRateLimitRemaining(headers: Record<string, string>) {
  const raw = headers["x-rate-limit-remaining"] ?? headers["x-ratelimit-remaining"];
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCacheFresh(expiresAt: string | null) {
  return Boolean(expiresAt && Date.parse(expiresAt) > Date.now());
}

function workspaceExpiresAt() {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}

function referenceIdentity(reference: Partial<OnshapeReference>) {
  const parts = [`d/${reference.documentId ?? "unknown"}`];
  if (reference.workspaceId) {
    parts.push(`w/${reference.workspaceId}`);
  }
  if (reference.versionId) {
    parts.push(`v/${reference.versionId}`);
  }
  if (reference.microversionId) {
    parts.push(`m/${reference.microversionId}`);
  }
  if (reference.elementId) {
    parts.push(`e/${reference.elementId}`);
  }
  return parts.join(":");
}

export function buildOnshapeCacheKey(args: {
  endpoint: string;
  method: "GET" | "POST";
  reference: Partial<OnshapeReference>;
  requestHash: string;
}) {
  return `${args.method}:${args.endpoint}:${referenceIdentity(args.reference)}:${args.requestHash}`;
}

function buildAuthHeaders(credentials: OnshapeCredentials): Record<string, string> {
  if (credentials.mode === "oauth") {
    if (!credentials.bearerToken) {
      throw new OnshapeConfigurationError("Onshape OAuth token is not configured.");
    }
    return { Authorization: `Bearer ${credentials.bearerToken}` };
  }

  if (!credentials.accessKey || !credentials.secretKey) {
    throw new OnshapeConfigurationError();
  }

  return {
    "X-Onshape-Access-Key": credentials.accessKey,
    "X-Onshape-Auth-Mode": "api_key_placeholder",
  };
}

async function defaultTransport(baseUrl: string, request: Parameters<OnshapeTransport>[0]) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${request.endpoint}`, {
    method: request.method,
    headers: request.headers,
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
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { statusCode: response.status, headers, json };
}

export function createOnshapeApiClient({
  store,
  credentials,
  transport,
  baseUrl = "https://cad.onshape.com",
}: CreateClientArgs) {
  let callsUsed = 0;
  const activeTransport: OnshapeTransport = transport ?? ((request) => defaultTransport(baseUrl, request));

  return {
    getCallsUsed() {
      return callsUsed;
    },
    async requestJson<T = unknown>(args: OnshapeRequestJsonArgs): Promise<T> {
      const cacheKey = buildOnshapeCacheKey(args);
      const requestStartedAt = new Date().toISOString();
      const cached = args.policy.allowCached && !args.policy.requireFresh ? store.findCacheEntry(cacheKey) : null;
      if (cached && (cached.immutable || isCacheFresh(cached.expiresAt))) {
        store.appendRequestLog({
          importRunId: args.importRunId ?? null,
          endpoint: args.endpoint,
          method: args.method,
          cacheKey,
          usedCache: true,
          statusCode: 200,
          requestStartedAt,
          requestCompletedAt: new Date().toISOString(),
          responseHeadersJson: cached.responseHeadersJson,
          rateLimitRemaining: store.getBudget().lastRateLimitRemaining,
          errorMessage: null,
        });
        return cached.responseJson as T;
      }

      assertCallIsAllowed(store, args, callsUsed, cacheKey, requestStartedAt);
      const headers = buildHeadersOrLogError(store, args, credentials, cacheKey, requestStartedAt);
      const response = await activeTransport({ endpoint: args.endpoint, method: args.method, headers });
      callsUsed += 1;
      const responseHeaders = normalizeHeaders(response.headers);
      const rateLimitRemaining = readRateLimitRemaining(responseHeaders);
      store.recordApiCall(1, rateLimitRemaining);
      store.appendRequestLog({
        importRunId: args.importRunId ?? null,
        endpoint: args.endpoint,
        method: args.method,
        cacheKey,
        usedCache: false,
        statusCode: response.statusCode,
        requestStartedAt,
        requestCompletedAt: new Date().toISOString(),
        responseHeadersJson: responseHeaders,
        rateLimitRemaining,
        errorMessage: response.statusCode === 429 ? "rate_limit_429" : null,
      });

      if (response.statusCode === 429) {
        throw new OnshapeRateLimitError();
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`Onshape request failed with status ${response.statusCode}.`);
      }

      store.writeCacheEntry({
        cacheKey,
        endpoint: args.endpoint,
        method: args.method,
        requestHash: args.requestHash,
        responseJson: response.json,
        responseHeadersJson: responseHeaders,
        reference: args.reference,
        immutable: isImmutableReference(args.reference),
        expiresAt: isImmutableReference(args.reference) ? null : workspaceExpiresAt(),
      });
      return response.json as T;
    },
  };
}

function assertCallIsAllowed(
  store: OnshapeRuntimeStore,
  args: OnshapeRequestJsonArgs,
  callsUsed: number,
  cacheKey: string,
  requestStartedAt: string,
) {
  if (callsUsed >= args.policy.maxCallsAllowed) {
    store.appendRequestLog({
      importRunId: args.importRunId ?? null,
      endpoint: args.endpoint,
      method: args.method,
      cacheKey,
      usedCache: false,
      statusCode: null,
      requestStartedAt,
      requestCompletedAt: new Date().toISOString(),
      responseHeadersJson: {},
      rateLimitRemaining: store.getBudget().lastRateLimitRemaining,
      errorMessage: "max_calls_allowed",
    });
    throw new OnshapeCallBudgetExceededError();
  }

  const remaining = store.getBudget().lastRateLimitRemaining;
  if (args.policy.stopIfRemainingBelow !== undefined && remaining !== null && remaining < args.policy.stopIfRemainingBelow) {
    throw new OnshapeCallBudgetExceededError("rate_limit_remaining_below_policy");
  }
}

function buildHeadersOrLogError(
  store: OnshapeRuntimeStore,
  args: OnshapeRequestJsonArgs,
  credentials: OnshapeCredentials,
  cacheKey: string,
  requestStartedAt: string,
) {
  try {
    return buildAuthHeaders(credentials);
  } catch (error) {
    store.appendRequestLog({
      importRunId: args.importRunId ?? null,
      endpoint: args.endpoint,
      method: args.method,
      cacheKey,
      usedCache: false,
      statusCode: null,
      requestStartedAt,
      requestCompletedAt: new Date().toISOString(),
      responseHeadersJson: {},
      rateLimitRemaining: store.getBudget().lastRateLimitRemaining,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
