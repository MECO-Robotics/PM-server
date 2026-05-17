import assert from "node:assert/strict";
import { test } from "node:test";

import { getCadRuntimeStore, resetCadRuntimeStore } from "../src/cad/cadStore";
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

function uploadedClassStepFixture() {
  const products = [
    ["#1", "MAIN ASSEMBLY"],
    ["#4", "Intake Cheese"],
    ["#7", "Hopper Assembly <1>"],
    ["#10", "Drivetrain Assembly <1>"],
    ["#13", "Conveyer Assembly <1>"],
    ["#16", "Detailed Assembly <1>"],
    ["#19", "Shooter Main Assembly <1>"],
    ["#22", "Intake Roller"],
    ["#25", "Hopper Plate"],
    ["#28", "Drive Rail"],
    ["#31", "Conveyer Belt"],
    ["#34", "Detail Bracket"],
    ["#37", "Shooter Flywheel Assembly <1>"],
    ["#40", "Part 2"],
  ];
  const definitions = products.flatMap(([productId, name], index) => {
    const formationId = Number(productId.slice(1)) + 1;
    const definitionId = Number(productId.slice(1)) + 2;
    return [
      `${productId}=PRODUCT('${name}','', '', (#900));`,
      `#${formationId}=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('1','',${productId},.NOT_KNOWN.);`,
      `#${definitionId}=PRODUCT_DEFINITION('design','',#${formationId},#901);`,
    ];
  });
  const edges = [
    "#100=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO1','Intake Cheese','',#3,#6,$);",
    "#101=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO2','Hopper Assembly <1>','',#3,#9,$);",
    "#102=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO3','Drivetrain Assembly <1>','',#3,#12,$);",
    "#103=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO4','Conveyer Assembly <1>','',#3,#15,$);",
    "#104=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO5','Detailed Assembly <1>','',#3,#18,$);",
    "#105=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO6','Shooter Main Assembly <1>','',#3,#21,$);",
    "#106=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO7','Intake Roller <1>','',#6,#24,$);",
    "#107=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO8','Hopper Plate <1>','',#9,#27,$);",
    "#108=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO9','Drive Rail <1>','',#12,#30,$);",
    "#109=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO10','Conveyer Belt <1>','',#15,#33,$);",
    "#110=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO11','Detail Bracket <1>','',#18,#36,$);",
    "#111=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO12','Shooter Flywheel Assembly <1>','',#21,#39,$);",
    "#112=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO13','Part 2 <1>','',#39,#42,$);",
    "#113=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO14','Part 2 <2>','',#39,#42,$);",
  ];
  return ["ISO-10303-21;", "DATA;", ...definitions, ...edges, "ENDSEC;", "END-ISO-10303-21;"].join("\n");
}

