import assert from "node:assert/strict";
import { test } from "node:test";

function loadEnvModule(cacheBust: string) {
  return import(new URL(`../src/config/env.ts?${cacheBust}`, import.meta.url).href);
}

function saveEnv(keys: string[]) {
  return new Map(keys.map((key) => [key, process.env[key]] as const));
}

function restoreEnv(saved: Map<string, string | undefined>) {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("production config refuses wildcard CORS and missing auth", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "AUTH_JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "AUTH_EMAIL_SMTP_HOST",
    "AUTH_EMAIL_FROM",
  ]);

  try {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "*";
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.AUTH_EMAIL_SMTP_HOST;
    delete process.env.AUTH_EMAIL_FROM;

    await assert.rejects(
      loadEnvModule(`production-denied-${Date.now()}`),
      /Production deployments must configure AUTH_JWT_SECRET/,
    );
  } finally {
    restoreEnv(saved);
  }
});

test("production config loads when auth and explicit origins are configured", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "AUTH_JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_ALLOWED_HOSTED_DOMAIN",
    "AUTH_EMAIL_SMTP_HOST",
    "AUTH_EMAIL_FROM",
  ]);

  try {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "https://app.example.com, https://admin.example.com";
    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN = "mecorobotics.org";
    delete process.env.AUTH_EMAIL_SMTP_HOST;
    delete process.env.AUTH_EMAIL_FROM;

    const config = await loadEnvModule(`production-allowed-${Date.now()}`);

    assert.equal(config.authConfig.enabled, true);
    assert.deepEqual(config.corsConfig.origins, [
      "https://app.example.com",
      "https://admin.example.com",
    ]);
    assert.equal(config.corsConfig.allowsAnyOrigin, false);
  } finally {
    restoreEnv(saved);
  }
});
