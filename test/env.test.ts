import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

async function loadEnvModule(_cacheBust: string) {
  delete require.cache[require.resolve("../src/config/env.ts")];
  return require("../src/config/env.ts");
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

test("explicit SMTP settings override Resend fallback", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "RESEND_API_KEY",
    "AUTH_EMAIL_SMTP_HOST",
    "AUTH_EMAIL_SMTP_PORT",
    "AUTH_EMAIL_SMTP_USER",
    "AUTH_EMAIL_SMTP_PASS",
    "AUTH_EMAIL_FROM",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.RESEND_API_KEY = "resend-secret";
    process.env.AUTH_EMAIL_SMTP_HOST = "smtp-relay.brevo.com";
    process.env.AUTH_EMAIL_SMTP_PORT = "587";
    process.env.AUTH_EMAIL_SMTP_USER = "brevo-login@example.com";
    process.env.AUTH_EMAIL_SMTP_PASS = "brevo-secret";
    process.env.AUTH_EMAIL_FROM = "MECO Robotics <no-reply@mecorobotics.org>";

    const config = await loadEnvModule(`smtp-overrides-resend-${Date.now()}`);

    assert.equal(config.emailSmtpConfig.host, "smtp-relay.brevo.com");
    assert.equal(config.emailSmtpConfig.port, 587);
    assert.equal(config.emailSmtpConfig.user, "brevo-login@example.com");
    assert.equal(config.emailSmtpConfig.pass, "brevo-secret");
  } finally {
    restoreEnv(saved);
  }
});