function cadFixture(options?: { movedPart?: boolean; includeIntake?: boolean; renumberSourceIds?: boolean }) {
  const rootSourceId = options?.renumberSourceIds ? "asm-root-reexport" : "asm-root";
  const shooterSourceId = options?.renumberSourceIds ? "asm-shooter-reexport" : "asm-shooter";
  const intakeSourceId = options?.renumberSourceIds ? "asm-intake-reexport" : "asm-intake";

  return JSON.stringify({
    rootName: "Robot master assembly",
    units: "millimeter",
    assemblyNodes: [
      {
        sourceId: rootSourceId,
        parentSourceId: null,
        name: "ASM - Robot",
        instancePath: "/Robot",
        depth: 0,
        inferredType: "ROOT",
        stableSignature: "asm:path:/Robot",
      },
      {
        sourceId: shooterSourceId,
        parentSourceId: rootSourceId,
        name: "MECH - Shooter - Flywheel",
        instancePath: "/Robot/MECH - Shooter - Flywheel",
        depth: 1,
        inferredType: "MECHANISM_CANDIDATE",
        stableSignature: "asm:path:/Robot/MECH - Shooter - Flywheel",
      },
      ...(options?.includeIntake
        ? [
            {
              sourceId: intakeSourceId,
              parentSourceId: rootSourceId,
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
        parentAssemblySourceId: options?.movedPart ? intakeSourceId : shooterSourceId,
        instancePath: options?.movedPart
          ? "/Robot/MECH - Intake/Spacer-1"
          : "/Robot/MECH - Shooter - Flywheel/Spacer-1",
        quantity: 1,
        stableSignature: "inst:path:/Robot/Spacer-1",
      },
    ],
  });
}

function repeatedPartCadFixture(options?: {
  spacerCount?: number;
  includeSingletonPart?: boolean;
  splitBetweenMechanisms?: boolean;
  labelPrefix?: string;
}) {
  const spacerCount = options?.spacerCount ?? 4;
  const partInstances = Array.from({ length: spacerCount }, (_, index) => {
    const instanceNumber = index + 1;
    const parentAssemblySourceId = options?.splitBetweenMechanisms && index >= Math.ceil(spacerCount / 2)
      ? "asm-intake"
      : "asm-shooter";
    const parentPath = parentAssemblySourceId === "asm-intake" ? "MECH - Intake" : "MECH - Shooter - Flywheel";
    return {
      sourceId: `inst-spacer-${instanceNumber}`,
      partDefinitionSourceId: "part-spacer",
      parentAssemblySourceId,
      instancePath: `/Robot/${parentPath}/Spacer <${instanceNumber}>`,
      quantity: 1,
      stableSignature: `inst:path:/Robot/${parentPath}/Spacer <${instanceNumber}>`,
    };
  });

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
      ...(options?.splitBetweenMechanisms
        ? [{
            sourceId: "asm-intake",
            parentSourceId: "asm-root",
            name: "MECH - Intake",
            instancePath: "/Robot/MECH - Intake",
            depth: 1,
            inferredType: "MECHANISM_CANDIDATE",
            stableSignature: "asm:path:/Robot/MECH - Intake",
          }]
        : []),
    ],
    partDefinitions: [
      {
        sourceId: "part-spacer",
        name: `${options?.labelPrefix ?? "PRT"} - Shooter - Flywheel - Spacer`,
        partNumber: "SHR-001",
        material: "aluminum",
        stableSignature: "part:number:SHR-001",
        metadata: { configuration: "default" },
      },
      ...(options?.includeSingletonPart
        ? [{
            sourceId: "part-plate",
            name: "PRT - Shooter - Mounting Plate",
            partNumber: "SHR-002",
            material: "aluminum",
            stableSignature: "part:number:SHR-002",
            metadata: { configuration: "default" },
          }]
        : []),
    ],
    partInstances: [
      ...partInstances,
      ...(options?.includeSingletonPart
        ? [{
            sourceId: "inst-plate-1",
            partDefinitionSourceId: "part-plate",
            parentAssemblySourceId: "asm-shooter",
            instancePath: "/Robot/MECH - Shooter - Flywheel/Mounting Plate <1>",
            quantity: 1,
            stableSignature: "inst:path:/Robot/MECH - Shooter - Flywheel/Mounting Plate <1>",
          }]
        : []),
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
    importRun: { id: string; status: string; originalFilename: string; rawSummaryJson: Record<string, unknown> };
    snapshot: { id: string; status: string; previousSnapshotId: string | null };
    summary: {
      assemblyCount: number;
      partDefinitionCount: number;
      partInstanceCount: number;
      warningCount: number;
      mappingCount: number;
      configuredParserMode?: string;
      actualParserVersion?: string;
      parserUsedPlaceholder?: boolean;
      entityCount?: number;
      productCount?: number;
      productDefinitionFormationCount?: number;
      productDefinitionCount?: number;
      nextAssemblyUsageOccurrenceCount?: number;
      rootNames?: string[];
      topLevelAssemblyNames?: string[];
      firstTenAssemblyNames?: string[];
      rawStats?: {
        entityCount?: number;
        productCount?: number;
        productDefinitionFormationCount?: number;
        productDefinitionCount?: number;
        nextAssemblyUsageOccurrenceCount?: number;
        assemblyUsageCount?: number;
        rootCount?: number;
        rootNames?: string[];
        topLevelAssemblyNames?: string[];
        parserMode?: string;
      };
    };
  };
}

function allParsedNames(parsed: {
  assemblyNodes: Array<{ name: string }>;
  partDefinitions: Array<{ name: string }>;
}) {
  return [...parsed.assemblyNodes.map((node) => node.name), ...parsed.partDefinitions.map((part) => part.name)];
}

function assertNoPlaceholderNames(names: string[], inputText = "") {
  for (const placeholderName of ["ASM - Robot", "MECH - Shooter - Flywheel", "PRT - Shooter - Flywheel - Spacer"]) {
    if (!inputText.includes(placeholderName)) {
      assert.ok(!names.includes(placeholderName), `${placeholderName} must not appear unless uploaded input contains it`);
    }
  }
}

function multipartStepPayload(input: {
  boundary: string;
  fileName: string;
  label: string;
  fileBuffer: Buffer;
  fileFirst?: boolean;
  projectId?: string;
  seasonId?: string;
  requestedBy?: string;
}) {
  const chunks: Buffer[] = [];
  const append = (value: string) => chunks.push(Buffer.from(value, "utf8"));

  const appendField = (name: string, value: string) => {
    append(`--${input.boundary}\r\n`);
    append(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    append(`${value}\r\n`);
  };
  const appendFields = () => {
    appendField("label", input.label);
    appendField("projectId", input.projectId ?? "robot-2026");
    appendField("seasonId", input.seasonId ?? "season-2026");
    if (input.requestedBy !== undefined) {
      appendField("requestedBy", input.requestedBy);
    }
  };
  const appendFile = () => {
    append(`--${input.boundary}\r\n`);
    append(`Content-Disposition: form-data; name="file"; filename="${input.fileName}"\r\n`);
    append("Content-Type: model/step\r\n\r\n");
    chunks.push(input.fileBuffer);
    append("\r\n");
  };

  if (input.fileFirst) {
    appendFile();
    appendFields();
  } else {
    appendFields();
    appendFile();
  }
  append(`--${input.boundary}--\r\n`);

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

test("STEP text parser extracts uploaded Onshape-style top-level assemblies and diagnostics", async () => {
  const fileText = uploadedClassStepFixture();
  const parsed = await createStepParserClient({ mode: "step_text" }).parseStepFile({
    fileText,
    originalFilename: "onshape-export.step",
    importRunId: "import-test",
  });

  assert.equal(parsed.parserVersion, "step-text-assembly-parser-1");
  assert.equal(parsed.rootName, "MAIN ASSEMBLY");
  assert.ok(parsed.assemblyNodes.length > 6);
  assert.ok(parsed.partInstances.length > 1);
  assert.equal(parsed.rawStats.productCount, 14);
  assert.equal(parsed.rawStats.productDefinitionCount, 14);
  assert.equal(parsed.rawStats.assemblyUsageCount, 14);
  assert.equal(parsed.rawStats.rootCount, 1);
  assert.deepEqual(parsed.rawStats.rootNames, ["MAIN ASSEMBLY"]);
  assert.deepEqual(parsed.rawStats.topLevelAssemblyNames, [
    "Intake Cheese",
    "Hopper Assembly <1>",
    "Drivetrain Assembly <1>",
    "Conveyer Assembly <1>",
    "Detailed Assembly <1>",
    "Shooter Main Assembly <1>",
  ]);
  assert.ok(!parsed.warnings.some((warning) => warning.code === "step_parser_placeholder_used"));
  assertNoPlaceholderNames(allParsedNames(parsed), fileText);
});

test("STEP text parser warns on flattened or duplicate-name STEP text", async () => {
  const flat = await createStepParserClient().parseStepFile({
    fileText: stepEntityFixture({ flat: true }),
    originalFilename: "flat.step",
    importRunId: "import-test",
  });
  assert.ok(flat.warnings.some((warning) => warning.code === "step_hierarchy_missing"));
  assert.ok(flat.warnings.some((warning) => warning.code === "step_flattened_file"));
  assert.deepEqual(flat.rawStats.rootNames, ["MAIN ASSEMBLY"]);

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
  assertNoPlaceholderNames(allParsedNames(parsed));

  const placeholder = await createPlaceholderStepParserClient().parseStepFile({
    fileText: "ISO-10303-21;",
    originalFilename: "placeholder.step",
    importRunId: "import-test",
  });
  assert.equal(placeholder.rootName, "PLACEHOLDER PARSER RESULT - NOT REAL CAD");
  assert.equal(placeholder.assemblyNodes[0]?.name, "PLACEHOLDER - DO NOT MAP");
  assert.ok(
    placeholder.warnings.some((warning) => warning.code === "step_parser_placeholder_used" && warning.severity === "ERROR"),
  );
});

test("non-placeholder parser modes never emit placeholder names for STEP text", async () => {
  for (const mode of ["auto", "step_text"] as const) {
    const fileText = uploadedClassStepFixture();
    const parsed = await createStepParserClient({ mode }).parseStepFile({
      fileText,
      originalFilename: `${mode}.step`,
      importRunId: "import-test",
    });
    assertNoPlaceholderNames(allParsedNames(parsed), fileText);
  }
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
    assert.equal(result.summary.configuredParserMode, "auto");
    assert.equal(result.summary.actualParserVersion, "step-text-assembly-parser-1");
    assert.equal(result.summary.parserUsedPlaceholder, false);

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

test("STEP tree groups repeated part instances by default and preserves raw opt-out", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(
      app,
      "grouped-spacers",
      repeatedPartCadFixture({ spacerCount: 4, includeSingletonPart: true }),
    );
    resetLimits();

    const groupedResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/tree`,
    });
    assert.equal(groupedResponse.statusCode, 200, groupedResponse.body);
    const grouped = groupedResponse.json() as {
      rootNodes: Array<{
        children: Array<{
          name: string;
          partInstances: Array<{
            kind: string;
            id?: string;
            displayName: string;
            partDefinition?: { name: string } | null;
            quantity: number;
            instanceIds: string[];
            hasMixedMappings: boolean;
          }>;
        }>;
      }>;
    };
    const shooter = grouped.rootNodes[0]?.children.find((node) => node.name === "MECH - Shooter - Flywheel");
    assert.equal(shooter?.partInstances.length, 2);
    const spacerGroup = shooter?.partInstances.find((instance) => instance.kind === "part_instance_group");
    assert.equal(spacerGroup?.displayName, "PRT - Shooter - Flywheel - Spacer");
    assert.equal(spacerGroup?.quantity, 4);
    assert.equal(spacerGroup?.instanceIds.length, 4);
    assert.equal(spacerGroup?.hasMixedMappings, false);
    const singletonPlate = shooter?.partInstances.find((instance) => instance.partDefinition?.name === "PRT - Shooter - Mounting Plate");
    assert.ok(singletonPlate?.id);
    assert.equal("kind" in singletonPlate, false);
    resetLimits();

    const rawResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/tree?groupInstances=false`,
    });
    assert.equal(rawResponse.statusCode, 200, rawResponse.body);
    const raw = rawResponse.json() as {
      rootNodes: Array<{ children: Array<{ partInstances: Array<{ id: string; instancePath: string }> }> }>;
    };
    assert.equal(raw.rootNodes[0]?.children[0]?.partInstances.length, 5);
    assert.ok(raw.rootNodes[0]?.children[0]?.partInstances.every((instance) => !("instanceIds" in instance)));
  });
});

