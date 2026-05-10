import type { OnshapeRuntimeStore } from "./cadStore";
import type { OnshapeDocumentRef, SyncLevel } from "./onshapeTypes";

const callsBySyncLevel: Record<SyncLevel, number> = {
  link_only: 0,
  shallow: 1,
  bom: 2,
  deep_release: 3,
};

type CacheStatus = "not_required" | "hit" | "miss" | "stale";

interface MemberLike {
  email?: string | null;
  role?: string | null;
}

function isImmutableReference(documentRef: OnshapeDocumentRef) {
  return documentRef.referenceType === "version" || documentRef.referenceType === "microversion";
}

function syncRequestHashes(syncLevel: SyncLevel) {
  if (syncLevel === "link_only") {
    return [];
  }
  if (syncLevel === "shallow") {
    return ["metadata"];
  }
  return ["metadata", "bom"];
}

function cacheEntryMatchesRef(entry: ReturnType<OnshapeRuntimeStore["listCacheEntries"]>[number], ref: OnshapeDocumentRef) {
  return (
    entry.documentId === ref.documentId &&
    entry.workspaceId === (ref.workspaceId ?? null) &&
    entry.versionId === (ref.versionId ?? null) &&
    entry.microversionId === (ref.microversionId ?? null) &&
    entry.elementId === (ref.elementId ?? null)
  );
}

function cacheEntryIsFresh(entry: ReturnType<OnshapeRuntimeStore["listCacheEntries"]>[number]) {
  return entry.immutable || !entry.expiresAt || Date.parse(entry.expiresAt) > Date.now();
}

function estimateCacheStatus(store: OnshapeRuntimeStore, documentRef: OnshapeDocumentRef, syncLevel: SyncLevel): CacheStatus {
  const requestHashes = syncRequestHashes(syncLevel);
  if (requestHashes.length === 0) {
    return "not_required";
  }

  const matchingEntries = store.listCacheEntries().filter((entry) => cacheEntryMatchesRef(entry, documentRef));
  if (requestHashes.every((requestHash) => matchingEntries.some((entry) => entry.requestHash === requestHash && cacheEntryIsFresh(entry)))) {
    return "hit";
  }
  if (matchingEntries.some((entry) => requestHashes.includes(entry.requestHash) && !cacheEntryIsFresh(entry))) {
    return "stale";
  }
  return "miss";
}

export function estimateOnshapeSync(args: {
  store: OnshapeRuntimeStore;
  documentRefId: string;
  syncLevel: SyncLevel;
}) {
  const documentRef = args.store.findDocumentRef(args.documentRefId);
  if (!documentRef) {
    return null;
  }

  const budget = args.store.getBudget();
  const callsEstimated = callsBySyncLevel[args.syncLevel];
  const warnings: string[] = [];
  if (documentRef.referenceType === "workspace" && args.syncLevel !== "link_only") {
    warnings.push("workspace_reference_not_immutable");
  }
  if (!documentRef.elementId) {
    warnings.push("missing_element_id");
  }
  if (budget.perSyncSoftBudget !== null && callsEstimated > budget.perSyncSoftBudget) {
    warnings.push("sync_estimate_exceeds_per_sync_budget");
  }

  return {
    documentRefId: documentRef.id,
    syncLevel: args.syncLevel,
    callsEstimated,
    allowCached: true,
    requireFresh: false,
    immutableReference: isImmutableReference(documentRef),
    referenceType: documentRef.referenceType,
    cacheStatus: estimateCacheStatus(args.store, documentRef, args.syncLevel),
    perSyncSoftBudget: budget.perSyncSoftBudget,
    budgetAllowsSync: budget.perSyncSoftBudget === null || callsEstimated <= budget.perSyncSoftBudget,
    warnings,
  };
}

export function canRunDeepReleaseSync(args: {
  authEnabled: boolean;
  userEmail: string | null;
  members: MemberLike[];
}) {
  if (!args.authEnabled) {
    return true;
  }
  if (!args.userEmail) {
    return false;
  }
  const normalizedEmail = args.userEmail.trim().toLowerCase();
  const member = args.members.find((item) => item.email?.trim().toLowerCase() === normalizedEmail);
  return member?.role === "lead" || member?.role === "mentor" || member?.role === "admin";
}

export function estimateCadImportCalls(syncLevel: SyncLevel) {
  return callsBySyncLevel[syncLevel];
}
