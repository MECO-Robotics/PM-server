import assert from "node:assert/strict";
import { test } from "node:test";

import { runCadImport } from "../src/onshape/cadImporter";
import {
  createOnshapeCadClient,
  ONSHAPE_ASSEMBLY_BOM_REQUEST_HASH,
  ONSHAPE_DOCUMENT_METADATA_REQUEST_HASH,
} from "../src/onshape/onshapeCadClient";
import {
  createOnshapeRuntimeStore,
  type OnshapeRuntimeStore,
} from "../src/onshape/cadStore";
import {
  buildOnshapeCacheKey,
  createOnshapeApiClient,
  OnshapeCallBudgetExceededError,
  OnshapeConfigurationError,
  OnshapeRateLimitError,
} from "../src/onshape/onshapeApiClient";
import {
  buildOnshapeOAuthAuthorizationUrl,
  normalizeOnshapeOAuthTokenResponse,
  shouldRefreshOnshapeOAuthToken,
} from "../src/onshape/onshapeOAuth";
import { parseOnshapeUrl } from "../src/onshape/onshapeUrlParser";
import { canRunDeepReleaseSync, estimateOnshapeSync } from "../src/onshape/onshapeSyncPolicy";
import type {
  CadImportOnshapeClient,
  OnshapeAssemblyBomResponse,
  OnshapeDocumentMetadataResponse,
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
  failBom?: Error;
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
      if (options.failBom) {
        throw options.failBom;
      }
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

test("normalizes native Onshape assembly payloads into CAD graph records", async () => {
  const store = createOnshapeRuntimeStore();
  const reference = createLinkedRef(store);
  let requestedEndpoint = "";
  const lowLevelClient = createOnshapeApiClient({
    store,
    credentials: { mode: "oauth", bearerToken: "test-token" },
    transport: async (request) => {
      requestedEndpoint = request.endpoint;
      return {
        statusCode: 200,
        headers: {},
        json: {
          rootAssembly: {
            id: "root-assembly",
            name: "Robot master",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            instances: [
              {
                id: "drive-asm",
                type: "Assembly",
                name: "Drive Subsystem <1>",
                documentId: "0123456789abcdef01234567",
                elementId: "drive-element",
              },
              {
                id: "rail-left",
                parentId: "drive-asm",
                type: "Part",
                name: "Drive rail <1>",
                partId: "drive-rail",
                partNumber: "DRV-001",
                documentId: "0123456789abcdef01234567",
                elementId: "drive-element",
                documentMicroversion: "micro-rail",
                configuration: "default",
                material: "6061 aluminum",
                suppressed: false,
              },
            ],
          },
        },
      };
    },
  });

  const result = await createOnshapeCadClient(lowLevelClient).fetchAssemblyBom({
    reference,
    importRunId: "import-1",
    policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: false, requireFresh: true },
  });

  assert.equal(
    requestedEndpoint,
    "/api/assemblies/d/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111/bom",
  );
  assert.equal(store.listCacheEntries().at(-1)?.requestHash, ONSHAPE_ASSEMBLY_BOM_REQUEST_HASH);
  assert.deepEqual(
    result.assemblyNodes.map((node) => [node.name, node.inferredType, node.metadata?.normalization]),
    [
      ["Robot master", "master_assembly", "native_onshape"],
      ["Drive Subsystem <1>", "subassembly", "native_onshape"],
    ],
  );
  assert.equal(result.assemblyNodes[1]?.parentSourceId, result.assemblyNodes[0]?.sourceId);
  assert.equal(result.partDefinitions.length, 1);
  assert.equal(result.partDefinitions[0]?.partId, "drive-rail");
  assert.equal(result.partDefinitions[0]?.partNumber, "DRV-001");
  assert.equal(result.partDefinitions[0]?.microversionId, "micro-rail");
  assert.equal(result.partInstances.length, 1);
  assert.equal(result.partInstances[0]?.partDefinitionSourceId, result.partDefinitions[0]?.sourceId);
  assert.equal(result.partInstances[0]?.parentAssemblySourceId, result.assemblyNodes[1]?.sourceId);
  assert.equal(result.partInstances[0]?.suppressed, false);
});

