import assert from "node:assert/strict";
import { test } from "node:test";

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

test("external roster role whitelists non-team email for email sign-in", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "AUTH_JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "AUTH_EMAIL_SMTP_HOST",
    "AUTH_EMAIL_FROM",
  ]);

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
    process.env.AUTH_JWT_SECRET = "replace-with-a-long-random-secret-123456";
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.AUTH_EMAIL_SMTP_HOST = "127.0.0.1";
    process.env.AUTH_EMAIL_FROM = "MECO Robotics <no-reply@mecorobotics.org>";

    const { createMember, resetStore } = await import("../src/data/store");
    const { AuthError, verifyEmailSignInCode } = await import("../src/auth/authService");

    resetStore();
    createMember({
      name: "Sponsor Viewer",
      email: "viewer@sponsor.example",
      role: "external",
      seasonId: "default-season",
    });

    assert.throws(
      () => verifyEmailSignInCode("VIEWER@sponsor.example", "123456"),
      (error) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.statusCode, 401);
        assert.match(error.message, /expired|no longer valid/i);
        return true;
      },
    );

    assert.throws(
      () => verifyEmailSignInCode("unlisted@sponsor.example", "123456"),
      (error) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.statusCode, 403);
        assert.match(error.message, /mecorobotics\.org/i);
        return true;
      },
    );
  } finally {
    restoreEnv(saved);
  }
});
