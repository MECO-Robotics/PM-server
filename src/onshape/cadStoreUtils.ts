import type { OnshapeRuntimeState } from "./cadStoreTypes";

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isImmutableReference(reference: { referenceType?: string }) {
  return reference.referenceType === "version" || reference.referenceType === "microversion";
}

export function nextId(prefix: string, existingIds: Iterable<string>) {
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildInitialState(): OnshapeRuntimeState {
  const createdAt = nowIso();
  return {
    documentRefs: [],
    importRuns: [],
    requestLogs: [],
    cacheEntries: [],
    snapshots: [],
    snapshotRunLinks: [],
    assemblyNodes: [],
    partDefinitions: [],
    partInstances: [],
    warnings: [],
    oauthTokenSet: null,
    oauthStates: [],
    budget: {
      id: "onshape-budget-default",
      organizationId: null,
      planType: "education",
      annualCallBudget: null,
      monthlyCallBudget: null,
      dailySoftBudget: 100,
      perSyncSoftBudget: 25,
      callsUsedToday: 0,
      callsUsedThisMonth: 0,
      callsUsedThisYear: 0,
      warningThresholdPercent: 70,
      hardStopThresholdPercent: 90,
      lastRateLimitRemaining: null,
      lastResetAt: null,
      createdAt,
      updatedAt: createdAt,
    },
  };
}
