import { cadPersistenceConfig } from "../config/env";
import { getCadPrismaClient, disconnectCadPrismaClient } from "./cadPrismaClient";
import { createPrismaCadStore } from "./cadPrismaStore";
import { getCadRuntimeStore } from "./cadStore";
import type { CadStore } from "./cadStoreTypes";

let prismaStore: CadStore | null = null;

export function getCadStore(): CadStore {
  if (cadPersistenceConfig.storeDriver === "runtime") {
    return getCadRuntimeStore();
  }
  prismaStore ??= createPrismaCadStore(getCadPrismaClient());
  return prismaStore;
}

export async function disconnectCadStore() {
  if (cadPersistenceConfig.storeDriver === "prisma") {
    await disconnectCadPrismaClient();
    prismaStore = null;
  }
}
