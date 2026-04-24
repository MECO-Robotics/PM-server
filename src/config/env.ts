import { z } from "zod";

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
});

export const env = envSchema.parse(process.env);

function pickFirstString(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function pickFirstNumber(...candidates: Array<number | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function parseGoogleClientIds(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((clientId) => clientId.trim())
    .filter((clientId) => clientId.length > 0);
}

function parseCorsOrigins(value: string) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN must include at least one origin or '*'.");
  }

  if (origins.includes("*") && origins.length > 1) {
    throw new Error("CORS_ORIGIN can only use '*' by itself.");
  }

  return origins;
}

const googleClientIds = parseGoogleClientIds(env.GOOGLE_CLIENT_ID);
const resolvedResendApiKey = pickFirstString(env.RESEND_API_KEY);
const resolvedEmailSmtpHost = resolvedResendApiKey
  ? "smtp.resend.com"
  : pickFirstString(
      env.AUTH_EMAIL_SMTP_HOST,
      env.SMTP_HOST,
      env.EMAIL_SMTP_HOST,
      env.MAIL_HOST,
    );
const resolvedEmailSmtpPort =
  pickFirstNumber(
    env.AUTH_EMAIL_SMTP_PORT,
    env.SMTP_PORT,
    env.EMAIL_SMTP_PORT,
    env.MAIL_PORT,
  ) ?? 587;
const resolvedEmailSmtpUser = pickFirstString(
  resolvedResendApiKey ? "resend" : undefined,
  env.AUTH_EMAIL_SMTP_USER,
  env.SMTP_USER,
  env.EMAIL_SMTP_USER,
  env.MAIL_USER,
);
const resolvedEmailSmtpName = pickFirstString(
  env.AUTH_EMAIL_SMTP_NAME,
  env.SMTP_NAME,
  env.EMAIL_SMTP_NAME,
  env.MAIL_NAME,
);
const resolvedEmailSmtpPass = pickFirstString(
  resolvedResendApiKey,
  env.AUTH_EMAIL_SMTP_PASS,
  env.SMTP_PASS,
  env.EMAIL_SMTP_PASS,
  env.MAIL_PASS,
);
const resolvedEmailFrom = pickFirstString(
  env.AUTH_EMAIL_FROM,
  env.AUTH_EMAIL_SMTP_FROM,
  env.SMTP_FROM,
  env.EMAIL_FROM,
  env.MAIL_FROM,
);
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
