import type { OnshapeRuntimeStore } from "./cadStore";
import {
  createOnshapeApiClient,
} from "./onshapeApiClient";
import { createOnshapeCadClient } from "./onshapeCadClient";
import type {
  CadImportOnshapeClient,
  OnshapeCredentials,
} from "./onshapeTypes";

interface OnshapeClientConfig {
  baseUrl: string;
  accessKey?: string;
  secretKey?: string;
  bearerToken?: string;
}

type CadClientFactory = (store: OnshapeRuntimeStore) => CadImportOnshapeClient;

let overrideFactory: CadClientFactory | null = null;

export function setOnshapeCadClientFactoryForTests(factory: CadClientFactory | null) {
  overrideFactory = factory;
}

function credentialsFromConfig(config: OnshapeClientConfig): OnshapeCredentials {
  if (config.bearerToken) {
    return {
      mode: "oauth",
      bearerToken: config.bearerToken,
    };
  }

  return {
    mode: "api_key",
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  };
}

export function createConfiguredOnshapeCadClient(
  store: OnshapeRuntimeStore,
  config: OnshapeClientConfig,
) {
  if (overrideFactory) {
    return overrideFactory(store);
  }

  return createOnshapeCadClient(
    createOnshapeApiClient({
      store,
      credentials: credentialsFromConfig(config),
      baseUrl: config.baseUrl,
    }),
  );
}
