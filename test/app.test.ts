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
