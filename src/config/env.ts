import { z } from "zod";

import {
  normalizeUrl,
  parseCorsOrigins,
  parseCsv,
  parseGoogleClientIds,
  pickFirstNumber,
  pickFirstString,
} from "./envHelpers";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().min(1).default("*"),
  API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_ALLOWED_HOSTED_DOMAIN: z.string().min(1).default("mecorobotics.org"),
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  AUTH_TOKEN_TTL: z.string().min(2).default("12h"),
  AUTH_EMAIL_SMTP_HOST: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_PORT: z.coerce.number().int().positive().optional(),
  AUTH_EMAIL_SMTP_NAME: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_USER: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_PASS: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_FROM: z.string().min(1).optional(),
  AUTH_EMAIL_FROM: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_NAME: z.string().min(1).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
  EMAIL_SMTP_HOST: z.string().min(1).optional(),
  EMAIL_SMTP_PORT: z.coerce.number().int().positive().optional(),
  EMAIL_SMTP_NAME: z.string().min(1).optional(),
  EMAIL_SMTP_USER: z.string().min(1).optional(),
  EMAIL_SMTP_PASS: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  MAIL_HOST: z.string().min(1).optional(),
  MAIL_PORT: z.coerce.number().int().positive().optional(),
  MAIL_NAME: z.string().min(1).optional(),
  MAIL_USER: z.string().min(1).optional(),
  MAIL_PASS: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).optional(),
  AUTH_EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  AUTH_EMAIL_CODE_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_EMAIL_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().positive().default(5),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_PUBLIC_BASE_URL: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
  SLACK_BOT_TOKEN: z.string().min(1).optional(),
  SLACK_ALERT_USERGROUP_HANDLES: z.string().min(1).default("allmentors,allstudents"),
  SLACK_CHANNEL_BUILD_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_PROGRAMMING_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_SCOUTING_STRATEGY_ID: z.string().min(1).optional(),
  SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID: z.string().min(1).optional(),
  ONSHAPE_BASE_URL: z.string().min(1).default("https://cad.onshape.com"),
  ONSHAPE_ACCESS_KEY: z.string().min(1).optional(),
  ONSHAPE_SECRET_KEY: z.string().min(1).optional(),
  ONSHAPE_OAUTH_TOKEN: z.string().min(1).optional(),
  ONSHAPE_CREDENTIAL_REFERENCE: z.string().min(1).optional(),
  CAD_STORE_DRIVER: z.enum(["prisma", "runtime"]).default("prisma"),
  CAD_STEP_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(250 * 1024 * 1024),
});

export const env = envSchema.parse(process.env);

const googleClientIds = parseGoogleClientIds(env.GOOGLE_CLIENT_ID);
const resolvedResendApiKey = pickFirstString(env.RESEND_API_KEY);
const resolvedExplicitEmailSmtpHost = pickFirstString(
  env.AUTH_EMAIL_SMTP_HOST,
  env.SMTP_HOST,
  env.EMAIL_SMTP_HOST,
  env.MAIL_HOST,
);
const usesExplicitEmailSmtp = Boolean(resolvedExplicitEmailSmtpHost);
const resolvedEmailSmtpHost = resolvedResendApiKey
  ? (resolvedExplicitEmailSmtpHost ?? "smtp.resend.com")
  : resolvedExplicitEmailSmtpHost;
const resolvedEmailSmtpPort =
  pickFirstNumber(
    env.AUTH_EMAIL_SMTP_PORT,
    env.SMTP_PORT,
    env.EMAIL_SMTP_PORT,
    env.MAIL_PORT,
  ) ?? 587;
const resolvedEmailSmtpUser = pickFirstString(
  usesExplicitEmailSmtp ? env.AUTH_EMAIL_SMTP_USER : undefined,
  usesExplicitEmailSmtp ? env.SMTP_USER : undefined,
  usesExplicitEmailSmtp ? env.EMAIL_SMTP_USER : undefined,
  usesExplicitEmailSmtp ? env.MAIL_USER : undefined,
  resolvedResendApiKey && !usesExplicitEmailSmtp ? "resend" : undefined,
);
const resolvedEmailSmtpName = pickFirstString(
  env.AUTH_EMAIL_SMTP_NAME,
  env.SMTP_NAME,
  env.EMAIL_SMTP_NAME,
  env.MAIL_NAME,
);
const resolvedEmailSmtpPass = pickFirstString(
  usesExplicitEmailSmtp ? env.AUTH_EMAIL_SMTP_PASS : undefined,
  usesExplicitEmailSmtp ? env.SMTP_PASS : undefined,
  usesExplicitEmailSmtp ? env.EMAIL_SMTP_PASS : undefined,
  usesExplicitEmailSmtp ? env.MAIL_PASS : undefined,
  resolvedResendApiKey && !usesExplicitEmailSmtp
    ? resolvedResendApiKey
    : undefined,
);
const resolvedEmailFrom = pickFirstString(
  env.AUTH_EMAIL_FROM,
  env.AUTH_EMAIL_SMTP_FROM,
  env.SMTP_FROM,
  env.EMAIL_FROM,
  env.MAIL_FROM,
);
const s3Endpoint = normalizeUrl(env.S3_ENDPOINT);
const s3PublicBaseUrl = normalizeUrl(env.S3_PUBLIC_BASE_URL) ?? s3Endpoint;
export const emailSmtpConfig = {
  host: resolvedEmailSmtpHost,
  port: resolvedEmailSmtpPort,
  name: resolvedEmailSmtpName,
  user: resolvedEmailSmtpUser,
  pass: resolvedEmailSmtpPass,
  from: resolvedEmailFrom,
} as const;
const hasEmailDeliveryConfig =
  Boolean(emailSmtpConfig.host) && Boolean(emailSmtpConfig.from);
