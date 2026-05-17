import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { registerOnshapeImportRoutes } from "./routes/onshapeImportRoutes";
import { registerOnshapeOAuthRoutes } from "./routes/onshapeOAuthRoutes";
import { registerOnshapeReferenceRoutes } from "./routes/onshapeReferenceRoutes";

type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;

export async function registerOnshapeRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  await registerOnshapeReferenceRoutes(app, requireApiSession);
  await registerOnshapeImportRoutes(app, requireApiSession);
  await registerOnshapeOAuthRoutes(app, requireApiSession);
}
