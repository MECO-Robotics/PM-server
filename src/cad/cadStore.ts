import type {
  CadAssemblyNode,
  CadImportRun,
  CadImportWarning,
  CadMappingRule,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  CadSnapshotMapping,
} from "./cadTypes";
import type {
  CadAssemblyCreateInput,
  CadImportRunCreateInput,
  CadImportRunPatchInput,
  CadMappingRuleCreateInput,
  CadMappingRulePatchInput,
  CadPartDefinitionCreateInput,
  CadPartInstanceCreateInput,
  CadSnapshotCreateInput,
  CadSnapshotMappingPatchInput,
  CadSnapshotMappingUpsertInput,
  CadSnapshotPatchInput,
  CadStore,
  CadWarningCreateInput,
} from "./cadStoreTypes";
import { clone, nextId, normalizeCadName, nowIso } from "./cadUtils";

interface CadRuntimeState {
  importRuns: CadImportRun[];
  snapshots: CadSnapshot[];
  assemblyNodes: CadAssemblyNode[];
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
  mappingRules: CadMappingRule[];
  snapshotMappings: CadSnapshotMapping[];
  warnings: CadImportWarning[];
}

function buildInitialState(): CadRuntimeState {
  return {
    importRuns: [],
    snapshots: [],
    assemblyNodes: [],
    partDefinitions: [],
    partInstances: [],
    mappingRules: [],
    snapshotMappings: [],
    warnings: [],
  };
}

const state = buildInitialState();

function filterProjectSeason<T extends { projectId: string | null; seasonId: string | null }>(
  items: T[],
  projectId?: string | null,
  seasonId?: string | null,
) {
  return items.filter(
    (item) =>
      (projectId === undefined || item.projectId === projectId) &&
      (seasonId === undefined || item.seasonId === seasonId),
  );
}

