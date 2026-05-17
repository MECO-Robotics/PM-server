import type { OnshapeRuntimeStore } from "./cadStore";
import {
  createOnshapeApiClient,
} from "./onshapeApiClient";
import { createOnshapeCadClient } from "./onshapeCadClient";
import { refreshOnshapeOAuthToken, shouldRefreshOnshapeOAuthToken } from "./onshapeOAuth";
import type {
  CadImportOnshapeClient,
  OnshapeCredentials,
  OnshapeOAuthTokenSet,
} from "./onshapeTypes";

interface OnshapeClientConfig {
  baseUrl: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthRedirectUri?: string;
  oauthTokenUrl: string;
  oauthScopes: string[];
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthTokenExpiresAt?: string;
}

type CadClientFactory = (store: OnshapeRuntimeStore) => CadImportOnshapeClient;

let overrideFactory: CadClientFactory | null = null;

export function setOnshapeCadClientFactoryForTests(factory: CadClientFactory | null) {
  overrideFactory = factory;
}

function envTokenSet(config: OnshapeClientConfig): OnshapeOAuthTokenSet | null {
  if (!config.oauthAccessToken) {
    return null;
  }

  return {
    accessToken: config.oauthAccessToken,
    refreshToken: config.oauthRefreshToken ?? null,
    tokenType: "Bearer",
    scope: config.oauthScopes.join(" ") || null,
    expiresAt: config.oauthTokenExpiresAt ?? null,
    receivedAt: new Date().toISOString(),
  };
}

async function credentialsFromConfig(
  store: OnshapeRuntimeStore,
  config: OnshapeClientConfig,
): Promise<OnshapeCredentials> {
  let tokenSet = store.getOAuthTokenSet() ?? envTokenSet(config);
  const refreshToken = tokenSet?.refreshToken ?? config.oauthRefreshToken;
  if ((!tokenSet?.accessToken || shouldRefreshOnshapeOAuthToken(tokenSet)) && refreshToken) {
    tokenSet = await refreshOnshapeOAuthToken({
      config: {
        clientId: config.oauthClientId,
        clientSecret: config.oauthClientSecret,
        redirectUri: config.oauthRedirectUri,
        authorizationUrl: "",
        tokenUrl: config.oauthTokenUrl,
        scopes: config.oauthScopes,
      },
      refreshToken,
    });
    store.setOAuthTokenSet(tokenSet);
  }

  return {
    mode: "oauth",
    bearerToken: tokenSet?.accessToken,
  };
}

export async function createConfiguredOnshapeCadClient(
  store: OnshapeRuntimeStore,
  config: OnshapeClientConfig,
) {
  if (overrideFactory) {
    return overrideFactory(store);
  }

  return createOnshapeCadClient(
    createOnshapeApiClient({
      store,
      credentials: await credentialsFromConfig(store, config),
      baseUrl: config.baseUrl,
    }),
  );
}
