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
  "ONSHAPE_OAUTH_CLIENT_ID",
  "ONSHAPE_OAUTH_CLIENT_SECRET",
  "ONSHAPE_OAUTH_REDIRECT_URI",
  "ONSHAPE_OAUTH_AUTHORIZATION_URL",
  "ONSHAPE_OAUTH_TOKEN_URL",
  "ONSHAPE_OAUTH_SCOPES",
  "ONSHAPE_OAUTH_ACCESS_TOKEN",
  "ONSHAPE_OAUTH_REFRESH_TOKEN",
  "ONSHAPE_OAUTH_TOKEN_EXPIRES_AT",
  "ONSHAPE_CREDENTIAL_REFERENCE",
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

function configureEnv() {
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
  process.env.ONSHAPE_OAUTH_CLIENT_ID = "test-onshape-client";
  process.env.ONSHAPE_OAUTH_CLIENT_SECRET = "test-onshape-secret";
  process.env.ONSHAPE_OAUTH_REDIRECT_URI = "https://mission.test/api/onshape/oauth/callback";
  process.env.ONSHAPE_OAUTH_AUTHORIZATION_URL = "https://oauth.onshape.com/oauth/authorize";
  process.env.ONSHAPE_OAUTH_TOKEN_URL = "https://oauth.onshape.com/oauth/token";
  process.env.ONSHAPE_OAUTH_SCOPES = "OAuth2Read";
  delete process.env.ONSHAPE_OAUTH_ACCESS_TOKEN;
  delete process.env.ONSHAPE_OAUTH_REFRESH_TOKEN;
  delete process.env.ONSHAPE_OAUTH_TOKEN_EXPIRES_AT;
  delete process.env.ONSHAPE_CREDENTIAL_REFERENCE;
}

export async function withIntegrationApp(
  run: (context: {
    app: FastifyInstance;
    resetLimits: typeof resetRequestLimits;
  }) => Promise<void>,
) {
  const envSnapshot = saveEnv();

  try {
    configureEnv();
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
