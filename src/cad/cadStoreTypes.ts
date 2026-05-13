import type {
  CadAssemblyNode,
  CadImportSource,
  CadImportRun,
  CadImportStatus,
  CadImportWarning,
  CadMappingRule,
  CadPartDefinition,
  CadPartInstance,
  CadSnapshot,
  CadSnapshotMapping,
} from "./cadTypes";

export type Awaitable<T> = T | Promise<T>;

export type CadImportRunCreateInput = Omit<CadImportRun, "id" | "createdAt" | "updatedAt">;
export type CadImportRunPatchInput = Partial<Omit<CadImportRun, "id" | "createdAt">>;
export type CadSnapshotCreateInput = Omit<CadSnapshot, "id" | "createdAt" | "previousSnapshotId">;
export type CadSnapshotPatchInput = Partial<Omit<CadSnapshot, "id" | "createdAt">>;
export type CadAssemblyCreateInput = Omit<
  CadAssemblyNode,
  "id" | "snapshotId" | "createdAt" | "normalizedName" | "parentAssemblyNodeId"
>;
export type CadPartDefinitionCreateInput = Omit<
  CadPartDefinition,
  "id" | "snapshotId" | "createdAt" | "normalizedName"
>;
export type CadPartInstanceCreateInput = Omit<CadPartInstance, "id" | "snapshotId" | "createdAt">;
export type CadMappingRuleCreateInput = Omit<
  CadMappingRule,
  "id" | "createdAt" | "active" | "supersededByRuleId"
> & {
  active?: boolean;
  supersededByRuleId?: string | null;
};
export type CadMappingRulePatchInput = Partial<Pick<CadMappingRule, "active" | "supersededByRuleId" | "notes">>;
export type CadSnapshotMappingUpsertInput = Omit<CadSnapshotMapping, "id" | "createdAt" | "updatedAt">;
export type CadSnapshotMappingPatchInput = Partial<Omit<CadSnapshotMapping, "id" | "createdAt">>;
export type CadWarningCreateInput = Omit<CadImportWarning, "id" | "createdAt">;

export interface CadStore {
  createImportRun(input: CadImportRunCreateInput): Awaitable<CadImportRun>;
  updateImportRun(id: string, patch: CadImportRunPatchInput): Awaitable<CadImportRun | null>;
  listImportRuns(filter?: {
    projectId?: string | null;
    seasonId?: string | null;
    source?: CadImportSource;
    status?: CadImportStatus;
  }): Awaitable<CadImportRun[]>;
  findImportRun(id: string): Awaitable<CadImportRun | null>;
  createSnapshot(input: CadSnapshotCreateInput): Awaitable<CadSnapshot>;
  updateSnapshot(id: string, patch: CadSnapshotPatchInput): Awaitable<CadSnapshot | null>;
  listSnapshots(filter?: {
    projectId?: string | null;
    seasonId?: string | null;
    source?: string;
    status?: string;
  }): Awaitable<CadSnapshot[]>;
  findSnapshot(id: string): Awaitable<CadSnapshot | null>;
  createAssemblyNodes(
    snapshotId: string,
    input: CadAssemblyCreateInput[],
  ): Awaitable<Map<string, CadAssemblyNode>>;
  createPartDefinitions(
    snapshotId: string,
    input: CadPartDefinitionCreateInput[],
  ): Awaitable<Map<string, CadPartDefinition>>;
  createPartInstances(snapshotId: string, input: CadPartInstanceCreateInput[]): Awaitable<CadPartInstance[]>;
  listAssemblyNodes(snapshotId?: string): Awaitable<CadAssemblyNode[]>;
  listPartDefinitions(snapshotId?: string): Awaitable<CadPartDefinition[]>;
  listPartInstances(snapshotId?: string): Awaitable<CadPartInstance[]>;
  createMappingRule(input: CadMappingRuleCreateInput): Awaitable<CadMappingRule>;
  updateMappingRule(id: string, patch: CadMappingRulePatchInput): Awaitable<CadMappingRule | null>;
  listMappingRules(filter?: {
    projectId?: string | null;
    seasonId?: string | null;
    active?: boolean;
  }): Awaitable<CadMappingRule[]>;
  findMappingRule(id: string): Awaitable<CadMappingRule | null>;
  upsertSnapshotMapping(input: CadSnapshotMappingUpsertInput): Awaitable<CadSnapshotMapping>;
  updateSnapshotMapping(id: string, patch: CadSnapshotMappingPatchInput): Awaitable<CadSnapshotMapping | null>;
  listSnapshotMappings(snapshotId?: string): Awaitable<CadSnapshotMapping[]>;
  appendWarning(input: CadWarningCreateInput): Awaitable<CadImportWarning>;
  listWarnings(filter?: { importRunId?: string; snapshotId?: string }): Awaitable<CadImportWarning[]>;
}
