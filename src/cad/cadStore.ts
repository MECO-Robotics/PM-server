import type { CadStore } from "./cadStoreTypes";
import { buildCadRuntimeGraphStore } from "./cadRuntimeGraphStore";
import { buildCadRuntimeMappingStore } from "./cadRuntimeMappingStore";
import { buildCadRuntimeRunStore } from "./cadRuntimeRunStore";
import { buildInitialCadRuntimeState } from "./cadRuntimeState";

const state = buildInitialCadRuntimeState();

export function getCadRuntimeStore(): CadStore & { reset(): void } {
  return {
    ...buildCadRuntimeRunStore(state),
    ...buildCadRuntimeGraphStore(state),
    ...buildCadRuntimeMappingStore(state),
    reset() {
      Object.assign(state, buildInitialCadRuntimeState());
    },
  };
}

export type CadRuntimeStore = ReturnType<typeof getCadRuntimeStore>;

export function resetCadRuntimeStore() {
  getCadRuntimeStore().reset();
}
