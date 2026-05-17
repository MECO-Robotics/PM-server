import type { FastifyInstance } from "fastify";

import { registerCadMappingRuleRoutes } from "./routes/cadMappingRuleRoutes";
import { registerCadSnapshotRoutes } from "./routes/cadSnapshotRoutes";
import { registerCadStepImportRoutes } from "./routes/cadStepImportRoutes";
import type { RequireApiSession } from "./routes/cadRouteTypes";

export async function registerCadRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  registerCadStepImportRoutes(app, requireApiSession);
  registerCadSnapshotRoutes(app, requireApiSession);
  registerCadMappingRuleRoutes(app, requireApiSession);
}
