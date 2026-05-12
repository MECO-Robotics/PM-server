import type { FastifyInstance } from "fastify";

import { buildCadSnapshotDiff } from "../cadDiffService";
import { applyHierarchyReviewDecisions } from "../cadHierarchyApplyService";
import { validateCadHierarchyForFinalize } from "../cadHierarchyValidationService";
import { applyMappingUpdates } from "../cadMappingEngine";
import { buildCadPartMatchProposals } from "../cadPartMatchingService";
import { cadFinalizeSchema, cadHierarchyApplySchema, cadMappingUpdateSchema } from "../cadRouteSchemas";
import { getCadStore } from "../cadStoreFactory";
import type { RequireApiSession } from "./cadRouteTypes";

export function registerCadSnapshotActionRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/part-match-proposals", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    if (!(await store.findSnapshot(request.params.snapshotId))) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return buildCadPartMatchProposals({ store, snapshotId: request.params.snapshotId });
  });

  app.post<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/hierarchy-review/apply", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const parsed = cadHierarchyApplySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "CAD hierarchy review payload is invalid.", issues: parsed.error.flatten() });
    }
    const result = await applyHierarchyReviewDecisions({ store: getCadStore(), snapshotId: request.params.snapshotId, input: parsed.data });
    return result ?? reply.code(404).send({ message: "CAD snapshot was not found." });
  });

  app.post<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/mappings/apply", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const parsed = cadMappingUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "CAD mapping update payload is invalid.", issues: parsed.error.flatten() });
    }
    const store = getCadStore();
    const snapshot = await store.findSnapshot(request.params.snapshotId);
    if (!snapshot) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return applyMappingUpdates({ store, snapshot, updates: parsed.data.updates, reviewedBy: parsed.data.reviewedBy ?? null });
  });

  app.post<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/finalize", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const parsed = cadFinalizeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "CAD finalize payload is invalid.", issues: parsed.error.flatten() });
    }
    const store = getCadStore();
    const snapshot = await store.findSnapshot(request.params.snapshotId);
    if (!snapshot) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    const hierarchyIssues = await validateCadHierarchyForFinalize({ store, snapshotId: snapshot.id });
    if (hierarchyIssues.length > 0 && !parsed.data.allowUnresolved) {
      return reply.code(409).send({
        message: "CAD snapshot still has hierarchy review issues.",
        unresolvedCount: hierarchyIssues.length,
        issues: hierarchyIssues,
      });
    }
    const item = await store.updateSnapshot(snapshot.id, {
      status: "finalized",
      finalizedAt: new Date().toISOString(),
      finalizedBy: parsed.data.finalizedBy ?? null,
    });
    return { item, warnings: hierarchyIssues };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/diff", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const diff = await buildCadSnapshotDiff({ store: getCadStore(), snapshotId: request.params.snapshotId });
    return diff ?? reply.code(404).send({ message: "CAD snapshot was not found." });
  });
}
