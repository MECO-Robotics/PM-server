import Fastify from "fastify";
import cors from "@fastify/cors";

import { corsConfig, env } from "./config/env";
import { resetStore } from "./data/store";
import { resetOnshapeRuntimeStore } from "./onshape/cadStore";
import { registerRoutes } from "./routes/registerRoutes";

export async function buildApp() {
  // Always start from the checked-in seed snapshot so deploys regenerate tutorial state.
  resetStore();
  resetOnshapeRuntimeStore();

  const app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(cors, {
    origin: corsConfig.allowsAnyOrigin ? true : corsConfig.origins,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
    }

    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    return payload;
  });

  await registerRoutes(app);

  return app;
}
