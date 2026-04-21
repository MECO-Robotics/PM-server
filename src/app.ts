import Fastify from "fastify";
import cors from "@fastify/cors";

import { env } from "./config/env";
import { registerRoutes } from "./routes/registerRoutes";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
  });

  await registerRoutes(app);

  return app;
}
