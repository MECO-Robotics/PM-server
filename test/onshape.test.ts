import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";

import { runCadImport } from "../src/onshape/cadImporter";
import {
  createOnshapeRuntimeStore,
  type OnshapeRuntimeStore,
} from "../src/onshape/cadStore";
import {
  buildOnshapeCacheKey,
  createOnshapeApiClient,
  OnshapeCallBudgetExceededError,
  OnshapeRateLimitError,
} from "../src/onshape/onshapeApiClient";
import { createOnshapeCadClient } from "../src/onshape/onshapeCadClient";
import { parseOnshapeUrl } from "../src/onshape/onshapeUrlParser";
import { canRunDeepReleaseSync, estimateOnshapeSync } from "../src/onshape/onshapeSyncPolicy";
import type {
  CadImportOnshapeClient,
  OnshapeAssemblyBomResponse,
  OnshapeDocumentMetadataResponse,
  OnshapeReference,
} from "../src/onshape/onshapeTypes";

const workspaceUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/w/abcdefabcdefabcdefabcdef/e/111111111111111111111111";
const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111?renderMode=0";
const microversionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/m/333333333333333333333333/e/111111111111111111111111";

function createLinkedRef(store: OnshapeRuntimeStore, url = versionUrl) {
  return store.createDocumentRef({
    label: "Robot master assembly",
    originalUrl: url,
    parsed: parseOnshapeUrl(url),
    createdBy: "test-user",
    projectId: "project-1",
  });
}

function createFakeClient(options: {
  metadata?: OnshapeDocumentMetadataResponse;
  bom?: OnshapeAssemblyBomResponse;
  fail?: Error;
}): CadImportOnshapeClient {
  let callsUsed = 0;
  return {
    getCallsUsed() {
      return callsUsed;
    },
    async fetchDocumentMetadata() {
      callsUsed += 1;
      if (options.fail) {
        throw options.fail;
      }
      return options.metadata ?? {
        documentName: "2026 Robot",
        elementName: "Master Assembly",
        raw: { document: "raw" },
      };
    },
    async fetchAssemblyBom() {
      callsUsed += 1;
      if (options.fail) {
        throw options.fail;
      }
      return options.bom ?? {
        assemblyNodes: [
          {
            sourceId: "asm-root",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            instanceId: "root",
            instancePath: "/root",
            name: "2026 Robot",
            inferredType: "master_assembly",
          },
          {
            sourceId: "asm-drive",
            parentSourceId: "asm-root",
            documentId: "0123456789abcdef01234567",
            elementId: "drive-element",
            instanceId: "drive-1",
            instancePath: "/root/drive",
            name: "Drive Subsystem",
            inferredType: "subsystem_candidate",
          },
        ],
        partDefinitions: [
          {
            sourceId: "part-drive-rail-default",
            documentId: "0123456789abcdef01234567",
            elementId: "drive-element",
            partId: "drive-rail",
            name: "Drive rail",
            partNumber: "DRV-001",
            configuration: "default",
            customProperties: { manufacturingMethod: "cnc" },
          },
        ],
        partInstances: [
          {
            sourceId: "inst-drive-rail-left",
            partDefinitionSourceId: "part-drive-rail-default",
            parentAssemblySourceId: "asm-drive",
            documentId: "0123456789abcdef01234567",
            elementId: "drive-element",
            instanceId: "drive-rail-left",
            partId: "drive-rail",
            instancePath: "/root/drive/left-rail",
            quantity: 1,
            configuration: "default",
          },
        ],
        raw: { bom: "raw" },
      };
    },
  };
}

function expectedOnshapeApiKeyAuthorization(args: {
  accessKey: string;
  secretKey: string;
  method: "GET" | "POST";
  endpoint: string;
  nonce: string;
  date: string;
  contentType: string;
}) {
  const url = new URL(args.endpoint, "https://cad.onshape.com/");
  const signatureInput = [
    args.method,
    args.nonce,
    args.date,
    args.contentType,
    url.pathname,
    url.search ? url.search.slice(1) : "",
    "",
  ].join("\n").toLowerCase();
  const signature = createHmac("sha256", args.secretKey).update(signatureInput).digest("base64");
  return `On ${args.accessKey}:HmacSHA256:${signature}`;
}

