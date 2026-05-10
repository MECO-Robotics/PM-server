import assert from "node:assert/strict";
import { test } from "node:test";

import { resetCadRuntimeStore } from "../src/cad/cadStore";
import { createPlaceholderStepParserClient, createStepParserClient } from "../src/cad/stepParserClient";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

function stepEntityFixture(options?: {
  multipleTopLevel?: boolean;
  repeatedPart?: boolean;
  flat?: boolean;
  duplicateNames?: boolean;
}) {
  const products = [
    "#1=PRODUCT('MAIN ASSEMBLY','', '', (#900));",
    "#2=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#1,.NOT_KNOWN.);",
    "#3=PRODUCT_DEFINITION('design','',#2,#901);",
    "#4=PRODUCT('Shooter Assembly','', '', (#900));",
    "#5=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#4,.NOT_KNOWN.);",
    "#6=PRODUCT_DEFINITION('design','',#5,#901);",
    "#7=PRODUCT('Flywheel Assembly','', '', (#900));",
    "#8=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#7,.NOT_KNOWN.);",
    "#9=PRODUCT_DEFINITION('design','',#8,#901);",
    "#10=PRODUCT('Spacer','', '', (#900));",
    "#11=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#10,.NOT_KNOWN.);",
    "#12=PRODUCT_DEFINITION('design','',#11,#901);",
  ];

  if (options?.multipleTopLevel) {
    products.push(
      "#13=PRODUCT('Drivetrain Assembly <1>','', '', (#900));",
      "#14=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#13,.NOT_KNOWN.);",
      "#15=PRODUCT_DEFINITION('design','',#14,#901);",
      "#16=PRODUCT('Conveyer Assembly <1>','', '', (#900));",
      "#17=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#16,.NOT_KNOWN.);",
      "#18=PRODUCT_DEFINITION('design','',#17,#901);",
      "#22=PRODUCT('Wheel','', '', (#900));",
      "#23=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#22,.NOT_KNOWN.);",
      "#24=PRODUCT_DEFINITION('design','',#23,#901);",
      "#25=PRODUCT('Belt','', '', (#900));",
      "#26=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#25,.NOT_KNOWN.);",
      "#27=PRODUCT_DEFINITION('design','',#26,#901);",
    );
  }

  if (options?.duplicateNames) {
    products.push(
      "#19=PRODUCT('Spacer','', '', (#900));",
      "#20=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',#19,.NOT_KNOWN.);",
      "#21=PRODUCT_DEFINITION('design','',#20,#901);",
    );
  }

  const edges = options?.flat
    ? []
    : [
        "#100=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO1','Shooter Assembly <1>','',#3,#6,$);",
        "#101=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO2','Flywheel Assembly <1>','',#6,#9,$);",
        "#102=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO3','Spacer <1>','',#9,#12,$);",
        ...(options?.repeatedPart
          ? ["#103=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO4','Spacer <2>','',#9,#12,$);"]
          : []),
        ...(options?.multipleTopLevel
          ? [
              "#104=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO5','Drivetrain Assembly <1>','',#3,#15,$);",
              "#105=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO6','Conveyer Assembly <1>','',#3,#18,$);",
              "#107=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO8','Wheel <1>','',#15,#24,$);",
              "#108=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO9','Belt <1>','',#18,#27,$);",
            ]
          : []),
        ...(options?.duplicateNames
          ? ["#106=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO7','Spacer duplicate','',#9,#21,$);"]
          : []),
      ];

  return ["ISO-10303-21;", "DATA;", ...products, ...edges, "ENDSEC;", "END-ISO-10303-21;"].join("\n");
}

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

function multipartStepPayload(input: {
  boundary: string;
  fileName: string;
  label: string;
  fileBuffer: Buffer;
}) {
  const chunks: Buffer[] = [];
  const append = (value: string) => chunks.push(Buffer.from(value, "utf8"));

  append(`--${input.boundary}\r\n`);
  append(`Content-Disposition: form-data; name="label"\r\n\r\n`);
  append(`${input.label}\r\n`);
  append(`--${input.boundary}\r\n`);
  append(`Content-Disposition: form-data; name="projectId"\r\n\r\n`);
  append("robot-2026\r\n");
  append(`--${input.boundary}\r\n`);
  append(`Content-Disposition: form-data; name="seasonId"\r\n\r\n`);
  append("season-2026\r\n");
  append(`--${input.boundary}\r\n`);
  append(`Content-Disposition: form-data; name="file"; filename="${input.fileName}"\r\n`);
  append("Content-Type: model/step\r\n\r\n");
  chunks.push(input.fileBuffer);
  append(`\r\n--${input.boundary}--\r\n`);

  return Buffer.concat(chunks);
}

test("STEP text parser extracts an Onshape-style assembly graph", async () => {
  const parsed = await createStepParserClient().parseStepFile({
    fileText: stepEntityFixture(),
    originalFilename: "robot.step",
    importRunId: "import-test",
  });

  assert.match(parsed.parserVersion, /^step-text-assembly-parser-/);
  assert.equal(parsed.rootName, "MAIN ASSEMBLY");
  assert.deepEqual(
    parsed.assemblyNodes.map((node) => [node.name, node.inferredType, node.depth]),
    [
      ["MAIN ASSEMBLY", "ROOT", 0],
      ["Shooter Assembly <1>", "SUBSYSTEM_CANDIDATE", 1],
      ["Flywheel Assembly <1>", "MECHANISM_CANDIDATE", 2],
    ],
  );
  assert.equal(parsed.partDefinitions.length, 1);
  assert.equal(parsed.partDefinitions[0]?.name, "Spacer");
  assert.equal(parsed.partInstances.length, 1);
  assert.equal(parsed.partInstances[0]?.parentAssemblySourceId, "step-asm-occ:#101");
});

