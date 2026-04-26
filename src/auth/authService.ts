import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

import { authConfig, emailSmtpConfig, env } from "../config/env";
import { getMembers } from "../data/store";

const SESSION_ISSUER = "meco-platform";
const SESSION_AUDIENCE = "meco-apps";

const googleClient =
  authConfig.googleClientIds.length > 0 ? new OAuth2Client() : null;
const emailTransport =
  authConfig.emailEnabled && emailSmtpConfig.host && emailSmtpConfig.from
    ? nodemailer.createTransport({
        host: emailSmtpConfig.host,
        port: emailSmtpConfig.port,
        name: emailSmtpConfig.name,
        secure: emailSmtpConfig.port === 465,
        requireTLS: env.NODE_ENV === "production" && emailSmtpConfig.port !== 465,
        auth:
          emailSmtpConfig.user && emailSmtpConfig.pass
            ? {
                user: emailSmtpConfig.user,
                pass: emailSmtpConfig.pass,
              }
            : undefined,
        tls: {
          minVersion: "TLSv1.2",
        },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      })
    : null;

interface SessionClaims extends JwtPayload {
  email: string;
  name: string;
  picture?: string | null;
  hd: string;
  provider?: "google" | "email";
}

interface PendingEmailCodeRecord {
  codeHash: Buffer;
  expiresAt: number;
  resendAfterAt: number;
  failedAttempts: number;
}

export interface SessionUser {
  accountId: string;
  authProvider: "google" | "email";
  email: string;
  name: string;
  picture: string | null;
  hostedDomain: string;
}

