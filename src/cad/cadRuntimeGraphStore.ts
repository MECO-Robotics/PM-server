import type {
  CadAssemblyCreateInput,
  CadPartDefinitionCreateInput,
  CadPartInstanceCreateInput,
} from "./cadStoreTypes";
import type { CadAssemblyNode, CadPartDefinition, CadPartInstance } from "./cadTypes";
import { clone, nextId, normalizeCadName, nowIso } from "./cadUtils";
import type { CadRuntimeState } from "./cadRuntimeState";

export function buildCadRuntimeGraphStore(state: CadRuntimeState) {
  return {
    createAssemblyNodes(snapshotId: string, input: CadAssemblyCreateInput[]) {
      const bySourceId = new Map<string, CadAssemblyNode>();
      for (const node of input) {
        const item: CadAssemblyNode = {
          ...node,
          id: nextId("cad-assembly", state.assemblyNodes.map((assembly) => assembly.id)),
          snapshotId,
          parentAssemblyNodeId: null,
          normalizedName: normalizeCadName(node.name),
          createdAt: nowIso(),
        };
        state.assemblyNodes.push(item);
        bySourceId.set(item.sourceId, clone(item));
      }
      for (const node of input) {
        const item = bySourceId.get(node.sourceId);
        const parent = node.parentSourceId ? bySourceId.get(node.parentSourceId) : null;
        const stored = item ? state.assemblyNodes.find((assembly) => assembly.id === item.id) : null;
        if (item && parent && stored) {
          item.parentAssemblyNodeId = parent.id;
          stored.parentAssemblyNodeId = parent.id;
        }
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
  };
}