test("grouped mapping review keeps singleton part instances as raw rows", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(
      app,
      "grouped-singleton-mapping",
      repeatedPartCadFixture({ spacerCount: 4, includeSingletonPart: true }),
    );
    resetLimits();

    const response = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings`,
    });
    assert.equal(response.statusCode, 200, response.body);
    const mappings = response.json() as {
      items: Array<{
        kind?: string;
        parentAssemblyName?: string | null;
        sourceKind: string;
        sourceName: string;
        quantity?: number;
        sourceIds?: string[];
      }>;
    };
    const spacerGroup = mappings.items.find(
      (mapping) => mapping.kind === "part_instance_group" && mapping.sourceName === "PRT - Shooter - Flywheel - Spacer",
    );
    assert.equal(spacerGroup?.quantity, 4);
    assert.equal(spacerGroup?.parentAssemblyName, "MECH - Shooter - Flywheel");
    assert.equal(spacerGroup?.sourceIds?.length, 4);

    const singletonPlate = mappings.items.find(
      (mapping) => mapping.sourceKind === "PART_INSTANCE" && mapping.sourceName === "Mounting Plate <1>",
    );
    assert.ok(singletonPlate);
    assert.equal(singletonPlate?.parentAssemblyName, "MECH - Shooter - Flywheel");
    assert.equal(singletonPlate?.kind, undefined);
    assert.equal(singletonPlate?.quantity, undefined);
    assert.equal(singletonPlate?.sourceIds, undefined);
  });
});

test("STEP tree keeps repeated part groups scoped to each parent assembly", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(
      app,
      "grouped-spacers-split",
      repeatedPartCadFixture({ spacerCount: 4, splitBetweenMechanisms: true }),
    );
    resetLimits();

    const response = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/tree`,
    });
    assert.equal(response.statusCode, 200, response.body);
    const tree = response.json() as {
      rootNodes: Array<{
        children: Array<{
          name: string;
          partInstances: Array<{ displayName: string; quantity: number; instanceIds: string[] }>;
        }>;
      }>;
    };
    const groups = tree.rootNodes[0]?.children.map((node) => ({
      parentName: node.name,
      group: node.partInstances[0],
    })) ?? [];
    assert.deepEqual(
      groups.map((item) => [item.parentName, item.group?.displayName, item.group?.quantity]).sort(),
      [
        ["MECH - Intake", "PRT - Shooter - Flywheel - Spacer", 2],
        ["MECH - Shooter - Flywheel", "PRT - Shooter - Flywheel - Spacer", 2],
      ],
    );
  });
});

