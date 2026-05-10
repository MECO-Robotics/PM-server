import type { CadStore } from "./cadStoreTypes";
import type { StepParserClient, StepParserMode } from "./stepParserClient";
import type {
  CadAssemblyNode,
  CadPartDefinition,
  CadPartInstance,
  NormalizedCadWarning,
  StepParseResult,
} from "./cadTypes";
import { applyMappingRules } from "./cadMappingEngine";
import { hashText } from "./cadUtils";

export class CadImportError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "CadImportError";
  }
}

export interface StepImportInput {
  fileText: string;
  originalFilename: string;
  label?: string | null;
  projectId?: string | null;
  seasonId?: string | null;
  requestedBy?: string | null;
  uploadedFileId?: string | null;
}

function assertStepFilename(filename: string) {
  const normalized = filename.trim().toLowerCase();
  if (!normalized.endsWith(".step") && !normalized.endsWith(".stp")) {
    throw new CadImportError("STEP imports require a .step or .stp file.");
  }
}

async function appendWarnings(args: {
  store: CadStore;
  importRunId: string;
  snapshotId: string | null;
  warnings: NormalizedCadWarning[];
}) {
  for (const warning of args.warnings) {
    await args.store.appendWarning({
      importRunId: args.importRunId,
      snapshotId: args.snapshotId,
      severity: warning.severity,
      code: warning.code,
      title: warning.title,
      message: warning.message,
      sourceKind: warning.sourceKind ?? null,
      sourceId: warning.sourceId ?? null,
      metadataJson: warning.metadata ?? {},
    });
  }
}

function parserUsedPlaceholder(parsed: StepParseResult) {
  return (
    parsed.parserVersion.includes("placeholder") ||
    parsed.warnings.some((warning) => warning.code === "step_parser_placeholder_used") ||
    parsed.assemblyNodes.some((node) => node.metadata?.placeholder === true) ||
    parsed.partDefinitions.some((part) => part.metadata?.placeholder === true)
  );
}

function parserDiagnostics(args: {
  parsed: StepParseResult;
  configuredParserMode: StepParserMode | "custom";
  placeholderUsed: boolean;
}) {
  return {
    rootName: args.parsed.rootName,
    units: args.parsed.units ?? null,
    parserMode: args.configuredParserMode,
    configuredParserMode: args.configuredParserMode,
    parserVersion: args.parsed.parserVersion,
    actualParserVersion: args.parsed.parserVersion,
    parserUsedPlaceholder: args.placeholderUsed,
    warningCodes: args.parsed.warnings.map((warning) => warning.code),
    ...args.parsed.rawStats,
  };
}

