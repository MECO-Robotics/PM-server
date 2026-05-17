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
    createOAuthState(input: {
      sessionKey: string;
      apiSessionAccountId?: string | null;
      apiSessionCanManageOAuthCredentials?: boolean;
    }) {
      pruneExpiredStates(state);
      const item = {
        state: randomUUID(),
        createdAt: nowIso(),
        sessionKey: input.sessionKey,
        apiSessionAccountId: input.apiSessionAccountId ?? null,
        apiSessionCanManageOAuthCredentials: input.apiSessionCanManageOAuthCredentials ?? false,
      };
      state.oauthStates.push(item);
      return clone(item);
    },
    consumeOAuthState(oauthState: string, input: {
      sessionKey: string;
      requireApiSession?: boolean;
      requireCredentialManagementPermission?: boolean;
    }) {
      pruneExpiredStates(state);
      const index = state.oauthStates.findIndex(
        (item) => item.state === oauthState && item.sessionKey === input.sessionKey,
      );
      if (index < 0) {
        return false;
      }
      if (input.requireApiSession && !state.oauthStates[index].apiSessionAccountId) {
        return false;
      }
      if (
        input.requireCredentialManagementPermission &&
        !state.oauthStates[index].apiSessionCanManageOAuthCredentials
      ) {
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
