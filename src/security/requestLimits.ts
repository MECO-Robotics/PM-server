import type { FastifyReply, FastifyRequest } from "fastify";

export interface RequestLimitPolicy {
  scope: string;
  maxRequests: number;
  windowMs: number;
}

interface RequestLimitRecord {
  count: number;
  resetAt: number;
}

const requestLimitRecords = new Map<string, RequestLimitRecord>();
const cleanupIntervalMs = 60_000;
let lastCleanupAt = 0;

function buildRecordKey(scope: string, ip: string) {
  return `${scope}:${ip}`;
}

function cleanupExpiredRecords(now: number) {
  if (now - lastCleanupAt < cleanupIntervalMs) {
    return;
  }

  for (const [key, record] of requestLimitRecords) {
    if (record.resetAt <= now) {
      requestLimitRecords.delete(key);
    }
  }

  lastCleanupAt = now;
}

function applyLimitHeaders(
  reply: FastifyReply,
  policy: RequestLimitPolicy,
  record: RequestLimitRecord,
) {
  reply.header("X-RateLimit-Limit", String(policy.maxRequests));
  reply.header("X-RateLimit-Remaining", String(Math.max(0, policy.maxRequests - record.count)));
  reply.header("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)));
}

export function enforceRequestLimit(
  request: Pick<FastifyRequest, "ip">,
  reply: FastifyReply,
  policy: RequestLimitPolicy,
) {
  const now = Date.now();
  cleanupExpiredRecords(now);

  const key = buildRecordKey(policy.scope, request.ip);
  const existingRecord = requestLimitRecords.get(key);
  const record =
    existingRecord && existingRecord.resetAt > now
      ? existingRecord
      : {
          count: 0,
          resetAt: now + policy.windowMs,
        };

  if (record.count >= policy.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

    reply
      .header("Retry-After", String(retryAfterSeconds))
      .header("X-RateLimit-Limit", String(policy.maxRequests))
      .header("X-RateLimit-Remaining", "0")
      .header("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)))
      .code(429)
      .send({
        message: "Too many requests. Please try again shortly.",
      });

    return false;
  }

  record.count += 1;
  requestLimitRecords.set(key, record);
  applyLimitHeaders(reply, policy, record);

  return true;
}

export function createRequestLimitGuard(policy: RequestLimitPolicy) {
  return (request: Pick<FastifyRequest, "ip">, reply: FastifyReply) => {
    return enforceRequestLimit(request, reply, policy);
  };
}

export function resetRequestLimits() {
  requestLimitRecords.clear();
  lastCleanupAt = 0;
}