export interface EmailCodeDelivery {
  sentTo: string;
  expiresInMinutes: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const pendingEmailCodes = new Map<string, PendingEmailCodeRecord>();
const pendingEmailCodeCleanupIntervalMs = 60_000;
let lastPendingEmailCodeCleanupAt = 0;

export function getPublicAuthConfig() {
  return {
    enabled: authConfig.enabled,
    googleClientId: authConfig.enabled ? authConfig.googleClientId : null,
    hostedDomain: authConfig.hostedDomain,
    emailEnabled: authConfig.enabled && authConfig.emailEnabled,
    devBypassAvailable: env.NODE_ENV !== "production" && authConfig.enabled,
  };
}

export function isAuthEnabled() {
  return authConfig.enabled;
}

function getJwtSecret() {
  if (!env.AUTH_JWT_SECRET) {
    throw new AuthError("MECO sign-in is not configured on the server yet.", 503);
  }

  return env.AUTH_JWT_SECRET;
}

function assertGoogleAuthReady() {
  if (!authConfig.enabled || !googleClient || authConfig.googleClientIds.length === 0) {
    throw new AuthError("Google sign-in is not configured on the server yet.", 503);
  }

  return {
    client: googleClient,
    googleClientId: authConfig.googleClientId,
    googleClientIds: authConfig.googleClientIds,
  };
}

function assertEmailAuthReady() {
  if (!authConfig.enabled || !authConfig.emailEnabled || !emailTransport) {
    throw new AuthError("Email sign-in is not configured on the server yet.", 503);
  }

  if (!emailSmtpConfig.from) {
    throw new AuthError("Email sign-in is not configured on the server yet.", 503);
  }

  return {
    from: emailSmtpConfig.from,
    transport: emailTransport,
  };
}

function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

function isAllowedHostedDomain(email: string) {
  const [, domain = ""] = email.split("@", 2);
  return domain === authConfig.hostedDomain;
}

function isExternalRosterEmailAllowed(email: string) {
  return getMembers().some((member) => {
    return (
      member.role === "external" &&
      member.email.length > 0 &&
      normalizeEmailAddress(member.email) === email
    );
  });
}

function isAllowedSignInEmail(email: string) {
  return isAllowedHostedDomain(email) || isExternalRosterEmailAllowed(email);
}

function buildSignInAccessMessage() {
  return `Use your ${authConfig.hostedDomain} email address or an external access email from the roster to continue.`;
}

function formatEmailLocalPart(localPart: string) {
  if (localPart.length <= 1) {
    return "*";
  }

  if (localPart.length === 2) {
    return `${localPart[0]}*`;
  }

  return `${localPart[0]}***${localPart.slice(-1)}`;
}

function maskEmailAddress(email: string) {
  const [localPart, domain = ""] = email.split("@", 2);
  return `${formatEmailLocalPart(localPart)}@${domain}`;
}

function hashVerificationCode(code: string) {
  return createHash("sha256").update(code).digest();
}

function codesMatch(candidateCode: string, storedHash: Buffer) {
  const candidateHash = hashVerificationCode(candidateCode);
  return candidateHash.length === storedHash.length && timingSafeEqual(candidateHash, storedHash);
}

function cleanupExpiredPendingEmailCodes(now = Date.now()) {
  if (now - lastPendingEmailCodeCleanupAt < pendingEmailCodeCleanupIntervalMs) {
    return;
  }

  for (const [email, record] of pendingEmailCodes) {
    if (record.expiresAt <= now) {
      pendingEmailCodes.delete(email);
    }
  }

  lastPendingEmailCodeCleanupAt = now;
}

function generateVerificationCode() {
  const upperBound = 10 ** authConfig.emailCodeLength;
  return randomInt(0, upperBound)
    .toString()
    .padStart(authConfig.emailCodeLength, "0");
}

function buildEmailVerificationMessage(code: string) {
  return [
    `Your MECO Robotics sign-in code is ${code}.`,
    "",
    "Heads up: email sign-in is temporarily using a manually verified MECO sender while we finish cleaning up domain authentication. If the sender looks a little sketchy, this code is still legitimate when you requested it from the MECO PM app.",
    "",
    `This code expires in ${authConfig.emailCodeTtlMinutes} minutes.`,
    "If you did not request this code, you can ignore this email.",
  ].join("\n");
}

function buildEmailVerificationHtml(code: string) {
  return `
    <div style="font-family: Arial, sans-serif; color: #11213d; line-height: 1.5">
      <h2 style="margin: 0 0 12px">Your MECO Robotics sign-in code</h2>
      <p style="margin: 0 0 16px">Use this code to finish signing in with your MECO email address.</p>
      <p style="margin: 0 0 16px; font-size: 28px; letter-spacing: 0.24em; font-weight: 700">${code}</p>
      <p style="margin: 0 0 16px">Heads up: email sign-in is temporarily using a manually verified MECO sender while we finish cleaning up domain authentication. If the sender looks a little sketchy, this code is still legitimate when you requested it from the MECO PM app.</p>
      <p style="margin: 0 0 8px">It expires in ${authConfig.emailCodeTtlMinutes} minutes.</p>
      <p style="margin: 0">If you did not request this code, you can safely ignore this message.</p>
    </div>
  `;
}

function getPendingEmailCode(email: string) {
  cleanupExpiredPendingEmailCodes();

  const record = pendingEmailCodes.get(email);
  if (!record) {
    return null;
  }

  if (Date.now() >= record.expiresAt) {
    pendingEmailCodes.delete(email);
    return null;
  }

  return record;
}

function pruneFailedAttempts(email: string, record: PendingEmailCodeRecord) {
  if (record.failedAttempts >= authConfig.emailMaxVerifyAttempts) {
    pendingEmailCodes.delete(email);
    throw new AuthError(
      "Too many incorrect attempts. Request a new code and try again.",
      429,
    );
  }
}

function buildEmailSessionUser(email: string): SessionUser {
  return {
    accountId: email,
    authProvider: "email",
    email,
    name: email,
    picture: null,
    hostedDomain: authConfig.hostedDomain,
  };
}

export function buildDevelopmentSessionUser(): SessionUser {
  return {
    accountId: "local-dev",
    authProvider: "email",
    email: `dev@${authConfig.hostedDomain}`,
    name: "Local Dev",
    picture: null,
    hostedDomain: authConfig.hostedDomain,
  };
}

function mapGooglePayload(payload: TokenPayload | undefined): SessionUser {
  if (!payload?.sub || !payload.email) {
    throw new AuthError("Google did not return the required identity fields.", 401);
  }

  if (payload.email_verified !== true) {
    throw new AuthError("Your Google account email must be verified.", 403);
  }

  const email = normalizeEmailAddress(payload.email);
  const hostedDomain = payload.hd?.toLowerCase();
  if (!isAllowedSignInEmail(email)) {
    throw new AuthError(buildSignInAccessMessage(), 403);
  }

  return {
    accountId: payload.sub,
    authProvider: "google",
    email,
    name: payload.name ?? payload.email,
    picture: payload.picture ?? null,
    hostedDomain: hostedDomain === authConfig.hostedDomain ? hostedDomain : authConfig.hostedDomain,
  };
}

export async function verifyGoogleCredential(credential: string) {
  const { client, googleClientIds } = assertGoogleAuthReady();

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientIds,
    });
  } catch (error) {
    throw toAuthError(error);
  }

  return mapGooglePayload(ticket.getPayload());
}

export async function requestEmailSignInCode(emailInput: string): Promise<EmailCodeDelivery> {
  const { from, transport } = assertEmailAuthReady();
  const email = normalizeEmailAddress(emailInput);
  cleanupExpiredPendingEmailCodes();

  if (!isAllowedSignInEmail(email)) {
    throw new AuthError(buildSignInAccessMessage(), 403);
  }

  const now = Date.now();
  const existing = getPendingEmailCode(email);
  if (existing && now < existing.resendAfterAt) {
    const secondsRemaining = Math.max(
      1,
      Math.ceil((existing.resendAfterAt - now) / 1000),
    );
    throw new AuthError(
      `A code was already sent to that address. Try again in ${secondsRemaining} seconds.`,
      429,
    );
  }

  const code = generateVerificationCode();
  const record: PendingEmailCodeRecord = {
    codeHash: hashVerificationCode(code),
    expiresAt: now + authConfig.emailCodeTtlMinutes * 60 * 1000,
    resendAfterAt: now + authConfig.emailCodeResendCooldownSeconds * 1000,
    failedAttempts: 0,
  };

  pendingEmailCodes.set(email, record);

  try {
    await transport.sendMail({
      from,
      to: email,
      subject: "Your MECO Robotics sign-in code",
      text: buildEmailVerificationMessage(code),
      html: buildEmailVerificationHtml(code),
    });
  } catch (error) {
    pendingEmailCodes.delete(email);
    requestEmailDeliveryFailure(error);
  }

  return {
    sentTo: maskEmailAddress(email),
    expiresInMinutes: authConfig.emailCodeTtlMinutes,
  };
}