test("grouped mapping rows expose mixed mappings for repeated instances", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(app, "mixed-spacers", repeatedPartCadFixture({ spacerCount: 4 }));
    resetLimits();
    const rawMappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings?groupInstances=false`,
    });
    assert.equal(rawMappingsResponse.statusCode, 200, rawMappingsResponse.body);
    const rawMappings = (rawMappingsResponse.json() as {
      items: Array<{ id: string; sourceKind: string; sourceName: string }>;
    }).items.filter((mapping) => mapping.sourceKind === "PART_INSTANCE" && mapping.sourceName.includes("Spacer"));
    assert.equal(rawMappings.length, 4);
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings/apply`,
      payload: {
        updates: [
          {
            mappingId: rawMappings[0]?.id,
            targetKind: "PART_INSTANCE",
            targetId: "mc-spacer-a",
            confidence: "MANUAL",
            status: "CONFIRMED",
          },
          {
            mappingId: rawMappings[1]?.id,
            targetKind: "PART_INSTANCE",
            targetId: "mc-spacer-b",
            confidence: "MANUAL",
            status: "CONFIRMED",
          },
        ],
      },
    });
    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    resetLimits();

    const groupedMappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings`,
    });
    assert.equal(groupedMappingsResponse.statusCode, 200, groupedMappingsResponse.body);
    const groupedMappings = groupedMappingsResponse.json() as {
      items: Array<{
        kind?: string;
        parentAssemblyName?: string | null;
        sourceKind: string;
        sourceName: string;
        quantity?: number;
        status: string;
        hasMixedMappings?: boolean;
        warning?: string;
        sourceIds?: string[];
      }>;
    };
    const spacerGroup = groupedMappings.items.find((mapping) => mapping.kind === "part_instance_group");
    assert.equal(spacerGroup?.sourceName, "PRT - Shooter - Flywheel - Spacer");
    assert.equal(spacerGroup?.parentAssemblyName, "MECH - Shooter - Flywheel");
    assert.equal(spacerGroup?.quantity, 4);
    assert.equal(spacerGroup?.hasMixedMappings, true);
    assert.equal(spacerGroup?.status, "NEEDS_REVIEW");
    assert.match(spacerGroup?.warning ?? "", /mixed mappings/i);
    assert.equal(spacerGroup?.sourceIds?.length, 4);
  });
});

test("mapping a grouped part row updates all instances and creates one future rule", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(app, "grouped-apply", repeatedPartCadFixture({ spacerCount: 4 }));
    resetLimits();
    const groupedMappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings`,
    });
    assert.equal(groupedMappingsResponse.statusCode, 200, groupedMappingsResponse.body);
    const spacerGroup = (groupedMappingsResponse.json() as {
      items: Array<{ kind?: string; sourceKind: string; sourceIds?: string[]; quantity?: number }>;
    }).items.find((mapping) => mapping.kind === "part_instance_group");
    assert.equal(spacerGroup?.sourceKind, "PART_INSTANCE");
    assert.equal(spacerGroup?.quantity, 4);
    assert.equal(spacerGroup?.sourceIds?.length, 4);
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings/apply`,
      payload: {
        updates: [
          {
            sourceKind: "PART_INSTANCE",
            sourceIds: spacerGroup?.sourceIds,
            targetKind: "PART_DEFINITION",
            targetId: "mc-spacer-definition",
            confidence: "MANUAL",
            status: "CONFIRMED",
            applyToFuture: true,
          },
        ],
      },
    });
    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    const applied = applyResponse.json() as {
      updated: Array<{ sourceId: string; targetKind: string; targetId: string | null; status: string }>;
      mappingRules: Array<{ sourceKind: string; matchValue: string; targetId: string | null }>;
    };
    assert.equal(applied.updated.length, 4);
    assert.ok(applied.updated.every((mapping) => mapping.targetKind === "PART_DEFINITION"));
    assert.ok(applied.updated.every((mapping) => mapping.targetId === "mc-spacer-definition"));
    assert.ok(applied.updated.every((mapping) => mapping.status === "CONFIRMED"));
    assert.equal(applied.mappingRules.length, 1);
    assert.equal(applied.mappingRules[0]?.sourceKind, "PART_INSTANCE");
    assert.equal(applied.mappingRules[0]?.matchValue, "part:number:SHR-001");
    resetLimits();

    const rawMappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings?groupInstances=false`,
    });
    assert.equal(rawMappingsResponse.statusCode, 200, rawMappingsResponse.body);
    const rawSpacerMappings = (rawMappingsResponse.json() as {
      items: Array<{ sourceKind: string; sourceName: string; targetId: string | null; status: string }>;
    }).items.filter((mapping) => mapping.sourceKind === "PART_INSTANCE" && mapping.sourceName.includes("Spacer"));
    assert.equal(rawSpacerMappings.length, 4);
    assert.ok(rawSpacerMappings.every((mapping) => mapping.targetId === "mc-spacer-definition"));
    assert.ok(rawSpacerMappings.every((mapping) => mapping.status === "CONFIRMED"));
  });
});

