import assert from "node:assert/strict";
import { test } from "node:test";

import { resetCadRuntimeStore } from "../src/cad/cadStore";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

function cadFixture(options?: { movedPart?: boolean; includeIntake?: boolean }) {
  return JSON.stringify({
    rootName: "Robot master assembly",
    units: "millimeter",
    assemblyNodes: [
      {
        sourceId: "asm-root",
        parentSourceId: null,
        name: "ASM - Robot",
        instancePath: "/Robot",
        depth: 0,
        inferredType: "ROOT",
        stableSignature: "asm:path:/Robot",
      },
      {
        sourceId: "asm-shooter",
        parentSourceId: "asm-root",
        name: "MECH - Shooter - Flywheel",
        instancePath: "/Robot/MECH - Shooter - Flywheel",
        depth: 1,
        inferredType: "MECHANISM_CANDIDATE",
        stableSignature: "asm:path:/Robot/MECH - Shooter - Flywheel",
      },
      ...(options?.includeIntake
        ? [
            {
              sourceId: "asm-intake",
              parentSourceId: "asm-root",
              name: "MECH - Intake",
              instancePath: "/Robot/MECH - Intake",
              depth: 1,
              inferredType: "MECHANISM_CANDIDATE",
              stableSignature: "asm:path:/Robot/MECH - Intake",
            },
          ]
        : []),
    ],
    partDefinitions: [
      {
        sourceId: "part-spacer",
        name: "PRT - Shooter - Flywheel - Spacer",
        partNumber: "SHR-001",
        material: null,
        stableSignature: "part:number:SHR-001",
      },
    ],
    partInstances: [
      {
        sourceId: "inst-spacer-1",
        partDefinitionSourceId: "part-spacer",
        parentAssemblySourceId: options?.movedPart ? "asm-intake" : "asm-shooter",
        instancePath: options?.movedPart
          ? "/Robot/MECH - Intake/Spacer-1"
          : "/Robot/MECH - Shooter - Flywheel/Spacer-1",
        quantity: 1,
        stableSignature: "inst:path:/Robot/Spacer-1",
      },
    ],
  });
}