test("parses common Onshape URL shapes without network access", () => {
  assert.deepEqual(parseOnshapeUrl(workspaceUrl), {
    ok: true,
    documentId: "0123456789abcdef01234567",
    workspaceId: "abcdefabcdefabcdefabcdef",
    versionId: undefined,
    microversionId: undefined,
    elementId: "111111111111111111111111",
    originalUrl: workspaceUrl,
    referenceType: "workspace",
    errors: [],
  });

  assert.equal(parseOnshapeUrl(versionUrl).referenceType, "version");
  assert.equal(parseOnshapeUrl(versionUrl).versionId, "222222222222222222222222");
  assert.equal(parseOnshapeUrl(microversionUrl).referenceType, "microversion");
  assert.equal(parseOnshapeUrl(microversionUrl).microversionId, "333333333333333333333333");

  const missingElement = parseOnshapeUrl(
    "https://cad.onshape.com/documents/0123456789abcdef01234567/w/abcdefabcdefabcdefabcdef",
  );
  assert.equal(missingElement.ok, true);
  assert.equal(missingElement.elementId, undefined);
  assert.match(missingElement.errors.join(" "), /elementId/i);

  assert.equal(parseOnshapeUrl("not-a-url").ok, false);
  assert.equal(parseOnshapeUrl("https://example.com/documents/abc/w/def/e/ghi").ok, false);
});

test("builds stable cache keys with immutable version identity", () => {
  const reference = parseOnshapeUrl(versionUrl);
  assert.equal(
    buildOnshapeCacheKey({
      endpoint: "/api/documents/d/0123456789abcdef01234567",
      method: "GET",
      reference,
      requestHash: "metadata",
    }),
    "GET:/api/documents/d/0123456789abcdef01234567:d/0123456789abcdef01234567:v/222222222222222222222222:e/111111111111111111111111:metadata",
  );
});

test("signs API-key Onshape requests with HMAC authorization headers", async () => {
  const store = createOnshapeRuntimeStore();
  const reference = parseOnshapeUrl(workspaceUrl);
  const date = new Date("2026-01-02T03:04:05.000Z");
  const nonce = "abcdefghijklmnop";
  const endpoint = "/api/documents/d/0123456789abcdef01234567?b=2&a=1";
  let capturedHeaders: Record<string, string> | undefined;
  const client = createOnshapeApiClient({
    store,
    credentials: { mode: "api_key", accessKey: "access-key", secretKey: "secret-key" },
    now: () => date,
    nonceFactory: () => nonce,
    transport: async (request) => {
      capturedHeaders = request.headers;
      return { statusCode: 200, headers: {}, json: { ok: true } };
    },
  });

  await client.requestJson({
    endpoint,
    method: "GET",
    reference,
    requestHash: "signed-request",
    policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: false, requireFresh: true },
  });

  const headers = capturedHeaders;
  assert.ok(headers);
  assert.equal(headers.Date, date.toUTCString());
  assert.equal(headers["On-Nonce"], nonce);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(
    headers.Authorization,
    expectedOnshapeApiKeyAuthorization({
      accessKey: "access-key",
      secretKey: "secret-key",
      method: "GET",
      endpoint,
      nonce,
      date: date.toUTCString(),
      contentType: "application/json",
    }),
  );
  assert.equal(headers["X-Onshape-Auth-Mode"], undefined);
});

test("serves immutable cached responses without spending calls", async () => {
  const store = createOnshapeRuntimeStore();
  const reference = parseOnshapeUrl(versionUrl);
  const endpoint = "/api/documents/d/0123456789abcdef01234567";
  const cacheKey = buildOnshapeCacheKey({ endpoint, method: "GET", reference, requestHash: "metadata" });
  store.writeCacheEntry({
    cacheKey,
    endpoint,
    method: "GET",
    requestHash: "metadata",
    responseJson: { cached: true },
    responseHeadersJson: { "x-test": "cached" },
    reference,
    immutable: true,
    expiresAt: null,
  });

  let transportCalls = 0;
  const client = createOnshapeApiClient({
    store,
    credentials: { mode: "api_key", accessKey: "key", secretKey: "secret" },
    transport: async () => {
      transportCalls += 1;
      return { statusCode: 200, headers: {}, json: { cached: false } };
    },
  });

  const result = await client.requestJson({
    endpoint,
    method: "GET",
    reference,
    requestHash: "metadata",
    policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: true, requireFresh: false },
  });

  assert.deepEqual(result, { cached: true });
  assert.equal(transportCalls, 0);
  assert.equal(client.getCallsUsed(), 0);
  assert.equal(store.listRequestLogs().at(-1)?.usedCache, true);
});

