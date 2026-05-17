import type { FastifyInstance } from "fastify";

import { getCadStore } from "../cadStoreFactory";
import { cadMappingRuleCreateSchema, cadMappingRulePatchSchema } from "../cadRouteSchemas";
import type { RequireApiSession } from "./cadRouteTypes";

export function registerCadMappingRuleRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.post("/api/cad/mapping-rules", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const parsed = cadMappingRuleCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "CAD mapping rule payload is invalid.", issues: parsed.error.flatten() });
    }
    return reply.code(201).send({
      item: await getCadStore().createMappingRule({
        ...parsed.data,
        seasonId: parsed.data.seasonId ?? null,
        targetId: parsed.data.targetId ?? null,
        createdBy: parsed.data.createdBy ?? null,
        notes: parsed.data.notes ?? null,
      }),
    });
  });

  app.patch<{ Params: { id: string } }>("/api/cad/mapping-rules/:id", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const parsed = cadMappingRulePatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "CAD mapping rule patch is invalid.", issues: parsed.error.flatten() });
    }
    const item = await getCadStore().updateMappingRule(request.params.id, parsed.data);
    return item ? { item } : reply.code(404).send({ message: "CAD mapping rule was not found." });
  });
}