test("batch mapping part instances creates future rules per stable signature", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(
      app,
      "mixed-signature-batch-apply",
      repeatedPartCadFixture({ spacerCount: 2, includeSingletonPart: true }),
    );
    resetLimits();

    const rawMappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings?groupInstances=false`,
    });
    assert.equal(rawMappingsResponse.statusCode, 200, rawMappingsResponse.body);
    const partInstanceMappings = (rawMappingsResponse.json() as {
      items: Array<{ sourceKind: string; sourceId: string; sourceName: string }>;
    }).items.filter((mapping) => mapping.sourceKind === "PART_INSTANCE");
    assert.equal(partInstanceMappings.length, 3);
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings/apply`,
      payload: {
        updates: [
          {
            sourceKind: "PART_INSTANCE",
            sourceIds: partInstanceMappings.map((mapping) => mapping.sourceId),
            targetKind: "PART_DEFINITION",
            targetId: "mc-shooter-kit",
            confidence: "MANUAL",
            status: "CONFIRMED",
            applyToFuture: true,
          },
        ],
      },
    });
    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    const applied = applyResponse.json() as {
      updated: Array<{ sourceId: string; mappingRuleId: string | null }>;
      mappingRules: Array<{ id: string; sourceKind: string; matchValue: string; targetId: string | null }>;
    };
    assert.equal(applied.updated.length, 3);
    assert.equal(applied.mappingRules.length, 2);
    assert.deepEqual(
      applied.mappingRules.map((rule) => rule.matchValue).sort(),
      ["part:number:SHR-001", "part:number:SHR-002"],
    );

    const spacerRule = applied.mappingRules.find((rule) => rule.matchValue === "part:number:SHR-001");
    const plateRule = applied.mappingRules.find((rule) => rule.matchValue === "part:number:SHR-002");
    assert.ok(spacerRule);
    assert.ok(plateRule);
    const mappingBySourceId = new Map(applied.updated.map((mapping) => [mapping.sourceId, mapping]));
    for (const mapping of partInstanceMappings) {
      assert.equal(
        mappingBySourceId.get(mapping.sourceId)?.mappingRuleId,
        mapping.sourceName.includes("Mounting Plate") ? plateRule.id : spacerRule.id,
      );
    }
  });
});

