import type { FastifyReply, FastifyRequest } from "fastify";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

import { authConfig, env } from "../config/env";

const SESSION_ISSUER = "meco-platform";
const SESSION_AUDIENCE = "meco-apps";

const googleClient = authConfig.googleClientId
  ? new OAuth2Client(authConfig.googleClientId)
  : null;

export interface SessionUser {
  googleUserId: string;
  email: string;
  name: string;
  picture: string | null;
  hostedDomain: string;
}

interface SessionClaims extends JwtPayload {
  email: string;
  name: string;
  picture?: string | null;
  hd: string;
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

export function getPublicAuthConfig() {
  return {
    enabled: authConfig.enabled,
    googleClientId: authConfig.googleClientId,
    hostedDomain: authConfig.hostedDomain,
  };
}

export function isAuthEnabled() {
  return authConfig.enabled;
}

function getJwtSecret() {
  if (!env.AUTH_JWT_SECRET) {
    throw new AuthError("Google SSO is not configured on the server yet.", 503);
  }

  return env.AUTH_JWT_SECRET;
}

function assertAuthReady() {
  if (!authConfig.enabled || !googleClient || !authConfig.googleClientId) {
    throw new AuthError("Google SSO is not configured on the server yet.", 503);
  }

  return {
    client: googleClient,
    googleClientId: authConfig.googleClientId,
  };
}

function mapGooglePayload(payload: TokenPayload | undefined): SessionUser {
  if (!payload?.sub || !payload.email) {
    throw new AuthError("Google did not return the required identity fields.", 401);
  }

  if (payload.email_verified !== true) {
    throw new AuthError("Your Google account email must be verified.", 403);
  }

  const hostedDomain = payload.hd?.toLowerCase();
  if (hostedDomain !== authConfig.hostedDomain) {
    throw new AuthError(
      `Sign in with a ${authConfig.hostedDomain} Google account to continue.`,
      403,
    );
  }

  return {
    googleUserId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? payload.email,
    picture: payload.picture ?? null,
    hostedDomain,
  };
}

export async function verifyGoogleCredential(credential: string) {
  const { client, googleClientId } = assertAuthReady();
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: googleClientId,
  });

  return mapGooglePayload(ticket.getPayload());
}

export function signSessionToken(user: SessionUser) {
  const secret = getJwtSecret();

  return jwt.sign(
    {
      email: user.email,
      name: user.name,
      picture: user.picture,
      hd: user.hostedDomain,
    },
    secret,
    {
      subject: user.googleUserId,
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
  }) as SessionClaims;

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.hd !== "string"
  ) {
    throw new AuthError("The session token is missing required identity fields.", 401);
  }

  if (payload.hd.toLowerCase() !== authConfig.hostedDomain) {
    throw new AuthError(
      `Sign in with a ${authConfig.hostedDomain} Google account to continue.`,
      403,
    );
  }

  return {
    googleUserId: payload.sub,
    email: payload.email.toLowerCase(),
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
      message: `Sign in with a ${authConfig.hostedDomain} Google account to continue.`,
    });
    return null;
  }

  return session;
}
