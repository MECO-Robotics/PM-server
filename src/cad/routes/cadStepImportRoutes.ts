import type { FastifyInstance } from "fastify";

import { cadStepUploadConfig, resolveCadStepParserMode } from "../../config/env";
import {
  buildStepParserDiagnostics,
  CadImportError,
  runStepImport,
  stepParserUsedPlaceholder,
} from "../cadImportService";
import { getCadStore } from "../cadStoreFactory";
import { createStepParserClient } from "../stepParserClient";
import { readStepImportPayload } from "./cadStepImportPayload";
import type { RequireApiSession } from "./cadRouteTypes";

export function registerCadStepImportRoutes(app: FastifyInstance, requireApiSession: RequireApiSession) {
  const stepUploadRouteOptions = { bodyLimit: cadStepUploadConfig.maxBytes };

  app.post("/api/cad/step-imports/debug-parse", stepUploadRouteOptions, async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    try {
      const payload = await readStepImportPayload(request);
      const parserMode = resolveCadStepParserMode();
      const parsed = await createStepParserClient({ mode: parserMode }).parseStepFile({
        fileText: payload.fileText,
        originalFilename: payload.fileName,
        importRunId: "debug-parse",
      });
      const parserUsedPlaceholder = stepParserUsedPlaceholder(parsed);
      const diagnostics = buildStepParserDiagnostics({
        parsed,
        configuredParserMode: parserMode,
        placeholderUsed: parserUsedPlaceholder,
      });
      return {
        ...diagnostics,
        rawStats: diagnostics,
        assemblyCount: parsed.assemblyNodes.length,
        partDefinitionCount: parsed.partDefinitions.length,
        partInstanceCount: parsed.partInstances.length,
        parserVersion: parsed.parserVersion,
        parserUsedPlaceholder,
        warnings: parsed.warnings,
      };
    } catch (error) {
      if (error instanceof CadImportError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(422).send({ message });
    }
  });

  app.post("/api/cad/step-imports", stepUploadRouteOptions, async (request, reply) => {
    if (!requireApiSession(request, reply)) {
      return;
    }
    try {
      const payload = await readStepImportPayload(request);
      let parserMode: ReturnType<typeof resolveCadStepParserMode>;
      try {
        parserMode = resolveCadStepParserMode();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CadImportError(message, 500);
      }
      const result = await runStepImport({
        store: getCadStore(),
        parserClient: createStepParserClient({ mode: parserMode }),
        parserMode,
        allowPlaceholder: process.env.NODE_ENV === "test" && payload.allowPlaceholder === true,
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
}