test("mapping updates refresh snapshot and import-run lifecycle status", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(app, "review-status", cadFixture());
    assert.equal(result.snapshot.status, "mapping_review");
    assert.equal(result.importRun.status, "MAPPING_REVIEW");
    resetLimits();

    const rawMappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings?groupInstances=false`,
    });
    assert.equal(rawMappingsResponse.statusCode, 200, rawMappingsResponse.body);
    const rawMappings = (rawMappingsResponse.json() as { items: Array<{ id: string }> }).items;
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${result.snapshot.id}/mappings/apply`,
      payload: {
        updates: rawMappings.map((mapping) => ({
          mappingId: mapping.id,
          targetKind: "IGNORE",
          status: "CONFIRMED",
        })),
      },
    });
    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    const applyBody = applyResponse.json() as {
      lifecycle: {
        snapshot: { status: string };
        importRun: { status: string } | null;
      };
    };
    assert.equal(applyBody.lifecycle.snapshot.status, "mapped");
    assert.equal(applyBody.lifecycle.importRun?.status, "MAPPED");
    resetLimits();

    const snapshotResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}`,
    });
    assert.equal(snapshotResponse.statusCode, 200, snapshotResponse.body);
    assert.equal((snapshotResponse.json() as { item: { status: string } }).item.status, "mapped");
    resetLimits();

    const importRunResponse = await app.inject({
      method: "GET",
      url: `/api/cad/import-runs/${result.importRun.id}`,
    });
    assert.equal(importRunResponse.statusCode, 200, importRunResponse.body);
    assert.equal((importRunResponse.json() as { item: { status: string } }).item.status, "MAPPED");
  });
});

test("snapshot diff reports grouped repeated-instance quantity changes", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    await uploadStep(app, "quantity-iteration-1", repeatedPartCadFixture({ spacerCount: 3 }));
    resetLimits();
    const second = await uploadStep(app, "quantity-iteration-2", repeatedPartCadFixture({ spacerCount: 4 }));
    resetLimits();

    const diffResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${second.snapshot.id}/diff`,
    });
    assert.equal(diffResponse.statusCode, 200, diffResponse.body);
    const diff = diffResponse.json() as {
      quantityChangedPartGroups?: Array<{
        parentAssemblyName: string | null;
        partName: string;
        previousQuantity: number;
        currentQuantity: number;
        addedInstancePaths: string[];
        removedInstancePaths: string[];
      }>;
    };
    assert.deepEqual(diff.quantityChangedPartGroups, [
      {
        parentAssemblyName: "MECH - Shooter - Flywheel",
        partName: "PRT - Shooter - Flywheel - Spacer",
        previousQuantity: 3,
        currentQuantity: 4,
        addedInstancePaths: ["/Robot/MECH - Shooter - Flywheel/Spacer <4>"],
        removedInstancePaths: [],
      },
    ]);
  });
});

test("STEP import route honors explicit step_text mode and returns parser diagnostics", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const result = await uploadStep(app, "onshape-export", uploadedClassStepFixture());
    resetLimits();

    assert.equal(result.summary.configuredParserMode, "step_text");
    assert.equal(result.summary.actualParserVersion, "step-text-assembly-parser-1");
    assert.equal(result.summary.parserUsedPlaceholder, false);
    assert.equal(result.summary.productCount, 14);
    assert.equal(result.summary.productDefinitionCount, 14);
    assert.equal(result.summary.nextAssemblyUsageOccurrenceCount, 14);
    assert.deepEqual(result.summary.rootNames, ["MAIN ASSEMBLY"]);
    assert.deepEqual(result.summary.topLevelAssemblyNames, [
      "Intake Cheese",
      "Hopper Assembly <1>",
      "Drivetrain Assembly <1>",
      "Conveyer Assembly <1>",
      "Detailed Assembly <1>",
      "Shooter Main Assembly <1>",
    ]);
    assert.equal(result.summary.rawStats?.productCount, 14);
    assert.equal(result.summary.rawStats?.assemblyUsageCount, 14);
    assert.equal(result.summary.rawStats?.rootCount, 1);
    assert.equal(result.summary.rawStats?.parserMode, undefined);
    assert.deepEqual(result.summary.rawStats?.topLevelAssemblyNames, [
      "Intake Cheese",
      "Hopper Assembly <1>",
      "Drivetrain Assembly <1>",
      "Conveyer Assembly <1>",
      "Detailed Assembly <1>",
      "Shooter Main Assembly <1>",
    ]);

    const importRunResponse = await app.inject({
      method: "GET",
      url: `/api/cad/import-runs/${result.importRun.id}`,
    });
    assert.equal(importRunResponse.statusCode, 200);
    const importRun = importRunResponse.json() as { item: { rawSummaryJson: Record<string, unknown> } };
    assert.equal(importRun.item.rawSummaryJson.parserMode, "step_text");
    assert.equal(importRun.item.rawSummaryJson.parserVersion, "step-text-assembly-parser-1");
    assert.deepEqual(importRun.item.rawSummaryJson.rootNames, ["MAIN ASSEMBLY"]);
    assert.equal((importRun.item.rawSummaryJson.rawStats as Record<string, unknown>).parserMode, undefined);
    assert.equal((importRun.item.rawSummaryJson.rawStats as Record<string, unknown>).productCount, 14);
    resetLimits();

    const snapshotSummaryResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}`,
    });
    assert.equal(snapshotSummaryResponse.statusCode, 200);
    const snapshotSummary = snapshotSummaryResponse.json() as { summary: Record<string, unknown> };
    assert.equal(snapshotSummary.summary.configuredParserMode, "step_text");
    assert.equal(snapshotSummary.summary.actualParserVersion, "step-text-assembly-parser-1");
    assert.equal(snapshotSummary.summary.productCount, 14);
    assert.deepEqual(snapshotSummary.summary.rootNames, ["MAIN ASSEMBLY"]);
    assert.equal((snapshotSummary.summary.rawStats as Record<string, unknown>).parserMode, undefined);
    assert.equal((snapshotSummary.summary.rawStats as Record<string, unknown>).productCount, 14);
    await getCadRuntimeStore().updateImportRun(result.importRun.id, {
      rawSummaryJson: {
        ...importRun.item.rawSummaryJson,
        assemblyCount: 999,
        partDefinitionCount: 999,
        partInstanceCount: 999,
        mappingCount: 999,
        warningCount: 999,
      },
    });
    resetLimits();

    const liveSummaryResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${result.snapshot.id}`,
    });
    assert.equal(liveSummaryResponse.statusCode, 200);
    const liveSummary = liveSummaryResponse.json() as { summary: Record<string, unknown> };
    assert.equal(liveSummary.summary.assemblyCount, result.summary.assemblyCount);
    assert.equal(liveSummary.summary.partDefinitionCount, result.summary.partDefinitionCount);
    assert.equal(liveSummary.summary.partInstanceCount, result.summary.partInstanceCount);
    assert.equal(liveSummary.summary.mappingCount, result.summary.mappingCount);
    assert.equal(liveSummary.summary.warningCount, result.summary.warningCount);
  }, { env: { CAD_STEP_PARSER_MODE: "step_text" } });
});