export function getCadRuntimeStore(): CadStore & { reset(): void } {
  return {
    createImportRun(input: CadImportRunCreateInput) {
      const timestamp = nowIso();
      const item: CadImportRun = {
        ...input,
        id: nextId("cad-import", state.importRuns.map((run) => run.id)),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.importRuns.push(item);
      return clone(item);
    },
    updateImportRun(id: string, patch: CadImportRunPatchInput) {
      const item = state.importRuns.find((run) => run.id === id);
      if (!item) {
        return null;
      }
      Object.assign(item, patch, { updatedAt: nowIso() });
      return clone(item);
    },
    listImportRuns(filter?: { projectId?: string | null; seasonId?: string | null }) {
      return clone(
        filterProjectSeason(state.importRuns, filter?.projectId, filter?.seasonId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    findImportRun(id: string) {
      const item = state.importRuns.find((run) => run.id === id);
      return item ? clone(item) : null;
    },
    createSnapshot(input: CadSnapshotCreateInput) {
      const previous = state.snapshots
        .filter(
          (snapshot) =>
            snapshot.projectId === input.projectId &&
            snapshot.seasonId === input.seasonId &&
            snapshot.source === input.source,
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      const item: CadSnapshot = {
        ...input,
        id: nextId("cad-snapshot", state.snapshots.map((snapshot) => snapshot.id)),
        previousSnapshotId: previous?.id ?? null,
        createdAt: nowIso(),
      };
      state.snapshots.push(item);
      return clone(item);
    },
    updateSnapshot(id: string, patch: CadSnapshotPatchInput) {
      const item = state.snapshots.find((snapshot) => snapshot.id === id);
      if (!item) {
        return null;
      }
      Object.assign(item, patch);
      return clone(item);
    },
    listSnapshots(filter?: {
      projectId?: string | null;
      seasonId?: string | null;
      source?: string;
      status?: string;
    }) {
      return clone(
        filterProjectSeason(state.snapshots, filter?.projectId, filter?.seasonId)
          .filter((snapshot) => !filter?.source || snapshot.source === filter.source)
          .filter((snapshot) => !filter?.status || snapshot.status === filter.status)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    findSnapshot(id: string) {
      const item = state.snapshots.find((snapshot) => snapshot.id === id);
      return item ? clone(item) : null;
    },
    createAssemblyNodes(snapshotId: string, input: CadAssemblyCreateInput[]) {
      const bySourceId = new Map<string, CadAssemblyNode>();
      for (const node of input) {
        const parent = node.parentSourceId ? bySourceId.get(node.parentSourceId) : null;
        const item: CadAssemblyNode = {
          ...node,
          id: nextId("cad-assembly", state.assemblyNodes.map((assembly) => assembly.id)),
          snapshotId,
          parentAssemblyNodeId: parent?.id ?? null,
          normalizedName: normalizeCadName(node.name),
          createdAt: nowIso(),
        };
        state.assemblyNodes.push(item);
        bySourceId.set(item.sourceId, clone(item));
      }
      return bySourceId;
    },
    createPartDefinitions(snapshotId: string, input: CadPartDefinitionCreateInput[]) {
      const bySourceId = new Map<string, CadPartDefinition>();
      for (const part of input) {
        const item: CadPartDefinition = {
          ...part,
          id: nextId("cad-part-def", state.partDefinitions.map((candidate) => candidate.id)),
          snapshotId,
          normalizedName: normalizeCadName(part.name),
          createdAt: nowIso(),
        };
        state.partDefinitions.push(item);
        bySourceId.set(item.sourceId, clone(item));
      }
      return bySourceId;
    },
    createPartInstances(snapshotId: string, input: CadPartInstanceCreateInput[]) {
      const items: CadPartInstance[] = [];
      for (const instance of input) {
        const item: CadPartInstance = {
          ...instance,
          id: nextId("cad-part-inst", state.partInstances.map((candidate) => candidate.id)),
          snapshotId,
          createdAt: nowIso(),
        };
        state.partInstances.push(item);
        items.push(clone(item));
      }
      return items;
    },
    listAssemblyNodes(snapshotId?: string) {
      return clone(state.assemblyNodes.filter((item) => !snapshotId || item.snapshotId === snapshotId));
    },
    listPartDefinitions(snapshotId?: string) {
      return clone(state.partDefinitions.filter((item) => !snapshotId || item.snapshotId === snapshotId));
    },
    listPartInstances(snapshotId?: string) {
      return clone(state.partInstances.filter((item) => !snapshotId || item.snapshotId === snapshotId));
    },
    createMappingRule(input: CadMappingRuleCreateInput) {
      const item: CadMappingRule = {
        ...input,
        id: nextId("cad-rule", state.mappingRules.map((rule) => rule.id)),
        active: input.active ?? true,
        supersededByRuleId: input.supersededByRuleId ?? null,
        createdAt: nowIso(),
      };
      state.mappingRules.push(item);
      return clone(item);
    },
    updateMappingRule(id: string, patch: CadMappingRulePatchInput) {
      const item = state.mappingRules.find((rule) => rule.id === id);
      if (!item) {
        return null;
      }
      Object.assign(item, patch);
      return clone(item);
    },
    listMappingRules(filter?: { projectId?: string | null; seasonId?: string | null; active?: boolean }) {
      return clone(
        state.mappingRules.filter(
          (rule) =>
            (filter?.projectId === undefined || rule.projectId === filter.projectId) &&
            (filter?.seasonId === undefined || rule.seasonId === filter.seasonId || rule.seasonId === null) &&
            (filter?.active === undefined || rule.active === filter.active),
        ),
      );
    },
    findMappingRule(id: string) {
      const item = state.mappingRules.find((rule) => rule.id === id);
      return item ? clone(item) : null;
    },
    upsertSnapshotMapping(input: CadSnapshotMappingUpsertInput) {
      const existing = state.snapshotMappings.find(
        (mapping) =>
          mapping.snapshotId === input.snapshotId &&
          mapping.sourceKind === input.sourceKind &&
          mapping.sourceId === input.sourceId,
      );
      const timestamp = nowIso();
      if (existing) {
        Object.assign(existing, input, { updatedAt: timestamp });
        return clone(existing);
      }
      const item: CadSnapshotMapping = {
        ...input,
        id: nextId("cad-mapping", state.snapshotMappings.map((mapping) => mapping.id)),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.snapshotMappings.push(item);
      return clone(item);
    },
    updateSnapshotMapping(id: string, patch: CadSnapshotMappingPatchInput) {
      const item = state.snapshotMappings.find((mapping) => mapping.id === id);
      if (!item) {
        return null;
      }
      Object.assign(item, patch, { updatedAt: nowIso() });
      return clone(item);
    },
    listSnapshotMappings(snapshotId?: string) {
      return clone(state.snapshotMappings.filter((item) => !snapshotId || item.snapshotId === snapshotId));
    },
    appendWarning(input: CadWarningCreateInput) {
      const item: CadImportWarning = {
        ...input,
        id: nextId("cad-warning", state.warnings.map((warning) => warning.id)),
        createdAt: nowIso(),
      };
      state.warnings.push(item);
      return clone(item);
    },
    listWarnings(filter?: { importRunId?: string; snapshotId?: string }) {
      return clone(
        state.warnings.filter(
          (warning) =>
            (!filter?.importRunId || warning.importRunId === filter.importRunId) &&
            (!filter?.snapshotId || warning.snapshotId === filter.snapshotId),
        ),
      );
    },
    reset() {
      Object.assign(state, buildInitialState());
    },
  };
}

export type CadRuntimeStore = ReturnType<typeof getCadRuntimeStore>;

export function resetCadRuntimeStore() {
  getCadRuntimeStore().reset();
}
