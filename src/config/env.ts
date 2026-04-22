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
});

export const env = envSchema.parse(process.env);

export const authConfig = {
  enabled: Boolean(env.GOOGLE_CLIENT_ID && env.AUTH_JWT_SECRET),
  googleClientId: env.GOOGLE_CLIENT_ID ?? null,
  hostedDomain: env.GOOGLE_ALLOWED_HOSTED_DOMAIN.toLowerCase(),
  tokenTtl: env.AUTH_TOKEN_TTL,
} as const;