test("expires workspace cache entries but keeps fresh workspace entries local", async () => {
  const store = createOnshapeRuntimeStore();
  const reference = parseOnshapeUrl(workspaceUrl);
  const endpoint = "/api/documents/d/0123456789abcdef01234567";
  const cacheKey = buildOnshapeCacheKey({ endpoint, method: "GET", reference, requestHash: "metadata" });

  store.writeCacheEntry({
    cacheKey,
    endpoint,
    method: "GET",
    requestHash: "metadata",
    responseJson: { cached: "fresh" },
    responseHeadersJson: {},
    reference,
    immutable: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  let transportCalls = 0;
  const client = createOnshapeApiClient({
    store,
    credentials: { mode: "api_key", accessKey: "key", secretKey: "secret" },
    transport: async () => {
      transportCalls += 1;
      return { statusCode: 200, headers: {}, json: { cached: "network" } };
    },
  });

  assert.deepEqual(
    await client.requestJson({
      endpoint,
      method: "GET",
      reference,
      requestHash: "metadata",
      policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: true, requireFresh: false },
    }),
    { cached: "fresh" },
  );
  assert.equal(transportCalls, 0);

  store.writeCacheEntry({
    cacheKey,
    endpoint,
    method: "GET",
    requestHash: "metadata",
    responseJson: { cached: "stale" },
    responseHeadersJson: {},
    reference,
    immutable: false,
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });

  assert.deepEqual(
    await client.requestJson({
      endpoint,
      method: "GET",
      reference,
      requestHash: "metadata",
      policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: true, requireFresh: false },
    }),
    { cached: "network" },
  );
  assert.equal(transportCalls, 1);
});

test("enforces per-sync call budgets before network transport", async () => {
  const store = createOnshapeRuntimeStore();
  const reference = parseOnshapeUrl(workspaceUrl);
  let transportCalls = 0;
  const client = createOnshapeApiClient({
    store,
    credentials: { mode: "api_key", accessKey: "key", secretKey: "secret" },
    transport: async () => {
      transportCalls += 1;
      return { statusCode: 200, headers: {}, json: { ok: true } };
    },
  });

  await client.requestJson({
    endpoint: "/api/documents/d/0123456789abcdef01234567",
    method: "GET",
    reference,
    requestHash: "metadata",
    policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: false, requireFresh: true },
  });

  await assert.rejects(
    () =>
      client.requestJson({
        endpoint: "/api/documents/d/0123456789abcdef01234567/w/abcdefabcdefabcdefabcdef/e/111111111111111111111111/bom",
        method: "GET",
        reference,
        requestHash: "bom",
        policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: false, requireFresh: true },
      }),
    OnshapeCallBudgetExceededError,
  );
  assert.equal(transportCalls, 1);
});

test("rejects BOM fetches without an element id before making an Onshape request", async () => {
  const parsed = parseOnshapeUrl("https://cad.onshape.com/documents/0123456789abcdef01234567/w/abcdefabcdefabcdefabcdef");
  assert.equal(parsed.ok, true);
  assert.ok(parsed.documentId);
  const reference: OnshapeReference = {
    documentId: parsed.documentId,
    workspaceId: parsed.workspaceId,
    originalUrl: parsed.originalUrl,
    referenceType: parsed.referenceType,
  };
  let requestCount = 0;
  const client = createOnshapeCadClient({
    getCallsUsed: () => requestCount,
    requestJson: async <T = unknown>() => {
      requestCount += 1;
      return {} as T;
    },
  });

  await assert.rejects(
    () =>
      client.fetchAssemblyBom({
        reference,
        importRunId: "import-1",
        policy: { priority: "snapshot", maxCallsAllowed: 2, allowCached: false, requireFresh: true },
      }),
    /requires an elementId/,
  );
  assert.equal(requestCount, 0);
});

test("turns 429 responses into rate-limit errors and auditable logs", async () => {
  const store = createOnshapeRuntimeStore();
  const reference = parseOnshapeUrl(workspaceUrl);
  const client = createOnshapeApiClient({
    store,
    credentials: { mode: "api_key", accessKey: "key", secretKey: "secret" },
    transport: async () => ({
      statusCode: 429,
      headers: { "x-rate-limit-remaining": "0" },
      json: { message: "too many requests" },
    }),
  });

  await assert.rejects(
    () =>
      client.requestJson({
        endpoint: "/api/documents/d/0123456789abcdef01234567",
        method: "GET",
        reference,
        requestHash: "metadata",
        policy: { priority: "snapshot", maxCallsAllowed: 2, allowCached: false, requireFresh: true },
      }),
    OnshapeRateLimitError,
  );

  const log = store.listRequestLogs().at(-1);
  assert.equal(log?.statusCode, 429);
  assert.equal(log?.rateLimitRemaining, 0);
  assert.equal(log?.usedCache, false);
});