test("STEP text parser preserves multiple subsystem candidates and repeated part instances", async () => {
  const parsed = await createStepParserClient().parseStepFile({
    fileText: stepEntityFixture({ multipleTopLevel: true, repeatedPart: true }),
    originalFilename: "robot.step",
    importRunId: "import-test",
  });

  const subsystemNames = parsed.assemblyNodes
    .filter((node) => node.inferredType === "SUBSYSTEM_CANDIDATE")
    .map((node) => node.name)
    .sort();
  assert.deepEqual(subsystemNames, [
    "Conveyer Assembly <1>",
    "Drivetrain Assembly <1>",
    "Shooter Assembly <1>",
  ]);
  assert.equal(parsed.partDefinitions.length, 3);
  assert.equal(parsed.partInstances.length, 4);
  assert.notEqual(parsed.partInstances[0]?.sourceId, parsed.partInstances[1]?.sourceId);
});

test("STEP text parser warns on flattened or duplicate-name STEP text", async () => {
  const flat = await createStepParserClient().parseStepFile({
    fileText: stepEntityFixture({ flat: true }),
    originalFilename: "flat.step",
    importRunId: "import-test",
  });
  assert.ok(flat.warnings.some((warning) => warning.code === "step_hierarchy_missing"));
  assert.ok(flat.warnings.some((warning) => warning.code === "step_flattened_file"));

  const duplicateNames = await createStepParserClient().parseStepFile({
    fileText: stepEntityFixture({ duplicateNames: true }),
    originalFilename: "duplicate.step",
    importRunId: "import-test",
  });
  assert.ok(duplicateNames.warnings.some((warning) => warning.code === "step_duplicate_part_name"));
});

test("non-JSON STEP text does not use the hardcoded placeholder unless requested", async () => {
  const parsed = await createStepParserClient().parseStepFile({
    fileText: "ISO-10303-21;\nDATA;\n#1=PRODUCT('MAIN ASSEMBLY','', '', (#900));\nENDSEC;",
    originalFilename: "robot.step",
    importRunId: "import-test",
  });
  const names = [...parsed.assemblyNodes.map((node) => node.name), ...parsed.partDefinitions.map((part) => part.name)];
  assert.ok(!names.includes("ASM - Robot"));
  assert.ok(!names.includes("MECH - Shooter - Flywheel"));
  assert.ok(!names.includes("PRT - Shooter - Flywheel - Spacer"));

  const placeholder = await createPlaceholderStepParserClient().parseStepFile({
    fileText: "ISO-10303-21;",
    originalFilename: "placeholder.step",
    importRunId: "import-test",
  });
  assert.equal(placeholder.assemblyNodes[0]?.name, "ASM - Robot");
  assert.ok(placeholder.warnings.some((warning) => warning.code === "step_parser_placeholder_used"));
});

test("STEP import creates a snapshot graph with mapping proposals and parser warnings", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(app, "robot-master", stepEntityFixture({ multipleTopLevel: true }));
    resetLimits();
    assert.equal(result.importRun.status, "MAPPING_REVIEW");
    assert.equal(result.importRun.originalFilename, "robot-master.step");
    assert.equal(result.snapshot.status, "mapping_review");
    assert.equal(result.summary.assemblyCount, 5);
    assert.equal(result.summary.partDefinitionCount, 3);
    assert.equal(result.summary.partInstanceCount, 3);

    const treeResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/tree`,
    });
    assert.equal(treeResponse.statusCode, 200);
    resetLimits();
    const tree = treeResponse.json() as { rootNodes: Array<{ name: string; children: unknown[] }> };
    assert.equal(tree.rootNodes[0]?.name, "MAIN ASSEMBLY");
    assert.equal(tree.rootNodes[0]?.children.length, 3);

    const mappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings`,
    });
    assert.equal(mappingsResponse.statusCode, 200);
    resetLimits();
    const mappings = mappingsResponse.json() as { items: Array<{ sourceName: string; targetKind: string; status: string }> };
    assert.ok(mappings.items.some((mapping) => mapping.targetKind === "UNMAPPED" && mapping.status === "NEEDS_REVIEW"));
    assert.equal(mappings.items.find((mapping) => mapping.sourceName === "Shooter Assembly <1>")?.targetKind, "SUBSYSTEM");
    assert.equal(mappings.items.find((mapping) => mapping.sourceName === "Flywheel Assembly <1>")?.targetKind, "MECHANISM");
    assert.equal(mappings.items.find((mapping) => mapping.sourceName === "Spacer")?.targetKind, "PART_DEFINITION");

    const warningsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/import-runs/${result.importRun.id}`,
    });
    assert.equal(warningsResponse.statusCode, 200);
    assert.ok(
      (warningsResponse.json() as { warnings: Array<{ code: string }> }).warnings.some(
        (warning) => warning.code === "step_unknown_units",
      ),
    );
  });
});

test("multipart STEP uploads accept files larger than the old 25 MiB cap", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const boundary = "meco-step-upload-boundary";
    const body = multipartStepPayload({
      boundary,
      fileName: "large-master.step",
      label: "large-master",
      fileBuffer: Buffer.alloc((25 * 1024 * 1024) + 1024, " "),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/cad/step-imports",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      payload: body,
    });

    assert.equal(response.statusCode, 201, response.body);
    resetLimits();
    assert.equal(response.json().importRun.originalFilename, "large-master.step");
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
