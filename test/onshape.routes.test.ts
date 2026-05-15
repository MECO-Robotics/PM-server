import assert from "node:assert/strict";
import { test } from "node:test";

import { getOnshapeRuntimeStore } from "../src/onshape/cadStore";
import { setOnshapeOAuthTokenTransportForTests } from "../src/onshape/onshapeOAuth";
import { setOnshapeCadClientFactoryForTests } from "../src/onshape/onshapeClientFactory";
import type { CadImportOnshapeClient } from "../src/onshape/onshapeTypes";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

const versionUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/v/222222222222222222222222/e/111111111111111111111111";
const workspaceUrl =
  "https://cad.onshape.com/documents/0123456789abcdef01234567/w/abcdefabcdefabcdefabcdef/e/111111111111111111111111";

function createRouteFakeClient(): CadImportOnshapeClient {
  let callsUsed = 0;
  return {
    getCallsUsed: () => callsUsed,
    async fetchDocumentMetadata() {
      callsUsed += 1;
      return {
        documentName: "2026 Robot CAD",
        elementName: "Master Assembly",
        raw: { metadata: true },
      };
    },
    async fetchAssemblyBom() {
      callsUsed += 1;
      return {
        assemblyNodes: [
          {
            sourceId: "asm-root",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            instanceId: "root",
            instancePath: "/root",
            name: "Robot master",
            inferredType: "master_assembly",
          },
        ],
        partDefinitions: [
          {
            sourceId: "part-plate-default",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            partId: "plate",
            name: "Belly pan",
            partNumber: "DRV-100",
            configuration: "default",
            customProperties: { manufacturingMethod: "cnc" },
          },
        ],
        partInstances: [
          {
            sourceId: "inst-plate-1",
            partDefinitionSourceId: "part-plate-default",
            parentAssemblySourceId: "asm-root",
            documentId: "0123456789abcdef01234567",
            elementId: "111111111111111111111111",
            instanceId: "plate-1",
            partId: "plate",
            instancePath: "/root/plate-1",
            quantity: 1,
            configuration: "default",
          },
        ],
        raw: { bom: true },
      };
    },
  };
}

test("Onshape link-only route stores parsed references without API calls", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/onshape/document-refs",
      payload: {
        url: workspaceUrl,
        label: "Draft robot workspace",
        projectId: "robot-2026",
      },
    });

    assert.equal(createResponse.statusCode, 201);
    const created = createResponse.json() as { item: { id: string; workspaceId: string; elementId: string } };
    assert.equal(created.item.workspaceId, "abcdefabcdefabcdefabcdef");
    assert.equal(created.item.elementId, "111111111111111111111111");
    assert.equal(getOnshapeRuntimeStore().listRequestLogs().length, 0);

    resetLimits();

    const linkOnlyResponse = await app.inject({
      method: "POST",
      url: "/api/onshape/import-runs",
      payload: {
        documentRefId: created.item.id,
        syncLevel: "link_only",
      },
    });

    assert.equal(linkOnlyResponse.statusCode, 201);
    assert.equal(linkOnlyResponse.json().result.callsUsed, 0);
    assert.equal(getOnshapeRuntimeStore().listRequestLogs().length, 0);
  });
});