test("imports BOM graphs idempotently for immutable references and generates metadata warnings", async () => {
  const store = createOnshapeRuntimeStore();
  const ref = createLinkedRef(store);
  const client = createFakeClient({});

  const first = await runCadImport({ store, documentRefId: ref.id, syncLevel: "bom", requestedBy: "test-user", client });
  const second = await runCadImport({ store, documentRefId: ref.id, syncLevel: "bom", requestedBy: "test-user", client });

  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(store.listSnapshots().length, 1);
  assert.equal(store.listAssemblyNodes().length, 2);
  assert.equal(store.listPartDefinitions().length, 1);
  assert.equal(store.listPartInstances().length, 1);
  assert.ok(store.listWarnings().some((warning) => warning.code === "assembly_mapping_missing"));
  assert.ok(store.listWarnings().some((warning) => warning.code === "part_material_missing"));
});

test("marks imports partial when API budget is reached", async () => {
  const store = createOnshapeRuntimeStore();
  const ref = createLinkedRef(store, workspaceUrl);
  const result = await runCadImport({
    store,
    documentRefId: ref.id,
    syncLevel: "bom",
    requestedBy: "test-user",
    client: createFakeClient({ fail: new OnshapeCallBudgetExceededError("max_calls_allowed") }),
  });

  assert.equal(result.status, "partial");
  assert.equal(result.stoppedReason, "max_calls_allowed");
  assert.ok(store.listWarnings().some((warning) => warning.code === "api_budget_reached"));
  assert.ok(store.listWarnings().some((warning) => warning.code === "workspace_reference_not_immutable"));
});

test("estimates sync calls and cache behavior from local reference state", () => {
  const store = createOnshapeRuntimeStore();
  const ref = createLinkedRef(store, versionUrl);

  assert.deepEqual(estimateOnshapeSync({ store, documentRefId: ref.id, syncLevel: "link_only" }), {
    documentRefId: ref.id,
    syncLevel: "link_only",
    callsEstimated: 0,
    allowCached: true,
    requireFresh: false,
    immutableReference: true,
    referenceType: "version",
    cacheStatus: "not_required",
    perSyncSoftBudget: 25,
    budgetAllowsSync: true,
    warnings: [],
  });

  const metadataEstimate = estimateOnshapeSync({ store, documentRefId: ref.id, syncLevel: "shallow" });
  assert.ok(metadataEstimate);
  assert.equal(metadataEstimate.callsEstimated, 1);
  assert.equal(metadataEstimate.cacheStatus, "miss");

  store.writeCacheEntry({
    cacheKey: "metadata-cache",
    endpoint: "/api/documents/d/0123456789abcdef01234567",
    method: "GET",
    requestHash: "metadata",
    responseJson: { ok: true },
    responseHeadersJson: {},
    reference: parseOnshapeUrl(versionUrl),
    immutable: true,
    expiresAt: null,
  });

  const cachedEstimate = estimateOnshapeSync({ store, documentRefId: ref.id, syncLevel: "shallow" });
  assert.ok(cachedEstimate);
  assert.equal(cachedEstimate.cacheStatus, "hit");
  assert.equal(cachedEstimate.immutableReference, true);
});

test("limits deep release sync permission to CAD leads mentors and admins when auth is enabled", () => {
  const members = [
    { email: "student@mecorobotics.org", role: "student" },
    { email: "lead@mecorobotics.org", role: "lead" },
    { email: "mentor@mecorobotics.org", role: "mentor" },
    { email: "admin@mecorobotics.org", role: "admin" },
    { email: "external@example.com", role: "external" },
  ];

  assert.equal(canRunDeepReleaseSync({ authEnabled: false, userEmail: null, members }), true);
  assert.equal(canRunDeepReleaseSync({ authEnabled: true, userEmail: "student@mecorobotics.org", members }), false);
  assert.equal(canRunDeepReleaseSync({ authEnabled: true, userEmail: "lead@mecorobotics.org", members }), true);
  assert.equal(canRunDeepReleaseSync({ authEnabled: true, userEmail: "mentor@mecorobotics.org", members }), true);
  assert.equal(canRunDeepReleaseSync({ authEnabled: true, userEmail: "admin@mecorobotics.org", members }), true);
  assert.equal(canRunDeepReleaseSync({ authEnabled: true, userEmail: "external@example.com", members }), false);
  assert.equal(canRunDeepReleaseSync({ authEnabled: true, userEmail: null, members }), false);
});
