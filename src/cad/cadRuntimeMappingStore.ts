import type {
  CadMappingRuleCreateInput,
  CadMappingRulePatchInput,
  CadSnapshotMappingPatchInput,
  CadSnapshotMappingUpsertInput,
  CadWarningCreateInput,
} from "./cadStoreTypes";
import type { CadImportWarning, CadMappingRule, CadSnapshotMapping } from "./cadTypes";
import { clone, nextId, nowIso } from "./cadUtils";
import type { CadRuntimeState } from "./cadRuntimeState";

export function buildCadRuntimeMappingStore(state: CadRuntimeState) {
  return {
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
  };
}
