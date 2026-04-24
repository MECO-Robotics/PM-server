import assert from "node:assert/strict";
import { test } from "node:test";

import { enforceRequestLimit, resetRequestLimits } from "../src/security/requestLimits";

function createReply() {
  const state = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
  };

  const reply: any = {
    header(name: string, value: string) {
      state.headers[name] = value;
      return reply;
    },
    code(statusCode: number) {
      state.statusCode = statusCode;
      return reply;
    },
    send(body: unknown) {
      state.body = body;
      return reply;
    },
  };

  return { reply, state };
}

test("request limits block repeated requests and reset cleanly", () => {
  resetRequestLimits();

  const policy = {
    scope: "auth-email",
    maxRequests: 1,
    windowMs: 60_000,
  };

  const first = createReply();
  assert.equal(enforceRequestLimit({ ip: "127.0.0.1" }, first.reply, policy), true);
  assert.equal(first.state.headers["X-RateLimit-Limit"], "1");
  assert.equal(first.state.headers["X-RateLimit-Remaining"], "0");

  const second = createReply();
  assert.equal(enforceRequestLimit({ ip: "127.0.0.1" }, second.reply, policy), false);
  assert.equal(second.state.statusCode, 429);
  assert.deepEqual(second.state.body, {
    message: "Too many requests. Please try again shortly.",
  });

  resetRequestLimits();

  const third = createReply();
  assert.equal(enforceRequestLimit({ ip: "127.0.0.1" }, third.reply, policy), true);
});
