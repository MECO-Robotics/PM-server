import type { FastifyInstance } from "fastify";

import { resetStore } from "../../src/data/store";
import { resetRequestLimits } from "../../src/security/requestLimits";

const APP_ENV_KEYS = [
  "NODE_ENV",
  "DATABASE_URL",
  "AUTH_JWT_SECRET",
  "GOOGLE_CLIENT_ID",
  "AUTH_EMAIL_SMTP_HOST",
  "AUTH_EMAIL_FROM",
  "CORS_ORIGIN",
  "API_RATE_LIMIT_MAX_REQUESTS",
  "API_RATE_LIMIT_WINDOW_SECONDS",
  "AUTH_RATE_LIMIT_MAX_REQUESTS",
  "AUTH_RATE_LIMIT_WINDOW_SECONDS",
  "AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS",
  "AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_ENDPOINT",
  "S3_PUBLIC_BASE_URL",
  "S3_REGION",
  "S3_BUCKET",
  "S3_PRESIGN_TTL_SECONDS",
  "SLACK_BOT_TOKEN",
  "SLACK_ALERT_USERGROUP_HANDLES",
  "SLACK_CHANNEL_BUILD_ID",
  "SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID",
  "SLACK_CHANNEL_PROGRAMMING_ID",
  "SLACK_CHANNEL_SCOUTING_STRATEGY_ID",
  "SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID",
  "ONSHAPE_BASE_URL",
  "ONSHAPE_ACCESS_KEY",
  "ONSHAPE_SECRET_KEY",
  "ONSHAPE_OAUTH_TOKEN",
  "ONSHAPE_CREDENTIAL_REFERENCE",
  "CAD_STORE_DRIVER",
  "CAD_STEP_UPLOAD_MAX_BYTES",
  "CAD_STEP_PARSER_MODE",
] as const;

type AppEnvKey = (typeof APP_ENV_KEYS)[number];
type AppEnvSnapshot = Map<AppEnvKey, string | undefined>;

function saveEnv(): AppEnvSnapshot {
  return new Map(
    APP_ENV_KEYS.map((key) => [key, process.env[key]] as const),
  );
}

function restoreEnv(snapshot: AppEnvSnapshot) {
  for (const [key, value] of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function configureEnv(overrides?: Partial<Record<AppEnvKey, string | undefined>>) {
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
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_ENDPOINT = "https://s3.example.test";
  process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.test";
  process.env.S3_REGION = "us-test-1";
  process.env.S3_BUCKET = "meco-pm";
  process.env.S3_PRESIGN_TTL_SECONDS = "300";
  delete process.env.SLACK_BOT_TOKEN;
  process.env.SLACK_ALERT_USERGROUP_HANDLES = "allmentors,allstudents";
  process.env.SLACK_CHANNEL_BUILD_ID = "C03171JMMB4";
  process.env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID = "C03MXBFGAM6";
  process.env.SLACK_CHANNEL_PROGRAMMING_ID = "C02BLURKRED";
  process.env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID = "C05SW57962E";
  process.env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID = "C088N9VC6H4";
  process.env.ONSHAPE_BASE_URL = "https://cad.onshape.com";
  delete process.env.ONSHAPE_ACCESS_KEY;
  delete process.env.ONSHAPE_SECRET_KEY;
  delete process.env.ONSHAPE_OAUTH_TOKEN;
  delete process.env.ONSHAPE_CREDENTIAL_REFERENCE;
  process.env.CAD_STORE_DRIVER = "runtime";
  delete process.env.CAD_STEP_UPLOAD_MAX_BYTES;
  delete process.env.CAD_STEP_PARSER_MODE;

  for (const [key, value] of Object.entries(overrides ?? {}) as Array<[AppEnvKey, string | undefined]>) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export async function withIntegrationApp(
  run: (context: {
    app: FastifyInstance;
    resetLimits: typeof resetRequestLimits;
  }) => Promise<void>,
  options?: {
    env?: Partial<Record<AppEnvKey, string | undefined>>;
  },
) {
  const envSnapshot = saveEnv();

  try {
    configureEnv(options?.env);
    resetStore();

    const { buildApp } = await import("../../src/app");
    const app = await buildApp();

    try {
      resetRequestLimits();
      await run({ app, resetLimits: resetRequestLimits });
    } finally {
      await app.close();
      resetRequestLimits();
    }
  } finally {
    restoreEnv(envSnapshot);
  }
}