export function verifyEmailSignInCode(emailInput: string, codeInput: string) {
  assertEmailAuthReady();
  cleanupExpiredPendingEmailCodes();

  const email = normalizeEmailAddress(emailInput);
  if (!isAllowedSignInEmail(email)) {
    throw new AuthError(buildSignInAccessMessage(), 403);
  }

  const code = codeInput.trim();
  if (code.length !== authConfig.emailCodeLength) {
    throw new AuthError("The sign-in code is the wrong length.", 400);
  }

  const record = getPendingEmailCode(email);
  if (!record) {
    throw new AuthError(
      "The sign-in code expired or is no longer valid. Request a new code and try again.",
      401,
    );
  }

  if (!codesMatch(code, record.codeHash)) {
    record.failedAttempts += 1;
    pruneFailedAttempts(email, record);
    pendingEmailCodes.set(email, record);
    throw new AuthError(
      "The sign-in code was incorrect. Please check your email and try again.",
      401,
    );
  }

  pendingEmailCodes.delete(email);
  return buildEmailSessionUser(email);
}

function toAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("wrong recipient") ||
    normalized.includes("audience") ||
    normalized.includes("jwt audience invalid")
  ) {
    return new AuthError(
      "Google returned a credential for a different client ID. Make sure the frontend Google client ID matches the server GOOGLE_CLIENT_ID.",
      401,
    );
  }

  if (
    normalized.includes("token used too late") ||
    normalized.includes("expired") ||
    normalized.includes("invalid token")
  ) {
    return new AuthError(
      "The Google credential is invalid or expired. Please try signing in again.",
      401,
    );
  }

  return new AuthError(
    "The Google credential could not be verified. Confirm that your localhost origin is allowed in Google Cloud Console and that GOOGLE_CLIENT_ID matches the frontend client ID.",
    401,
  );
}

function requestEmailDeliveryFailure(error?: unknown): never {
  const rawDetail = error instanceof Error ? error.message : "";
  const detail = rawDetail.toLowerCase();
  const diagnostic =
    rawDetail.length > 0
      ? ` (${rawDetail.split(/\r?\n/, 1)[0].slice(0, 180)})`
      : "";
  const detailSuffix =
    detail.includes("auth") || detail.includes("invalid login")
      ? "SMTP authentication failed."
      : detail.includes("eaddrnotavail")
        ? "SMTP host resolved to an unsupported address family."
        : detail.includes("etimedout") || detail.includes("timed out")
          ? "SMTP host timed out."
          : detail.includes("econnrefused")
            ? "SMTP host refused the connection."
            : detail.includes("greeting")
              ? "SMTP greeting was rejected."
              : "SMTP delivery failed.";

  throw new AuthError(
    `The verification email could not be sent. ${detailSuffix}${diagnostic} Please try again later.`,
    503,
  );
}

export function signSessionToken(user: SessionUser) {
  const secret = getJwtSecret();

  return jwt.sign(
    {
      email: user.email,
      name: user.name,
      picture: user.picture,
      hd: user.hostedDomain,
      provider: user.authProvider,
    },
    secret,
    {
      algorithm: "HS256",
      subject: user.accountId,
      expiresIn: authConfig.tokenTtl as SignOptions["expiresIn"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    },
  );
}

export function verifySessionToken(token: string): SessionUser {
  const secret = getJwtSecret();
  const payload = jwt.verify(token, secret, {
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
    algorithms: ["HS256"],
  }) as SessionClaims;

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.hd !== "string"
  ) {
    throw new AuthError("The session token is missing required identity fields.", 401);
  }

  if (payload.provider && payload.provider !== "google" && payload.provider !== "email") {
    throw new AuthError("The session token uses an unknown sign-in provider.", 401);
  }

  const email = normalizeEmailAddress(payload.email);
  if (!isAllowedSignInEmail(email)) {
    throw new AuthError(buildSignInAccessMessage(), 403);
  }

  return {
    accountId: payload.sub,
    authProvider: payload.provider ?? "google",
    email,
    name: payload.name,
    picture: typeof payload.picture === "string" ? payload.picture : null,
    hostedDomain: payload.hd.toLowerCase(),
  };
}

export function readBearerToken(headerValue: string | undefined) {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ", 2);
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function getSessionFromRequest(request: FastifyRequest) {
  const token = readBearerToken(request.headers.authorization);
  if (!token) {
    return null;
  }

  try {
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

export function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const session = getSessionFromRequest(request);
  if (!session) {
    reply.code(401).send({
      message: buildSignInAccessMessage(),
    });
    return null;
  }

  return session;
}