test("Onshape routes run manual shallow and BOM syncs against the local cache store", async () => {
  setOnshapeCadClientFactoryForTests(() => createRouteFakeClient());

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/document-refs",
        payload: {
          url: versionUrl,
          label: "Robot version",
          projectId: "robot-2026",
        },
      });
      assert.equal(createResponse.statusCode, 201);
      const refId = createResponse.json().item.id as string;

      resetLimits();

      const shallowResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "shallow" },
      });
      assert.equal(shallowResponse.statusCode, 201);
      assert.equal(shallowResponse.json().result.status, "completed");
      assert.equal(shallowResponse.json().result.callsUsed, 1);

      resetLimits();

      const bomResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom" },
      });
      assert.equal(bomResponse.statusCode, 201);
      assert.equal(bomResponse.json().result.partDefinitionCount, 1);
      assert.equal(bomResponse.json().result.partInstanceCount, 1);

      resetLimits();

      const rerunResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/import-runs",
        payload: { documentRefId: refId, syncLevel: "bom" },
      });
      assert.equal(rerunResponse.statusCode, 201);

      resetLimits();

      const overviewResponse = await app.inject({ method: "GET", url: "/api/onshape/overview" });
      assert.equal(overviewResponse.statusCode, 200);
      const overview = overviewResponse.json() as {
        snapshots: unknown[];
        assemblyNodes: unknown[];
        partDefinitions: unknown[];
        partInstances: unknown[];
        warnings: Array<{ code: string }>;
      };
      assert.equal(overview.snapshots.length, 1);
      assert.equal(overview.assemblyNodes.length, 1);
      assert.equal(overview.partDefinitions.length, 1);
      assert.equal(overview.partInstances.length, 1);
      assert.ok(overview.warnings.some((item) => item.code === "part_material_missing"));

      resetLimits();

      const estimateResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/import-estimate?documentRefId=${refId}&syncLevel=bom`,
      });
      assert.equal(estimateResponse.statusCode, 200);
      const estimateBody = estimateResponse.json() as {
        item: {
          documentRefId: string;
          syncLevel: string;
          callsEstimated: number;
          immutableReference: boolean;
          budgetAllowsSync: boolean;
        };
      };
      assert.equal(estimateBody.item.documentRefId, refId);
      assert.equal(estimateBody.item.syncLevel, "bom");
      assert.equal(estimateBody.item.callsEstimated, 2);
      assert.equal(estimateBody.item.immutableReference, true);
      assert.equal(estimateBody.item.budgetAllowsSync, true);
    });
  } finally {
    setOnshapeCadClientFactoryForTests(null);
  }
});

test("Onshape OAuth routes issue authorization URLs and store callback tokens", async () => {
  setOnshapeOAuthTokenTransportForTests(async ({ body }) => {
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "oauth-code");
    assert.equal(body.get("client_id"), "test-onshape-client");
    assert.equal(body.get("client_secret"), "test-onshape-secret");
    return {
      statusCode: 200,
      json: {
        access_token: "oauth-access-token",
        refresh_token: "oauth-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "OAuth2Read",
      },
    };
  });

  try {
    await withIntegrationApp(async ({ app, resetLimits }) => {
      const authorizationResponse = await app.inject({
        method: "POST",
        url: "/api/onshape/oauth/authorization-url",
      });
      assert.equal(authorizationResponse.statusCode, 200);
      const authorizationBody = authorizationResponse.json() as {
        authorizationUrl: string;
        state: string;
      };
      const authorizationUrl = new URL(authorizationBody.authorizationUrl);
      const setCookieHeader = authorizationResponse.headers["set-cookie"];
      const sessionCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      assert.equal(typeof sessionCookie, "string");
      if (typeof sessionCookie !== "string") {
        throw new Error("Expected OAuth session cookie to be set.");
      }
      const sessionCookiePair = sessionCookie.split(";")[0];
      const sessionKey = decodeURIComponent(sessionCookiePair.split("=").slice(1).join("="));

      assert.equal(authorizationUrl.origin, "https://oauth.onshape.com");
      assert.equal(authorizationUrl.searchParams.get("client_id"), "test-onshape-client");
      assert.equal(authorizationUrl.searchParams.get("client_secret"), null);
      assert.equal(authorizationUrl.searchParams.get("state"), authorizationBody.state);
      assert.equal(authorizationBody.state.includes(sessionKey), false);

      resetLimits();

      const callbackResponse = await app.inject({
        method: "GET",
        url: `/api/onshape/oauth/callback?code=oauth-code&state=${authorizationBody.state}`,
        headers: {
          cookie: sessionCookiePair,
        },
      });
      assert.equal(callbackResponse.statusCode, 200);
      assert.match(callbackResponse.body, /Onshape OAuth connection complete/i);
      assert.equal(getOnshapeRuntimeStore().getOAuthTokenSet()?.accessToken, "oauth-access-token");

      resetLimits();

      const overviewResponse = await app.inject({ method: "GET", url: "/api/onshape/overview" });
      assert.equal(overviewResponse.statusCode, 200);
      assert.equal(overviewResponse.json().connection.authMode, "oauth");
      assert.equal(overviewResponse.json().connection.oauth.connected, true);
    });
  } finally {
    setOnshapeOAuthTokenTransportForTests(null);
  }
});
