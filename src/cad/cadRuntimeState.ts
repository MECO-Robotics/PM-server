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

export interface CadRuntimeState {
  importRuns: CadImportRun[];
  snapshots: CadSnapshot[];
  assemblyNodes: CadAssemblyNode[];
  partDefinitions: CadPartDefinition[];
  partInstances: CadPartInstance[];
  mappingRules: CadMappingRule[];
  snapshotMappings: CadSnapshotMapping[];
  warnings: CadImportWarning[];
}

export function buildInitialCadRuntimeState(): CadRuntimeState {
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

export function filterCadProjectSeason<T extends { projectId: string | null; seasonId: string | null }>(
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
