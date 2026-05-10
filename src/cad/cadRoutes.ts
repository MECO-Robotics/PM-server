import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { cadStepUploadConfig } from "../config/env";
import { getCadStore } from "./cadStoreFactory";
import { buildCadSnapshotDiff } from "./cadDiffService";
import { CadImportError, runStepImport } from "./cadImportService";
import { applyMappingUpdates } from "./cadMappingEngine";
import type { CadStore } from "./cadStoreTypes";
import {
  cadFinalizeSchema,
  cadListQuerySchema,
  cadMappingRuleCreateSchema,
  cadMappingRulePatchSchema,
  cadMappingUpdateSchema,
  cadStepImportJsonSchema,
} from "./cadRouteSchemas";
import { createMockStepParserClient } from "./stepParserClient";

type RequireApiSession = (request: FastifyRequest, reply: FastifyReply) => boolean;

const maxStepUploadBytes = cadStepUploadConfig.maxBytes;

function formatUploadLimit(bytes: number) {
  const mib = bytes / (1024 * 1024);
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`;
}

function isMultipartFileTooLargeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

function readListQuery(query: unknown) {
  const parsed = cadListQuerySchema.safeParse(query ?? {});
  return parsed.success ? parsed.data : {};
}

async function readStepImportPayload(request: FastifyRequest) {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const parsed = cadStepImportJsonSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new CadImportError("STEP import payload is invalid.");
    }
    return parsed.data;
  }

  const multipartRequest = request as FastifyRequest & {
    file: (options?: unknown) => Promise<{
      filename: string;
      fields: Record<string, { value?: unknown }>;
      toBuffer: () => Promise<Buffer>;
    } | undefined>;
  };
  try {
    const part = await multipartRequest.file({ limits: { fileSize: maxStepUploadBytes } });
    if (!part) {
      throw new CadImportError("STEP import requires a file.");
    }
    const buffer = await part.toBuffer();
    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const fieldValue = (name: string) => {
      const value = fields[name]?.value;
      return typeof value === "string" ? value : undefined;
    };
    return {
      fileName: part.filename,
      fileText: buffer.toString("utf8"),
      label: fieldValue("label"),
      projectId: fieldValue("projectId"),
      seasonId: fieldValue("seasonId"),
      requestedBy: fieldValue("requestedBy"),
    };
  } catch (error) {
    if (isMultipartFileTooLargeError(error)) {
      throw new CadImportError(
        `STEP file is larger than the ${formatUploadLimit(maxStepUploadBytes)} upload limit. Export a smaller assembly or ask an admin to raise CAD_STEP_UPLOAD_MAX_BYTES.`,
        413,
      );
    }
    throw error;
  }
}

function findSourceName(args: {
  sourceKind: string;
  sourceId: string;
  assemblies: Awaited<ReturnType<CadStore["listAssemblyNodes"]>>;
  parts: Awaited<ReturnType<CadStore["listPartDefinitions"]>>;
  instances: Awaited<ReturnType<CadStore["listPartInstances"]>>;
}) {
  if (args.sourceKind === "ASSEMBLY_NODE") {
    return args.assemblies.find((item) => item.id === args.sourceId)?.name ?? args.sourceId;
  }
  if (args.sourceKind === "PART_DEFINITION") {
    return args.parts.find((item) => item.id === args.sourceId)?.name ?? args.sourceId;
  }
  const instance = args.instances.find((item) => item.id === args.sourceId);
  return instance?.instancePath.split("/").filter(Boolean).at(-1) ?? args.sourceId;
}

async function snapshotMappings(store: CadStore, snapshotId: string) {
  const assemblies = await store.listAssemblyNodes(snapshotId);
  const parts = await store.listPartDefinitions(snapshotId);
  const instances = await store.listPartInstances(snapshotId);
  const mappings = await store.listSnapshotMappings(snapshotId);
  return Promise.all(mappings.map(async (mapping) => ({
    ...mapping,
    sourceName: findSourceName({
      sourceKind: mapping.sourceKind,
      sourceId: mapping.sourceId,
      assemblies,
      parts,
      instances,
    }),
    source: [...assemblies, ...parts, ...instances].find((item) => item.id === mapping.sourceId) ?? null,
    rule: mapping.mappingRuleId ? await store.findMappingRule(mapping.mappingRuleId) : null,
  })));
}

async function buildTree(store: CadStore, snapshotId: string) {
  const assemblies = await store.listAssemblyNodes(snapshotId);
  const instances = await store.listPartInstances(snapshotId);
  const definitions = await store.listPartDefinitions(snapshotId);
  const mappingsBySourceId = new Map((await store.listSnapshotMappings(snapshotId)).map((mapping) => [mapping.sourceId, mapping]));
  const byParent = new Map<string | null, typeof assemblies>();
  for (const assembly of assemblies) {
    const key = assembly.parentAssemblyNodeId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), assembly]);
  }
  const instancesByParent = new Map<string | null, typeof instances>();
  for (const instance of instances) {
    const key = instance.parentAssemblyNodeId ?? null;
    instancesByParent.set(key, [...(instancesByParent.get(key) ?? []), instance]);
  }

  const visit = (assembly: (typeof assemblies)[number]): unknown => ({
    ...assembly,
    mapping: mappingsBySourceId.get(assembly.id) ?? null,
    children: (byParent.get(assembly.id) ?? []).map(visit),
    partInstances: (instancesByParent.get(assembly.id) ?? []).map((instance) => ({
      ...instance,
      mapping: mappingsBySourceId.get(instance.id) ?? null,
      partDefinition: definitions.find((part) => part.id === instance.partDefinitionId) ?? null,
    })),
  });

  return {
    snapshotId,
    rootNodes: (byParent.get(null) ?? []).map(visit),
  };
}

async function unresolvedMappings(store: CadStore, snapshotId: string) {
  return (await store.listSnapshotMappings(snapshotId)).filter(
    (mapping) =>
      mapping.status === "NEEDS_REVIEW" ||
      (mapping.targetKind === "UNMAPPED" && mapping.status !== "REJECTED"),
  );
}

export async function registerCadRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  app.post("/api/cad/step-imports", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    try {
      const payload = await readStepImportPayload(request);
      const result = await runStepImport({
        store: getCadStore(),
        parserClient: createMockStepParserClient(),
        input: {
          fileText: payload.fileText,
          originalFilename: payload.fileName,
          label: payload.label,
          projectId: payload.projectId,
          seasonId: payload.seasonId,
          requestedBy: payload.requestedBy,
        },
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof CadImportError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });

  app.get("/api/cad/import-runs", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    return { items: await getCadStore().listImportRuns(readListQuery(request.query)) };
  });

  app.get<{ Params: { importRunId: string } }>("/api/cad/import-runs/:importRunId", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    const item = await store.findImportRun(request.params.importRunId);
    if (!item) {
      return reply.code(404).send({ message: "CAD import run was not found." });
    }
    const snapshot = (await store.listSnapshots()).find((candidate) => candidate.importRunId === item.id) ?? null;
    return { item, snapshot, warnings: await store.listWarnings({ importRunId: item.id }) };
  });

  app.get("/api/cad/snapshots", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    return { items: await getCadStore().listSnapshots(readListQuery(request.query)) };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    const item = await store.findSnapshot(request.params.snapshotId);
    if (!item) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return {
      item,
      summary: {
        assemblyCount: (await store.listAssemblyNodes(item.id)).length,
        partDefinitionCount: (await store.listPartDefinitions(item.id)).length,
        partInstanceCount: (await store.listPartInstances(item.id)).length,
        mappingCount: (await store.listSnapshotMappings(item.id)).length,
        warningCount: (await store.listWarnings({ snapshotId: item.id })).length,
      },
    };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/tree", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    if (!(await store.findSnapshot(request.params.snapshotId))) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return buildTree(store, request.params.snapshotId);
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/mappings", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const store = getCadStore();
    if (!(await store.findSnapshot(request.params.snapshotId))) {
      return reply.code(404).send({ message: "CAD snapshot was not found." });
    }
    return { items: await snapshotMappings(store, request.params.snapshotId) };
  });

  app.post<{ Params: { snapshotId: string } }>(
    "/api/cad/snapshots/:snapshotId/mappings/apply",
    async (request, reply) => {
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
      return applyMappingUpdates({
        store,
        snapshot,
        updates: parsed.data.updates,
        reviewedBy: parsed.data.reviewedBy ?? null,
      });
    },
  );

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
    const unresolved = await unresolvedMappings(store, snapshot.id);
    if (unresolved.length > 0 && !parsed.data.allowUnresolved) {
      return reply.code(409).send({
        message: "CAD snapshot still has mappings that need review.",
        unresolvedCount: unresolved.length,
      });
    }
    const item = await store.updateSnapshot(snapshot.id, {
      status: "finalized",
      finalizedAt: new Date().toISOString(),
      finalizedBy: parsed.data.finalizedBy ?? null,
    });
    return { item };
  });

  app.get<{ Params: { snapshotId: string } }>("/api/cad/snapshots/:snapshotId/diff", async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    const diff = await buildCadSnapshotDiff({ store: getCadStore(), snapshotId: request.params.snapshotId });
    return diff ?? reply.code(404).send({ message: "CAD snapshot was not found." });
  });
}
