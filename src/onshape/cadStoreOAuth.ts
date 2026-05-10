import { randomUUID } from "node:crypto";

import type { OnshapeRuntimeState } from "./cadStoreTypes";
import { clone, nowIso } from "./cadStoreUtils";
import type { OnshapeOAuthTokenSet } from "./onshapeTypes";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates(state: OnshapeRuntimeState) {
  const cutoff = Date.now() - OAUTH_STATE_TTL_MS;
  state.oauthStates = state.oauthStates.filter((item) => Date.parse(item.createdAt) >= cutoff);
}

export function buildCadOAuthStore(state: OnshapeRuntimeState) {
  return {
    createOAuthState() {
      pruneExpiredStates(state);
      const item = { state: randomUUID(), createdAt: nowIso() };
      state.oauthStates.push(item);
      return clone(item);
    },
    consumeOAuthState(oauthState: string) {
      pruneExpiredStates(state);
      const index = state.oauthStates.findIndex((item) => item.state === oauthState);
      if (index < 0) {
        return false;
      }
      state.oauthStates.splice(index, 1);
      return true;
    },
    getOAuthTokenSet() {
      return state.oauthTokenSet ? clone(state.oauthTokenSet) : null;
    },
    setOAuthTokenSet(tokenSet: OnshapeOAuthTokenSet | null) {
      state.oauthTokenSet = tokenSet ? clone(tokenSet) : null;
      return state.oauthTokenSet ? clone(state.oauthTokenSet) : null;
    },
  };
}
