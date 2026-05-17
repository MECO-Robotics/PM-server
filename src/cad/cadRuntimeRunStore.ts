import type {
  CadImportRunCreateInput,
  CadImportRunPatchInput,
  CadSnapshotCreateInput,
  CadSnapshotPatchInput,
} from "./cadStoreTypes";
import type { CadImportRun, CadSnapshot } from "./cadTypes";
import { clone, nextId, nowIso } from "./cadUtils";
import { filterCadProjectSeason, type CadRuntimeState } from "./cadRuntimeState";

export function buildCadRuntimeRunStore(state: CadRuntimeState) {
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
    listImportRuns(filter?: {
      projectId?: string | null;
      seasonId?: string | null;
      source?: CadImportRun["source"];
      status?: CadImportRun["status"];
    }) {
      return clone(
        filterCadProjectSeason(state.importRuns, filter?.projectId, filter?.seasonId)
          .filter((run) => !filter?.source || run.source === filter.source)
          .filter((run) => !filter?.status || run.status === filter.status)
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
        filterCadProjectSeason(state.snapshots, filter?.projectId, filter?.seasonId)
          .filter((snapshot) => !filter?.source || snapshot.source === filter.source)
          .filter((snapshot) => !filter?.status || snapshot.status === filter.status)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    findSnapshot(id: string) {
      const item = state.snapshots.find((snapshot) => snapshot.id === id);
      return item ? clone(item) : null;
    },
  };
}