test("STEP debug parse endpoint returns parser diagnostics without creating a snapshot", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const response = await app.inject({
      method: "POST",
      url: "/api/cad/step-imports/debug-parse",
      payload: {
        fileName: "onshape-export.step",
        fileText: uploadedClassStepFixture(),
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    resetLimits();
    const parsed = response.json() as {
      parserVersion: string;
      parserUsedPlaceholder: boolean;
      productCount: number;
      productDefinitionCount: number;
      nextAssemblyUsageOccurrenceCount: number;
      rootNames: string[];
      topLevelAssemblyNames: string[];
      assemblyCount: number;
      partInstanceCount: number;
      rawStats: Record<string, unknown>;
      warnings: Array<{ code: string }>;
    };
    assert.equal(parsed.parserVersion, "step-text-assembly-parser-1");
    assert.equal(parsed.parserUsedPlaceholder, false);
    assert.equal(parsed.productCount, 14);
    assert.equal(parsed.productDefinitionCount, 14);
    assert.equal(parsed.nextAssemblyUsageOccurrenceCount, 14);
    assert.deepEqual(parsed.rootNames, ["MAIN ASSEMBLY"]);
    assert.ok(parsed.topLevelAssemblyNames.includes("Shooter Main Assembly <1>"));
    assert.equal(parsed.rawStats.parserMode, undefined);
    assert.equal(parsed.rawStats.productCount, 14);
    assert.ok(parsed.assemblyCount > 6);
    assert.ok(parsed.partInstanceCount > 1);
    assert.ok(!parsed.warnings.some((warning) => warning.code === "step_parser_placeholder_used"));

    const snapshotsResponse = await app.inject({ method: "GET", url: "/api/cad/snapshots" });
    assert.equal(snapshotsResponse.statusCode, 200);
    assert.equal((snapshotsResponse.json() as { items: unknown[] }).items.length, 0);
  }, { env: { CAD_STEP_PARSER_MODE: "step_text" } });
});

test("CAD import run and snapshot list filters use their own status enums", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const failedImportResponse = await app.inject({
      method: "POST",
      url: "/api/cad/step-imports",
      payload: {
        fileName: "placeholder.step",
        fileText: uploadedClassStepFixture(),
        label: "placeholder-mode",
        source: "STEP_UPLOAD",
      },
    });
    assert.equal(failedImportResponse.statusCode, 422);
    resetLimits();

    const failedRunsResponse = await app.inject({ method: "GET", url: "/api/cad/import-runs?status=FAILED&source=STEP_UPLOAD" });
    assert.equal(failedRunsResponse.statusCode, 200);
    const failedRuns = failedRunsResponse.json() as { items: Array<{ status: string; source: string }> };
    assert.equal(failedRuns.items.length, 1);
    assert.equal(failedRuns.items[0]?.status, "FAILED");
    assert.equal(failedRuns.items[0]?.source, "STEP_UPLOAD");
    resetLimits();

    const parsedRunsResponse = await app.inject({ method: "GET", url: "/api/cad/import-runs?status=PARSED" });
    assert.equal(parsedRunsResponse.statusCode, 200);
    assert.equal((parsedRunsResponse.json() as { items: unknown[] }).items.length, 0);
    resetLimits();

    const snapshotStatusResponse = await app.inject({ method: "GET", url: "/api/cad/snapshots?status=FAILED" });
    assert.equal(snapshotStatusResponse.statusCode, 400);
    assert.match(snapshotStatusResponse.body, /CAD list query is invalid/);
    resetLimits();

    const badStatusResponse = await app.inject({ method: "GET", url: "/api/cad/snapshots?status=foo" });
    assert.equal(badStatusResponse.statusCode, 400);
    assert.match(badStatusResponse.body, /CAD list query is invalid/);
    resetLimits();

    const badSourceResponse = await app.inject({ method: "GET", url: "/api/cad/snapshots?source=foo" });
    assert.equal(badSourceResponse.statusCode, 400);
    assert.match(badSourceResponse.body, /CAD list query is invalid/);
  }, { env: { CAD_STEP_PARSER_MODE: "placeholder" } });
});