const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);

export const authConfig = {
  enabled: Boolean(
    env.AUTH_JWT_SECRET &&
      (googleClientIds.length > 0 || hasEmailDeliveryConfig),
  ),
  googleClientId: googleClientIds[0] ?? null,
  googleClientIds,
  hostedDomain: env.GOOGLE_ALLOWED_HOSTED_DOMAIN.toLowerCase(),
  tokenTtl: env.AUTH_TOKEN_TTL,
  emailEnabled: hasEmailDeliveryConfig,
  emailCodeTtlMinutes: env.AUTH_EMAIL_CODE_TTL_MINUTES,
  emailCodeLength: env.AUTH_EMAIL_CODE_LENGTH,
  emailCodeResendCooldownSeconds: env.AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
  emailMaxVerifyAttempts: env.AUTH_EMAIL_MAX_VERIFY_ATTEMPTS,
} as const;

export const corsConfig = {
  origins: corsOrigins,
  allowsAnyOrigin: corsOrigins.length === 1 && corsOrigins[0] === "*",
} as const;

function assertProductionSecurityConfig() {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (!authConfig.enabled) {
    throw new Error(
      "Production deployments must configure AUTH_JWT_SECRET and either Google or SMTP sign-in before the server starts.",
    );
  }

  if (corsConfig.allowsAnyOrigin) {
    throw new Error(
      "Production deployments must set CORS_ORIGIN to one or more explicit origins.",
    );
  }
}

assertProductionSecurityConfig();

export const requestLimitConfig = {
  api: {
    maxRequests: env.API_RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.API_RATE_LIMIT_WINDOW_SECONDS * 1000,
  },
  auth: {
    maxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
  },
  authEmail: {
    maxRequests: env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS * 1000,
  },
} as const;

export const mediaUploadConfig = {
  enabled: Boolean(
    env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY &&
      env.S3_ENDPOINT &&
      env.S3_REGION &&
      env.S3_BUCKET,
  ),
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  endpoint: s3Endpoint,
  publicBaseUrl: s3PublicBaseUrl,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  presignTtlSeconds: env.S3_PRESIGN_TTL_SECONDS,
} as const;

export const slackConfig = {
  enabled: Boolean(env.SLACK_BOT_TOKEN),
  botToken: env.SLACK_BOT_TOKEN,
  alertUsergroupHandles: parseCsv(env.SLACK_ALERT_USERGROUP_HANDLES),
  channels: {
    build: env.SLACK_CHANNEL_BUILD_ID,
    meetingPlansRecaps: env.SLACK_CHANNEL_MEETING_PLANS_RECAPS_ID,
    programming: env.SLACK_CHANNEL_PROGRAMMING_ID,
    scoutingStrategy: env.SLACK_CHANNEL_SCOUTING_STRATEGY_ID,
    transportationAttendance: env.SLACK_CHANNEL_TRANSPORTATION_ATTENDANCE_ID,
  },
} as const;

export const onshapeConfig = {
  enabled: Boolean(
    env.ONSHAPE_OAUTH_TOKEN ||
      (env.ONSHAPE_ACCESS_KEY && env.ONSHAPE_SECRET_KEY),
  ),
  baseUrl: normalizeUrl(env.ONSHAPE_BASE_URL) ?? "https://cad.onshape.com",
  accessKey: env.ONSHAPE_ACCESS_KEY,
  secretKey: env.ONSHAPE_SECRET_KEY,
  bearerToken: env.ONSHAPE_OAUTH_TOKEN,
  credentialReference: env.ONSHAPE_CREDENTIAL_REFERENCE ?? null,
} as const;

export const cadPersistenceConfig = {
  storeDriver: env.CAD_STORE_DRIVER,
} as const;

export const cadStepUploadConfig = {
  maxBytes: env.CAD_STEP_UPLOAD_MAX_BYTES,
} as const;
