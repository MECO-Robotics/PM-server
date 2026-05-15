import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

function saveEnv(keys: string[]) {
  return new Map(keys.map((key) => [key, process.env[key]] as const));
}

function restoreEnv(saved: Map<string, string | undefined>) {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearCadStoreModules() {
  for (const modulePath of [
    "../src/config/env.ts",
    "../src/cad/cadPrismaClient.ts",
    "../src/cad/cadStore.ts",
    "../src/cad/cadStoreFactory.ts",
  ]) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function createImportRunInput(originalFilename: string) {
  return {
    projectId: "project-robot-2026",
    seasonId: "default-season",
    source: "STEP_UPLOAD" as const,
    status: "PARSED" as const,
    originalFilename,
    uploadedFileId: null,
    uploadedFileHash: null,
    parserVersion: "test",
    parseStartedAt: null,
    parseCompletedAt: null,
    requestedBy: null,
    errorMessage: null,
    rawSummaryJson: {},
  };
}

test("development CAD store falls back to runtime when local Prisma is unavailable", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CAD_STORE_DRIVER",
  ]);
  const originalWarn = console.warn;

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:1/meco_platform?schema=public&connect_timeout=1";
    delete process.env.CAD_STORE_DRIVER;
    clearCadStoreModules();
    const warnings: string[] = [];
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    const { getCadStore, disconnectCadStore } = require("../src/cad/cadStoreFactory.ts") as typeof import("../src/cad/cadStoreFactory");
    const store = getCadStore();
    const [firstImportRun, secondImportRun] = await Promise.all([
      store.createImportRun(createImportRunInput("local-fallback-1.step")),
      store.createImportRun(createImportRunInput("local-fallback-2.step")),
    ]);

    assert.equal(firstImportRun.id, "cad-import-0001");
    assert.equal(secondImportRun.id, "cad-import-0002");
    assert.equal(warnings.filter((message) => message.includes("using runtime CAD store")).length, 1);
    await disconnectCadStore();
  } finally {
    console.warn = originalWarn;
    restoreEnv(saved);
    clearCadStoreModules();
  }
});

test("explicit Prisma CAD store setting does not fallback to runtime", async () => {
  const saved = saveEnv([
    "NODE_ENV",
    "DATABASE_URL",
    "CAD_STORE_DRIVER",
  ]);
  const originalWarn = console.warn;

  try {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:1/meco_platform?schema=public&connect_timeout=1";
    process.env.CAD_STORE_DRIVER = "prisma";
    clearCadStoreModules();
    const warnings: string[] = [];
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    const { getCadStore, disconnectCadStore } = require("../src/cad/cadStoreFactory.ts") as typeof import("../src/cad/cadStoreFactory");
    const store = getCadStore();
    await assert.rejects(
      async () => store.createImportRun(createImportRunInput("explicit-prisma.step")),
      /Can't reach database server|Can't reach database at|P1001/,
    );

    assert.equal(warnings.filter((message) => message.includes("using runtime CAD store")).length, 0);
    await disconnectCadStore();
  } finally {
    console.warn = originalWarn;
    restoreEnv(saved);
    clearCadStoreModules();
  }
});