test("normal STEP upload rejects placeholder parser mode instead of creating a placeholder snapshot", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const response = await app.inject({
      method: "POST",
      url: "/api/cad/step-imports",
      payload: {
        fileName: "placeholder.step",
        fileText: uploadedClassStepFixture(),
        label: "placeholder-mode",
      },
    });
    assert.equal(response.statusCode, 422);
    assert.match(response.body, /Placeholder STEP parser output is disabled/);
    resetLimits();

    const importRunsResponse = await app.inject({ method: "GET", url: "/api/cad/import-runs" });
    assert.equal(importRunsResponse.statusCode, 200);
    const runs = importRunsResponse.json() as {
      items: Array<{ status: string; errorMessage: string | null }>;
    };
    assert.equal(runs.items[0]?.status, "FAILED");
    assert.match(runs.items[0]?.errorMessage ?? "", /Placeholder STEP parser output is disabled/);
    resetLimits();

    const snapshotsResponse = await app.inject({ method: "GET", url: "/api/cad/snapshots" });
    assert.equal(snapshotsResponse.statusCode, 200);
    assert.equal((snapshotsResponse.json() as { items: unknown[] }).items.length, 0);
  }, { env: { CAD_STEP_PARSER_MODE: "placeholder" } });
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

test("multipart STEP uploads preserve project context when metadata follows the file part", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const boundary = "meco-step-upload-file-first-boundary";
    const body = multipartStepPayload({
      boundary,
      fileName: "file-first.step",
      label: "file-first",
      fileBuffer: Buffer.from(uploadedClassStepFixture(), "utf8"),
      fileFirst: true,
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
    const parsed = response.json() as {
      importRun: { projectId: string | null; seasonId: string | null };
      snapshot: { projectId: string | null; seasonId: string | null };
      summary: { parserUsedPlaceholder?: boolean; rootNames?: string[] };
    };
    assert.equal(parsed.importRun.projectId, "robot-2026");
    assert.equal(parsed.importRun.seasonId, "season-2026");
    assert.equal(parsed.snapshot.projectId, "robot-2026");
    assert.equal(parsed.snapshot.seasonId, "season-2026");
    assert.equal(parsed.summary.parserUsedPlaceholder, false);
    assert.deepEqual(parsed.summary.rootNames, ["MAIN ASSEMBLY"]);
  }, { env: { CAD_STEP_PARSER_MODE: "step_text" } });
});

test("multipart STEP uploads normalize empty project context fields", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    const boundary = "meco-step-upload-empty-context-boundary";
    const body = multipartStepPayload({
      boundary,
      fileName: "empty-context.step",
      label: "empty-context",
      fileBuffer: Buffer.from(uploadedClassStepFixture(), "utf8"),
      projectId: "",
      seasonId: "   ",
      requestedBy: "",
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
    const parsed = response.json() as {
      importRun: { projectId: string | null; seasonId: string | null; requestedBy: string | null };
      snapshot: { projectId: string | null; seasonId: string | null };
    };
    assert.equal(parsed.importRun.projectId, null);
    assert.equal(parsed.importRun.seasonId, null);
    assert.equal(parsed.importRun.requestedBy, null);
    assert.equal(parsed.snapshot.projectId, null);
    assert.equal(parsed.snapshot.seasonId, null);
  }, { env: { CAD_STEP_PARSER_MODE: "step_text" } });
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

test("snapshot diff matches unchanged mappings by stable source identity", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();

    await uploadStep(app, "iteration-1", cadFixture());
    resetLimits();
    const second = await uploadStep(app, "iteration-2", cadFixture({ renumberSourceIds: true }));
    resetLimits();

    const diffResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${second.snapshot.id}/diff`,
    });
    assert.equal(diffResponse.statusCode, 200);
    const diff = diffResponse.json() as {
      mappingChanges: Array<{ type: string; sourceKind: string; sourceId: string }>;
      movedAssemblies: Array<{ sourceId: string }>;
      movedPartInstances: Array<{ sourceId: string }>;
    };
    assert.deepEqual(diff.mappingChanges, []);
    assert.deepEqual(diff.movedAssemblies, []);
    assert.deepEqual(diff.movedPartInstances, []);
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
    const forcedBody = forced.json() as {
      item: { status: string; finalizedBy: string | null };
      importRun: { status: string } | null;
    };
    assert.equal(forcedBody.item.status, "finalized");
    assert.equal(forcedBody.item.finalizedBy, "mentor@example.com");
    assert.equal(forcedBody.importRun?.status, "FINALIZED");
    resetLimits();

    const importRunResponse = await app.inject({
      method: "GET",
      url: `/api/cad/import-runs/${result.importRun.id}`,
    });
    assert.equal(importRunResponse.statusCode, 200, importRunResponse.body);
    assert.equal((importRunResponse.json() as { item: { status: string } }).item.status, "FINALIZED");
  });
});