test("builds Onshape OAuth2 authorization URLs without exposing client secrets", () => {
  const url = buildOnshapeOAuthAuthorizationUrl({
    authorizationUrl: "https://oauth.onshape.com/oauth/authorize",
    clientId: "client-id",
    redirectUri: "https://mission.test/api/onshape/oauth/callback",
    scopes: ["OAuth2Read", "OAuth2Write"],
    state: "state-123",
  });

  assert.equal(url.origin, "https://oauth.onshape.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), "https://mission.test/api/onshape/oauth/callback");
  assert.equal(url.searchParams.get("scope"), "OAuth2Read OAuth2Write");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.toString().includes("secret"), false);
});

test("normalizes Onshape OAuth2 token responses and refresh timing", () => {
  const tokenSet = normalizeOnshapeOAuthTokenResponse({
    json: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "OAuth2Read",
    },
    receivedAtMs: 1_000,
  });

  assert.equal(tokenSet.accessToken, "access-token");
  assert.equal(tokenSet.refreshToken, "refresh-token");
  assert.equal(tokenSet.tokenType, "Bearer");
  assert.equal(tokenSet.scope, "OAuth2Read");
  assert.equal(tokenSet.expiresAt, new Date(3_601_000).toISOString());
  assert.equal(shouldRefreshOnshapeOAuthToken(tokenSet, 3_540_000), false);
  assert.equal(shouldRefreshOnshapeOAuthToken(tokenSet, 3_550_000), true);
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
    credentials: { mode: "oauth", bearerToken: "test-token" },
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

test("fails fast for API key credentials until signed Authorization headers are supported", async () => {
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

  await assert.rejects(
    () =>
      client.requestJson({
        endpoint: "/api/documents/d/0123456789abcdef01234567",
        method: "GET",
        reference,
        requestHash: "metadata",
        policy: { priority: "snapshot", maxCallsAllowed: 1, allowCached: false, requireFresh: true },
      }),
    (error) =>
      error instanceof OnshapeConfigurationError &&
      error.message ===
        "Onshape API key authentication requires signed Authorization headers; configure OAuth credentials instead.",
  );
  assert.equal(transportCalls, 0);
  assert.equal(
    store.listRequestLogs().at(-1)?.errorMessage,
    "Onshape API key authentication requires signed Authorization headers; configure OAuth credentials instead.",
  );
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
    credentials: { mode: "oauth", bearerToken: "test-token" },
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
    credentials: { mode: "oauth", bearerToken: "test-token" },
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

test("turns 429 responses into rate-limit errors and auditable logs", async () => {
  const store = createOnshapeRuntimeStore();
  const reference = parseOnshapeUrl(workspaceUrl);
  const client = createOnshapeApiClient({
    store,
    credentials: { mode: "oauth", bearerToken: "test-token" },
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
  assert.equal(second.snapshotId, first.snapshotId);
  const snapshots = store.listSnapshots();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.importRunId, second.importRunId);
  assert.equal(store.listAssemblyNodes().length, 2);
  assert.equal(store.listPartDefinitions().length, 1);
  assert.equal(store.listPartInstances().length, 1);
  assert.ok(store.listWarnings().some((warning) => warning.code === "assembly_mapping_missing"));
  assert.ok(store.listWarnings().some((warning) => warning.code === "part_material_missing"));
});

test("does not replace the latest snapshot when BOM import fails", async () => {
  const store = createOnshapeRuntimeStore();
  const ref = createLinkedRef(store);
  const first = await runCadImport({ store, documentRefId: ref.id, syncLevel: "bom", requestedBy: "test-user", client: createFakeClient({}) });

  const failed = await runCadImport({
    store,
    documentRefId: ref.id,
    syncLevel: "bom",
    requestedBy: "test-user",
    client: createFakeClient({ failBom: new Error("bom unavailable") }),
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.snapshotId, undefined);
  assert.equal(failed.assemblyNodeCount, 0);
  assert.equal(failed.partDefinitionCount, 0);
  assert.equal(failed.partInstanceCount, 0);
  const snapshots = store.listSnapshots(ref.id);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.id, first.snapshotId);
  assert.equal(snapshots[0]?.importRunId, first.importRunId);
  assert.equal(store.findImportRun(failed.importRunId)?.status, "failed");
  assert.equal(store.findImportRun(failed.importRunId)?.errorMessage, "bom unavailable");
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
    requestHash: ONSHAPE_DOCUMENT_METADATA_REQUEST_HASH,
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