async function uploadStep(app: Awaited<ReturnType<typeof import("../src/app").buildApp>>, label: string, fileText: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/cad/step-imports",
    payload: {
      fileName: `${label}.step`,
      fileText,
      label,
      projectId: "robot-2026",
      seasonId: "season-2026",
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as {
    importRun: { id: string; status: string; originalFilename: string };
    snapshot: { id: string; status: string; previousSnapshotId: string | null };
    summary: {
      assemblyCount: number;
      partDefinitionCount: number;
      partInstanceCount: number;
      warningCount: number;
    };
  };
}

test("STEP import creates a snapshot graph with mapping proposals and parser warnings", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(app, "robot-master", "ISO-10303-21; ENDSEC;");
    resetLimits();
    assert.equal(result.importRun.status, "MAPPING_REVIEW");
    assert.equal(result.importRun.originalFilename, "robot-master.step");
    assert.equal(result.snapshot.status, "mapping_review");
    assert.equal(result.summary.assemblyCount, 2);
    assert.equal(result.summary.partDefinitionCount, 1);
    assert.equal(result.summary.partInstanceCount, 1);

    const treeResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/tree`,
    });
    assert.equal(treeResponse.statusCode, 200);
    resetLimits();
    const tree = treeResponse.json() as { rootNodes: Array<{ name: string; children: unknown[] }> };
    assert.equal(tree.rootNodes[0]?.name, "ASM - Robot");
    assert.equal(tree.rootNodes[0]?.children.length, 1);

    const mappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings`,
    });
    assert.equal(mappingsResponse.statusCode, 200);
    resetLimits();
    const mappings = mappingsResponse.json() as { items: Array<{ targetKind: string; status: string }> };
    assert.ok(mappings.items.some((mapping) => mapping.targetKind === "UNMAPPED" && mapping.status === "NEEDS_REVIEW"));

    const warningsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/import-runs/${result.importRun.id}`,
    });
    assert.equal(warningsResponse.statusCode, 200);
    assert.ok(
      (warningsResponse.json() as { warnings: Array<{ code: string }> }).warnings.some(
        (warning) => warning.code === "step_parser_placeholder_used",
      ),
    );
  });
});

test("confirmed future mappings carry forward to the next STEP snapshot", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const first = await uploadStep(app, "iteration-1", cadFixture());
    resetLimits();
    const firstMappings = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${first.snapshot.id}/mappings`,
    });
    const shooterMapping = (firstMappings.json() as {
      items: Array<{ id: string; sourceKind: string; sourceId: string; sourceName: string }>;
    }).items.find((mapping) => mapping.sourceName.includes("Shooter"));
    assert.ok(shooterMapping);
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${first.snapshot.id}/mappings/apply`,
      payload: {
        updates: [
          {
            mappingId: shooterMapping.id,
            targetKind: "MECHANISM",
            targetId: "mechanism-shooter-flywheel",
            confidence: "MANUAL",
            status: "CONFIRMED",
            applyToFuture: true,
          },
        ],
      },
    });
    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    assert.equal((applyResponse.json() as { mappingRules: unknown[] }).mappingRules.length, 1);
    resetLimits();

    const second = await uploadStep(app, "iteration-2", cadFixture());
    assert.equal(second.snapshot.previousSnapshotId, first.snapshot.id);
    resetLimits();

    const secondMappings = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${second.snapshot.id}/mappings`,
    });
    const carried = (secondMappings.json() as {
      items: Array<{ sourceName: string; targetKind: string; targetId: string | null; mappingRuleId: string | null }>;
    }).items.find((mapping) => mapping.sourceName.includes("Shooter"));
    assert.equal(carried?.targetKind, "MECHANISM");
    assert.equal(carried?.targetId, "mechanism-shooter-flywheel");
    assert.ok(carried?.mappingRuleId);
  });
});

test("snapshot diff reports added assemblies, moved part instances, and unmapped candidates", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    await uploadStep(app, "iteration-1", cadFixture());
    resetLimits();
    const second = await uploadStep(app, "iteration-2", cadFixture({ includeIntake: true, movedPart: true }));
    resetLimits();

    const diffResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${second.snapshot.id}/diff`,
    });
    assert.equal(diffResponse.statusCode, 200);
    const diff = diffResponse.json() as {
      previousSnapshotId: string | null;
      addedAssemblies: Array<{ name: string }>;
      movedPartInstances: Array<{ sourceId: string; previousParentAssemblyName: string | null; currentParentAssemblyName: string | null }>;
      warnings: Array<{ code: string }>;
    };
    assert.ok(diff.previousSnapshotId);
    assert.ok(diff.addedAssemblies.some((item) => item.name === "MECH - Intake"));
    assert.deepEqual(diff.movedPartInstances[0], {
      sourceId: "inst-spacer-1",
      previousParentAssemblyName: "MECH - Shooter - Flywheel",
      currentParentAssemblyName: "MECH - Intake",
    });
    assert.ok(diff.warnings.some((warning) => warning.code === "step_unmapped_assembly"));
  });
});

test("finalize is blocked while required mappings need review", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(app, "iteration-1", cadFixture());
    resetLimits();
    const blocked = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${result.snapshot.id}/finalize`,
      payload: {},
    });
    assert.equal(blocked.statusCode, 409);
    resetLimits();

    const forced = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${result.snapshot.id}/finalize`,
      payload: { allowUnresolved: true, finalizedBy: "mentor@example.com" },
    });
    assert.equal(forced.statusCode, 200, forced.body);
    assert.equal((forced.json() as { item: { status: string; finalizedBy: string | null } }).item.status, "finalized");
    assert.equal((forced.json() as { item: { finalizedBy: string | null } }).item.finalizedBy, "mentor@example.com");
  });
});
