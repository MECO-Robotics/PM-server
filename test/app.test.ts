import assert from "node:assert/strict";
import { test } from "node:test";

import { resetRequestLimits } from "../src/security/requestLimits";

test("buildApp serves health and public auth config without auth enabled", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousAuthJwtSecret = process.env.AUTH_JWT_SECRET;
  const previousGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const previousEmailHost = process.env.AUTH_EMAIL_SMTP_HOST;
  const previousEmailFrom = process.env.AUTH_EMAIL_FROM;
  const previousCorsOrigin = process.env.CORS_ORIGIN;
  const previousApiRateLimitMaxRequests = process.env.API_RATE_LIMIT_MAX_REQUESTS;
  const previousApiRateLimitWindowSeconds = process.env.API_RATE_LIMIT_WINDOW_SECONDS;
  const previousAuthRateLimitMaxRequests = process.env.AUTH_RATE_LIMIT_MAX_REQUESTS;
  const previousAuthRateLimitWindowSeconds = process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS;
  const previousAuthEmailRateLimitMaxRequests =
    process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS;
  const previousAuthEmailRateLimitWindowSeconds =
    process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS;

  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
  delete process.env.CORS_ORIGIN;
  delete process.env.AUTH_JWT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.AUTH_EMAIL_SMTP_HOST;
  delete process.env.AUTH_EMAIL_FROM;
  process.env.API_RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.API_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS = "60";

  const { buildApp } = await import("../src/app");
  const app = await buildApp();

  try {
    resetRequestLimits();

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(healthResponse.statusCode, 200);

    const healthBody = healthResponse.json() as {
      service: string;
      status: string;
      timestamp: string;
    };
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.service, "meco-platform");
    assert.equal(Number.isNaN(Date.parse(healthBody.timestamp)), false);

    const authConfigResponse = await app.inject({
      method: "GET",
      url: "/api/auth/config",
    });

    assert.equal(authConfigResponse.statusCode, 200);
    assert.deepEqual(authConfigResponse.json(), {
      enabled: false,
      googleClientId: null,
      hostedDomain: "mecorobotics.org",
      emailEnabled: false,
      devBypassAvailable: false,
    });
    assert.equal(authConfigResponse.headers["cache-control"], "no-store");
    assert.equal(authConfigResponse.headers["pragma"], "no-cache");
    assert.equal(authConfigResponse.headers["x-content-type-options"], "nosniff");
    assert.equal(authConfigResponse.headers["x-frame-options"], "DENY");
    assert.equal(authConfigResponse.headers["referrer-policy"], "no-referrer");

    const authConfigRateLimitedResponse = await app.inject({
      method: "GET",
      url: "/api/auth/config",
    });

    assert.equal(authConfigRateLimitedResponse.statusCode, 429);

    const dashboardResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    assert.equal(dashboardResponse.statusCode, 200);

    const dashboardRateLimitedResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    assert.equal(dashboardRateLimitedResponse.statusCode, 429);

    resetRequestLimits();

    const partDefinitionResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        name: "Route Test Part",
        partNumber: "TST-900",
        revision: "A",
        type: "custom",
        source: "Onshape",
        materialId: "mat-onyx-filament",
        description: "Created from the app test suite.",
      },
    });

    assert.equal(partDefinitionResponse.statusCode, 201);
    const partDefinitionBody = partDefinitionResponse.json() as {
      item: {
        description: string;
        id: string;
        materialId: string | null;
      };
    };
    assert.equal(partDefinitionBody.item.materialId, "mat-onyx-filament");
    assert.equal(partDefinitionBody.item.description, "Created from the app test suite.");

    resetRequestLimits();

    const partInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        subsystemId: "drive",
        mechanismId: "swerve-module",
        partDefinitionId: partDefinitionBody.item.id,
        name: "Route test part instance",
        quantity: 2,
        trackIndividually: true,
        status: "available",
      },
    });

    assert.equal(partInstanceResponse.statusCode, 201);
    const partInstanceBody = partInstanceResponse.json() as {
      item: {
        mechanismId: string | null;
        status: string;
        subsystemId: string;
      };
    };
    assert.equal(partInstanceBody.item.mechanismId, "swerve-module");
    assert.equal(partInstanceBody.item.subsystemId, "drive");
    assert.equal(partInstanceBody.item.status, "available");

    resetRequestLimits();

    const mismatchedPartInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        subsystemId: "manipulator",
        mechanismId: "swerve-module",
        partDefinitionId: partDefinitionBody.item.id,
        name: "Invalid relationship",
        quantity: 1,
        trackIndividually: false,
        status: "planned",
      },
    });

    assert.equal(mismatchedPartInstanceResponse.statusCode, 400);
    assert.match(
      mismatchedPartInstanceResponse.json().message as string,
      /does not belong to the selected subsystem/i,
    );

    resetRequestLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      manufacturingItems: Array<{
        batchLabel?: string;
        id: string;
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      }>;
      workLogs: Array<{
        id: string;
        participantIds: string[];
        taskId: string;
      }>;
    };

    const seededFabricationItem = bootstrapBody.manufacturingItems.find(
      (item) => item.id === "frame-weldment",
    );
    assert.ok(seededFabricationItem);
    assert.equal(seededFabricationItem?.process, "fabrication");
    assert.equal(seededFabricationItem?.partDefinitionId, null);
    assert.equal(seededFabricationItem?.batchLabel, "FAB-03");
    assert.ok(bootstrapBody.workLogs.some((workLog) => workLog.id === "log-1"));

    resetRequestLimits();

    const filteredBootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?personId=priya",
    });

    assert.equal(filteredBootstrapResponse.statusCode, 200);
    const filteredBootstrapBody = filteredBootstrapResponse.json() as {
      workLogs: Array<{
        id: string;
        participantIds: string[];
      }>;
    };
    assert.deepEqual(
      filteredBootstrapBody.workLogs.map((workLog) => workLog.id),
      ["log-3", "log-4"],
    );

    resetRequestLimits();

    const workLogCreateResponse = await app.inject({
      method: "POST",
      url: "/api/work-logs",
      payload: {
        taskId: "swerve-sensor-bundle",
        date: "2026-04-23",
        hours: 1.5,
        participantIds: ["priya", "lucas"],
        notes: "Route test work log",
      },
    });

    assert.equal(workLogCreateResponse.statusCode, 201);
    const workLogCreatedBody = workLogCreateResponse.json() as {
      item: {
        date: string;
        hours: number;
        id: string;
        notes: string;
        participantIds: string[];
        taskId: string;
      };
    };
    assert.equal(workLogCreatedBody.item.taskId, "swerve-sensor-bundle");
    assert.equal(workLogCreatedBody.item.hours, 1.5);
    assert.deepEqual(workLogCreatedBody.item.participantIds, ["priya", "lucas"]);
    assert.equal(workLogCreatedBody.item.notes, "Route test work log");

    resetRequestLimits();

    const filteredBootstrapAfterWorkLogResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?personId=priya",
    });

    assert.equal(filteredBootstrapAfterWorkLogResponse.statusCode, 200);
    const filteredBootstrapAfterWorkLogBody = filteredBootstrapAfterWorkLogResponse.json() as {
      workLogs: Array<{
        id: string;
        notes: string;
        participantIds: string[];
      }>;
    };
    const createdWorkLog = filteredBootstrapAfterWorkLogBody.workLogs.find(
      (workLog) => workLog.notes === "Route test work log",
    );
    assert.ok(createdWorkLog);
    assert.deepEqual(createdWorkLog?.participantIds, ["priya", "lucas"]);

    resetRequestLimits();

    const fabricationCreateResponse = await app.inject({
      method: "POST",
      url: "/api/manufacturing",
      payload: {
        title: "Custom Welded Intake Frame",
        subsystemId: "manipulator",
        requestedById: "lucas",
        process: "fabrication",
        dueDate: "2026-04-29",
        material: "1/8 aluminum tube",
        quantity: 1,
        status: "requested",
        mentorReviewed: false,
        batchLabel: "FAB-04",
      },
    });

    assert.equal(fabricationCreateResponse.statusCode, 201);
    const fabricationCreatedBody = fabricationCreateResponse.json() as {
      item: {
        batchLabel?: string;
        id: string;
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      };
    };
    assert.equal(fabricationCreatedBody.item.process, "fabrication");
    assert.equal(fabricationCreatedBody.item.partDefinitionId, null);
    assert.equal(fabricationCreatedBody.item.title, "Custom Welded Intake Frame");
    assert.equal(fabricationCreatedBody.item.batchLabel, "FAB-04");

    resetRequestLimits();

    const fabricationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/manufacturing/${fabricationCreatedBody.item.id}`,
      payload: {
        title: "Custom Welded Intake Frame Rev B",
        status: "in-progress",
      },
    });

    assert.equal(fabricationUpdateResponse.statusCode, 200);
    const fabricationUpdatedBody = fabricationUpdateResponse.json() as {
      item: {
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      };
    };
    assert.equal(fabricationUpdatedBody.item.process, "fabrication");
    assert.equal(fabricationUpdatedBody.item.partDefinitionId, null);
    assert.equal(fabricationUpdatedBody.item.title, "Custom Welded Intake Frame Rev B");
    assert.equal(fabricationUpdatedBody.item.status, "in-progress");

    resetRequestLimits();

    const bootstrapAfterUpdateResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapAfterUpdateResponse.statusCode, 200);
    const bootstrapAfterUpdateBody = bootstrapAfterUpdateResponse.json() as {
      manufacturingItems: Array<{
        id: string;
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      }>;
    };

    const createdFabricationItem = bootstrapAfterUpdateBody.manufacturingItems.find(
      (item) => item.title === "Custom Welded Intake Frame Rev B",
    );
    assert.ok(createdFabricationItem);
    assert.equal(createdFabricationItem?.process, "fabrication");
    assert.equal(createdFabricationItem?.partDefinitionId, null);
    assert.equal(createdFabricationItem?.status, "in-progress");
  } finally {
    await app.close();
    resetRequestLimits();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousAuthJwtSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = previousAuthJwtSecret;
    }

    if (previousGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = previousGoogleClientId;
    }

    if (previousEmailHost === undefined) {
      delete process.env.AUTH_EMAIL_SMTP_HOST;
    } else {
      process.env.AUTH_EMAIL_SMTP_HOST = previousEmailHost;
    }

    if (previousEmailFrom === undefined) {
      delete process.env.AUTH_EMAIL_FROM;
    } else {
      process.env.AUTH_EMAIL_FROM = previousEmailFrom;
    }

    if (previousCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = previousCorsOrigin;
    }

    if (previousApiRateLimitMaxRequests === undefined) {
      delete process.env.API_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.API_RATE_LIMIT_MAX_REQUESTS = previousApiRateLimitMaxRequests;
    }

    if (previousApiRateLimitWindowSeconds === undefined) {
      delete process.env.API_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.API_RATE_LIMIT_WINDOW_SECONDS = previousApiRateLimitWindowSeconds;
    }

    if (previousAuthRateLimitMaxRequests === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = previousAuthRateLimitMaxRequests;
    }

    if (previousAuthRateLimitWindowSeconds === undefined) {
      delete process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = previousAuthRateLimitWindowSeconds;
    }

    if (previousAuthEmailRateLimitMaxRequests === undefined) {
      delete process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS =
        previousAuthEmailRateLimitMaxRequests;
    }

    if (previousAuthEmailRateLimitWindowSeconds === undefined) {
      delete process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS =
        previousAuthEmailRateLimitWindowSeconds;
    }
  }
});
