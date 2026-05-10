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

test("slack config maps channel ids and alert usergroup handles", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "SLACK_BOT_TOKEN",
    "SLACK_ALERT_USERGROUP_HANDLES",
    "SLACK_CHANNEL_BUILD_ID",
    "SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID",
    "SLACK_CHANNEL_PROGRAMMING_ID",
    "SLACK_CHANNEL_SCOUTING_STRATEGY_ID",
    "SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.SLACK_ALERT_USERGROUP_HANDLES = " allmentors, allstudents ";
    process.env.SLACK_CHANNEL_BUILD_ID = "C03171JMMB4";
    process.env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID = "C03MXBFGAM6";
    process.env.SLACK_CHANNEL_PROGRAMMING_ID = "C02BLURKRED";
    process.env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID = "C05SW57962E";
    process.env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID = "C088N9VC6H4";

    const config = await loadEnvModule(`slack-config-${Date.now()}`);

    assert.equal(config.slackConfig.enabled, true);
    assert.deepEqual(config.slackConfig.alertUsergroupHandles, [
      "allmentors",
      "allstudents",
    ]);
    assert.deepEqual(config.slackConfig.channels, {
      build: "C03171JMMB4",
      meetingPlansRecaps: "C03MXBFGAM6",
      programming: "C02BLURKRED",
      scoutingStrategy: "C05SW57962E",
      transportationAttendance: "C088N9VC6H4",
    });
  } finally {
    restoreEnv(saved);
  }
});

test("CAD persistence defaults to Prisma and allows runtime override", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "CAD_STORE_DRIVER",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    delete process.env.CAD_STORE_DRIVER;

    const defaultConfig = await loadEnvModule(`cad-store-default-${Date.now()}`);
    assert.equal(defaultConfig.cadPersistenceConfig.storeDriver, "prisma");

    delete require.cache[require.resolve("../src/config/env.ts")];
    process.env.CAD_STORE_DRIVER = "runtime";

    const runtimeConfig = await loadEnvModule(`cad-store-runtime-${Date.now()}`);
    assert.equal(runtimeConfig.cadPersistenceConfig.storeDriver, "runtime");
  } finally {
    restoreEnv(saved);
  }
});

test("STEP upload limit defaults above common CAD export sizes and allows override", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "CAD_STEP_UPLOAD_MAX_BYTES",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    delete process.env.CAD_STEP_UPLOAD_MAX_BYTES;

    const defaultConfig = await loadEnvModule(`cad-step-upload-default-${Date.now()}`);
    assert.equal(defaultConfig.cadStepUploadConfig.maxBytes, 250 * 1024 * 1024);

    delete require.cache[require.resolve("../src/config/env.ts")];
    process.env.CAD_STEP_UPLOAD_MAX_BYTES = String(64 * 1024 * 1024);

    const overrideConfig = await loadEnvModule(`cad-step-upload-override-${Date.now()}`);
    assert.equal(overrideConfig.cadStepUploadConfig.maxBytes, 64 * 1024 * 1024);
  } finally {
    restoreEnv(saved);
  }
});

test("STEP parser mode defaults to real parser auto mode and allows explicit placeholder mode", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "CAD_STEP_PARSER_MODE",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "http://localhost:5173";
    delete process.env.CAD_STEP_PARSER_MODE;

    const defaultConfig = await loadEnvModule(`cad-step-parser-default-${Date.now()}`);
    assert.equal(defaultConfig.cadStepParserConfig.mode, "auto");

    delete require.cache[require.resolve("../src/config/env.ts")];
    process.env.CAD_STEP_PARSER_MODE = "placeholder";

    const overrideConfig = await loadEnvModule(`cad-step-parser-placeholder-${Date.now()}`);
    assert.equal(overrideConfig.cadStepParserConfig.mode, "placeholder");
  } finally {
    restoreEnv(saved);
  }
});

test("production config refuses placeholder STEP parser mode", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CORS_ORIGIN",
    "AUTH_JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_ALLOWED_HOSTED_DOMAIN",
    "CAD_STEP_PARSER_MODE",
  ]);

  try {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.CORS_ORIGIN = "https://app.example.com";
    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
    process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN = "mecorobotics.org";
    process.env.CAD_STEP_PARSER_MODE = "placeholder";

    await assert.rejects(
      loadEnvModule(`cad-step-parser-production-placeholder-${Date.now()}`),
      /Production deployments cannot use CAD_STEP_PARSER_MODE=placeholder/,
    );
  } finally {
    restoreEnv(saved);
  }
});
