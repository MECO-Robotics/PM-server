import { cadPersistenceConfig } from "../config/env";
import { getCadPrismaClient, disconnectCadPrismaClient } from "./cadPrismaClient";
import { createPrismaCadStore } from "./cadPrismaStore";
import { getCadRuntimeStore } from "./cadStore";
import type { CadStore } from "./cadStoreTypes";

let prismaStore: CadStore | null = null;
let runtimeFallbackStore: CadStore | null = null;
let prismaStoreHasSucceeded = false;
let runtimeFallbackActive = false;
let prismaReadinessPromise: Promise<CadStore> | null = null;

function isPrismaUnavailableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && (error as { code?: unknown }).code === "P1001") ||
      ("message" in error &&
        typeof (error as { message?: unknown }).message === "string" &&
        (error as { message: string }).message.includes("Can't reach database server")))
  );
}

function canFallbackToRuntime(error: unknown) {
  return (
    cadPersistenceConfig.storeDriver === "prisma" &&
    process.env.NODE_ENV !== "production" &&
    process.env.CAD_STORE_DRIVER === undefined &&
    !prismaStoreHasSucceeded &&
    isPrismaUnavailableError(error)
  );
}

function getRuntimeFallbackStore() {
  runtimeFallbackStore ??= getCadRuntimeStore();
  return runtimeFallbackStore;
}

function activateRuntimeFallback(error: unknown) {
  runtimeFallbackActive = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[cad] Prisma CAD store is unavailable; using runtime CAD store for this local process. ${message}`,
  );
  void disconnectCadPrismaClient().catch(() => undefined);
  return getRuntimeFallbackStore();
}

async function resolveStoreForCall(prismaBackedStore: CadStore) {
  if (runtimeFallbackActive) {
    return getRuntimeFallbackStore();
  }

  if (prismaStoreHasSucceeded) {
    return prismaBackedStore;
  }

  prismaReadinessPromise ??= getCadPrismaClient()
    .$connect()
    .then(() => {
      prismaStoreHasSucceeded = true;
      return prismaBackedStore;
    })
    .catch((error) => {
      prismaReadinessPromise = null;
      if (canFallbackToRuntime(error)) {
        return activateRuntimeFallback(error);
      }
      throw error;
    });

  return prismaReadinessPromise;
}

function withRuntimeFallback(store: CadStore): CadStore {
  return new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      return async (...args: unknown[]) => {
        const activeStore = await resolveStoreForCall(target);
        const activeValue = Reflect.get(activeStore, property, activeStore);
        if (typeof activeValue !== "function") {
          return activeValue;
        }
        return activeValue.apply(activeStore, args);
      };
    },
  });
}

export function getCadStore(): CadStore {
  if (cadPersistenceConfig.storeDriver === "runtime") {
    return getCadRuntimeStore();
  }
  prismaStore ??= withRuntimeFallback(createPrismaCadStore(getCadPrismaClient()));
  return prismaStore;
}

export async function disconnectCadStore() {
  if (cadPersistenceConfig.storeDriver === "prisma") {
    await disconnectCadPrismaClient();
    prismaStore = null;
    runtimeFallbackStore = null;
    prismaStoreHasSucceeded = false;
    runtimeFallbackActive = false;
    prismaReadinessPromise = null;
  }
}
