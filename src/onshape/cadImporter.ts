import type { OnshapeRuntimeStore } from "./cadStore";
import {
  OnshapeCallBudgetExceededError,
  OnshapeRateLimitError,
} from "./onshapeApiClient";
import {
  addBudgetStopWarning,
  addGraphWarnings,
  addReferenceWarnings,
} from "./cadImporterWarnings";
import { estimateCadImportCalls as estimateSyncCalls } from "./onshapeSyncPolicy";
import type {
  CadGraphImportResult,
  CadImportOnshapeClient,
  CadSnapshot,
  OnshapeAssemblyBomResponse,
  OnshapeDocumentMetadataResponse,
  OnshapeDocumentRef,
  OnshapeReference,
  RequestPolicy,
  SyncLevel,
} from "./onshapeTypes";

function toReference(documentRef: OnshapeDocumentRef): OnshapeReference {
  return {
    documentId: documentRef.documentId,
    workspaceId: documentRef.workspaceId,
    versionId: documentRef.versionId,
    microversionId: documentRef.microversionId,
    elementId: documentRef.elementId,
    originalUrl: documentRef.originalUrl,
    referenceType: documentRef.referenceType,
  };
}

function buildPolicy(store: OnshapeRuntimeStore, syncLevel: SyncLevel): RequestPolicy {
  const budget = store.getBudget();
  const maxCallsAllowed = typeof budget.perSyncSoftBudget === "number"
    ? budget.perSyncSoftBudget
    : Number.POSITIVE_INFINITY;
  return {
    priority: syncLevel === "deep_release" ? "interactive" : "snapshot",
    maxCallsAllowed,
    allowCached: true,
    requireFresh: false,
    stopIfRemainingBelow: 5,
  };
}

function metadataLabel(metadata: OnshapeDocumentMetadataResponse | null, fallback: string) {
  const label = [metadata?.documentName, metadata?.elementName].filter(Boolean).join(" - ");
  return label || fallback;
}

function completeRun(args: {
  store: OnshapeRuntimeStore;
  runId: string;
  status: "completed" | "partial" | "failed";
  client: CadImportOnshapeClient;
  snapshotId?: string;
  stoppedReason?: string | null;
  errorMessage?: string | null;
  summary?: Record<string, unknown>;
}): CadGraphImportResult {
  const callsUsed = args.client.getCallsUsed();
  args.store.updateImportRun(args.runId, {
    status: args.status,
    completedAt: new Date().toISOString(),
    callsUsed,
    stoppedReason: args.stoppedReason ?? null,
    errorMessage: args.errorMessage ?? null,
    rawSummaryJson: args.summary ?? {},
  });

  return {
    importRunId: args.runId,
    snapshotId: args.snapshotId,
    status: args.status,
    callsUsed,
    assemblyNodeCount: args.snapshotId ? args.store.listAssemblyNodes(args.snapshotId).length : 0,
    partDefinitionCount: args.snapshotId ? args.store.listPartDefinitions(args.snapshotId).length : 0,
    partInstanceCount: args.snapshotId ? args.store.listPartInstances(args.snapshotId).length : 0,
    warningCount: args.store.listWarnings({ importRunId: args.runId }).length,
    stoppedReason: args.stoppedReason ?? undefined,
  };
}

async function importBomGraph(args: {
  store: OnshapeRuntimeStore;
  runId: string;
  snapshot: CadSnapshot;
  bom: OnshapeAssemblyBomResponse;
}) {
  const assemblyNodesBySourceId = args.store.upsertAssemblyNodes(args.snapshot.id, args.bom.assemblyNodes);
  const partDefinitionsBySourceId = args.store.upsertPartDefinitions(args.snapshot.id, args.bom.partDefinitions);
  const partInstances = args.store.upsertPartInstances(
    args.snapshot.id,
    args.bom.partInstances,
    partDefinitionsBySourceId,
    assemblyNodesBySourceId,
  );

  addGraphWarnings({
    store: args.store,
    runId: args.runId,
    snapshot: args.snapshot,
    assemblyNodes: args.store.listAssemblyNodes(args.snapshot.id),
    partDefinitions: args.store.listPartDefinitions(args.snapshot.id),
    partInstances,
    normalizedPartDefinitions: args.bom.partDefinitions,
  });
  return args.bom.raw;
}

export async function runCadImport(args: {
  store: OnshapeRuntimeStore;
  documentRefId: string;
  syncLevel: SyncLevel;
  requestedBy?: string | null;
  client: CadImportOnshapeClient;
}): Promise<CadGraphImportResult> {
  const documentRef = args.store.findDocumentRef(args.documentRefId);
  if (!documentRef) {
    throw new Error("Onshape document reference was not found.");
  }

  const run = args.store.createImportRun({
    documentRefId: documentRef.id,
    syncLevel: args.syncLevel,
    requestedBy: args.requestedBy,
    callsEstimated: estimateSyncCalls(args.syncLevel),
  });
  addReferenceWarnings(args.store, run.id, documentRef);

  if (args.syncLevel === "link_only") {
    return completeRun({
      store: args.store,
      runId: run.id,
      status: "completed",
      client: args.client,
      summary: { syncLevel: args.syncLevel, linkOnly: true },
    });
  }

  const reference = toReference(documentRef);
  const policy = buildPolicy(args.store, args.syncLevel);
  let snapshot: CadSnapshot | null = null;

  try {
    const metadata = await args.client.fetchDocumentMetadata({ reference, importRunId: run.id, policy });
    const bom = args.syncLevel === "shallow"
      ? null
      : await args.client.fetchAssemblyBom({
          reference,
          importRunId: run.id,
          policy,
        });
    snapshot = args.store.upsertSnapshot({
      documentRef,
      importRunId: run.id,
      label: metadataLabel(metadata, documentRef.label),
      createdBy: args.requestedBy,
      source: args.syncLevel === "deep_release" ? "manufacturing_release" : "manual_snapshot",
      notes: args.syncLevel === "deep_release" ? "Deep release sync requested." : null,
    });

    const raw = bom === null
      ? { metadata }
      : await importBomGraph({ store: args.store, runId: run.id, snapshot, bom });

    return completeRun({
      store: args.store,
      runId: run.id,
      status: "completed",
      client: args.client,
      snapshotId: snapshot.id,
      summary: { metadata, raw },
    });
  } catch (error) {
    const isBudgetStop = error instanceof OnshapeCallBudgetExceededError || error instanceof OnshapeRateLimitError;
    const stoppedReason = error instanceof Error ? error.message : String(error);
    if (isBudgetStop) {
      addBudgetStopWarning({
        store: args.store,
        runId: run.id,
        snapshotId: snapshot?.id ?? null,
        syncLevel: args.syncLevel,
        stoppedReason,
      });
    }
    return completeRun({
      store: args.store,
      runId: run.id,
      status: isBudgetStop ? "partial" : "failed",
      client: args.client,
      snapshotId: snapshot?.id,
      stoppedReason,
      errorMessage: isBudgetStop ? null : stoppedReason,
      summary: { syncLevel: args.syncLevel },
    });
  }
}

export function estimateCadImportCalls(syncLevel: SyncLevel) {
  return estimateSyncCalls(syncLevel);
}
