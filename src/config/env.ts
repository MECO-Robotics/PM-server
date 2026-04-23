import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default("*"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_ALLOWED_HOSTED_DOMAIN: z.string().min(1).default("mecorobotics.org"),
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  AUTH_TOKEN_TTL: z.string().min(2).default("12h"),
  AUTH_EMAIL_SMTP_HOST: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_PORT: z.coerce.number().int().positive().default(587),
  AUTH_EMAIL_SMTP_USER: z.string().min(1).optional(),
  AUTH_EMAIL_SMTP_PASS: z.string().min(1).optional(),
  AUTH_EMAIL_FROM: z.string().min(1).optional(),
  AUTH_EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  AUTH_EMAIL_CODE_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_EMAIL_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().positive().default(5),
});

export const env = envSchema.parse(process.env);

function parseGoogleClientIds(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((clientId) => clientId.trim())
    .filter((clientId) => clientId.length > 0);
}

const googleClientIds = parseGoogleClientIds(env.GOOGLE_CLIENT_ID);
const hasEmailDeliveryConfig =
  Boolean(env.AUTH_EMAIL_SMTP_HOST) && Boolean(env.AUTH_EMAIL_FROM);

export const authConfig = {
  enabled: Boolean(
    env.AUTH_JWT_SECRET && (googleClientIds.length > 0 || hasEmailDeliveryConfig),
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
