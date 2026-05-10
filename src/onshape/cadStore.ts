import { buildCadGraphStore } from "./cadStoreGraph";
import { buildCadReferenceStore } from "./cadStoreRefs";
import { buildCadRequestStore } from "./cadStoreRequests";
import type { OnshapeRuntimeStore } from "./cadStoreTypes";
import { buildInitialState } from "./cadStoreUtils";

export type { OnshapeRuntimeStore } from "./cadStoreTypes";

export function createOnshapeRuntimeStore(): OnshapeRuntimeStore {
  const state = buildInitialState();
  return {
    ...buildCadReferenceStore(state),
    ...buildCadRequestStore(state),
    ...buildCadGraphStore(state),
    reset() {
      Object.assign(state, buildInitialState());
    },
  };
}

const globalStore = createOnshapeRuntimeStore();

export function getOnshapeRuntimeStore() {
  return globalStore;
}

export function resetOnshapeRuntimeStore() {
  globalStore.reset();
}