export async function runStepImport(args: {
  store: CadStore;
  parserClient: StepParserClient;
  parserMode?: StepParserMode;
  input: StepImportInput;
}) {
  const filename = args.input.originalFilename.trim();
  assertStepFilename(filename);
  const uploadedFileHash = hashText(args.input.fileText);
  const label = args.input.label?.trim() || filename.replace(/\.(step|stp)$/i, "");

  const importRun = await args.store.createImportRun({
    projectId: args.input.projectId ?? null,
    seasonId: args.input.seasonId ?? null,
    source: "STEP_UPLOAD",
    status: "PENDING",
    originalFilename: filename,
    uploadedFileId: args.input.uploadedFileId ?? null,
    uploadedFileHash,
    parserVersion: null,
    parseStartedAt: null,
    parseCompletedAt: null,
    requestedBy: args.input.requestedBy ?? null,
    errorMessage: null,
    rawSummaryJson: {},
  });

  const parseStartedAt = new Date().toISOString();
  await args.store.updateImportRun(importRun.id, { status: "PARSING", parseStartedAt });

  try {
    const parsed = await args.parserClient.parseStepFile({
      fileText: args.input.fileText,
      originalFilename: filename,
      importRunId: importRun.id,
    });
    const configuredParserMode = args.parserMode ?? "custom";
    const placeholderUsed = parserUsedPlaceholder(parsed);
    if (placeholderUsed && configuredParserMode !== "placeholder") {
      throw new Error("STEP parser returned placeholder output outside explicit placeholder mode.");
    }
    if (placeholderUsed && process.env.NODE_ENV === "production") {
      throw new Error("Production deployments cannot use the placeholder STEP parser.");
    }
    const diagnostics = parserDiagnostics({ parsed, configuredParserMode, placeholderUsed });
    const parseCompletedAt = new Date().toISOString();
    const snapshot = await args.store.createSnapshot({
      projectId: args.input.projectId ?? null,
      seasonId: args.input.seasonId ?? null,
      importRunId: importRun.id,
      source: "STEP_UPLOAD",
      label,
      uploadedFileId: args.input.uploadedFileId ?? null,
      uploadedFileHash,
      status: "parsed",
      createdBy: args.input.requestedBy ?? null,
      finalizedBy: null,
      finalizedAt: null,
      notes: null,
    });

    const assemblyNodesBySourceId = await args.store.createAssemblyNodes(
      snapshot.id,
      parsed.assemblyNodes.map((node): Omit<CadAssemblyNode, "id" | "snapshotId" | "createdAt" | "normalizedName" | "parentAssemblyNodeId"> => ({
        sourceId: node.sourceId,
        parentSourceId: node.parentSourceId ?? null,
        name: node.name,
        instancePath: node.instancePath,
        depth: node.depth,
        inferredType: node.inferredType,
        stableSignature: node.stableSignature ?? `asm:source:${node.sourceId}`,
        metadataJson: node.metadata ?? {},
      })),
    );

    const partDefinitionsBySourceId = await args.store.createPartDefinitions(
      snapshot.id,
      parsed.partDefinitions.map((part): Omit<CadPartDefinition, "id" | "snapshotId" | "createdAt" | "normalizedName"> => ({
        sourceId: part.sourceId,
        name: part.name,
        partNumber: part.partNumber ?? null,
        material: part.material ?? null,
        stableSignature: part.stableSignature ?? `part:source:${part.sourceId}`,
        metadataJson: part.metadata ?? {},
      })),
    );

    const partInstances = await args.store.createPartInstances(
      snapshot.id,
      parsed.partInstances.map((instance): Omit<CadPartInstance, "id" | "snapshotId" | "createdAt"> => ({
        sourceId: instance.sourceId,
        partDefinitionId: instance.partDefinitionSourceId
          ? partDefinitionsBySourceId.get(instance.partDefinitionSourceId)?.id ?? null
          : null,
        parentAssemblyNodeId: instance.parentAssemblySourceId
          ? assemblyNodesBySourceId.get(instance.parentAssemblySourceId)?.id ?? null
          : null,
        instancePath: instance.instancePath,
        quantity: instance.quantity ?? 1,
        stableSignature: instance.stableSignature ?? `inst:source:${instance.sourceId}`,
        metadataJson: instance.metadata ?? {},
      })),
    );

    await appendWarnings({
      store: args.store,
      importRunId: importRun.id,
      snapshotId: snapshot.id,
      warnings: parsed.warnings,
    });

    const assemblyNodes = await args.store.listAssemblyNodes(snapshot.id);
    const partDefinitions = await args.store.listPartDefinitions(snapshot.id);
    const mappings = await applyMappingRules({
      store: args.store,
      snapshot,
      importRunId: importRun.id,
      assemblyNodes,
      partDefinitions,
      partInstances,
    });
    const unresolved = mappings.some((mapping) => mapping.status === "NEEDS_REVIEW");
    const nextStatus = unresolved ? "MAPPING_REVIEW" : "MAPPED";
    const snapshotStatus = unresolved ? "mapping_review" : "mapped";
    const updatedSnapshot = (await args.store.updateSnapshot(snapshot.id, { status: snapshotStatus })) ?? snapshot;
    const updatedRun = (await args.store.updateImportRun(importRun.id, {
      status: nextStatus,
      parserVersion: parsed.parserVersion,
      parseCompletedAt,
      rawSummaryJson: diagnostics,
    })) ?? importRun;

    return {
      importRun: updatedRun,
      snapshot: updatedSnapshot,
      summary: {
        assemblyCount: assemblyNodes.length,
        partDefinitionCount: partDefinitions.length,
        partInstanceCount: partInstances.length,
        maxDepth: parsed.rawStats.maxDepth,
        parserVersion: parsed.parserVersion,
        configuredParserMode,
        actualParserVersion: parsed.parserVersion,
        parserUsedPlaceholder: placeholderUsed,
        rawStats: diagnostics,
        warningCount: (await args.store.listWarnings({ importRunId: importRun.id })).length,
        mappingCount: mappings.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await args.store.appendWarning({
      importRunId: importRun.id,
      snapshotId: null,
      severity: "ERROR",
      code: "step_parser_failed",
      title: "STEP parser failed",
      message,
      sourceKind: null,
      sourceId: null,
      metadataJson: {},
    });
    const failedRun = await args.store.updateImportRun(importRun.id, {
      status: "FAILED",
      errorMessage: message,
      parseCompletedAt: new Date().toISOString(),
    });
    throw new CadImportError(failedRun?.errorMessage ?? message, 422);
  }
}
