import assert from "node:assert/strict";
import { test } from "node:test";

import { resetCadRuntimeStore } from "../src/cad/cadStore";
import { createPartDefinition } from "../src/data/store";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

type TestApp = Awaited<ReturnType<typeof import("../src/app").buildApp>>;

function createDomainPart(input: { name: string; partNumber: string; type?: string; source?: string }) {
  return createPartDefinition({
    seasonId: "default-season",
    activeSeasonIds: ["default-season"],
    name: input.name,
    partNumber: input.partNumber,
    revision: "A",
    type: input.type ?? "custom",
    source: input.source ?? "Onshape",
    materialId: null,
    description: `${input.name} test fixture`,
  });
}

function hierarchyCadFixture(options?: {
  rivetCount?: number;
  includeMechanism?: boolean;
  includeComponentAtRoot?: boolean;
  includeTubeParts?: boolean;
  exactTubePartNumber?: string;
}) {
  const rivetCount = options?.rivetCount ?? 8;
  const includeMechanism = options?.includeMechanism !== false;
  const componentParent = options?.includeComponentAtRoot ? "asm-root" : includeMechanism ? "asm-chassis" : "asm-drive";
  const componentPath = componentParent === "asm-root"
    ? "/Robot/Bellypan Module"
    : componentParent === "asm-drive"
      ? "/Robot/Drivetrain/Bellypan Module"
      : "/Robot/Drivetrain/Chassis/Bellypan Module";
  const assemblies = [
    {
      sourceId: "asm-root",
      parentSourceId: null,
      name: "Robot",
      instancePath: "/Robot",
      depth: 0,
      inferredType: "ROOT",
      stableSignature: "asm:path:/Robot",
    },
    {
      sourceId: "asm-drive",
      parentSourceId: "asm-root",
      name: "Drivetrain",
      instancePath: "/Robot/Drivetrain",
      depth: 1,
      inferredType: "SUBSYSTEM_CANDIDATE",
      stableSignature: "asm:path:/Robot/Drivetrain",
    },
    ...(includeMechanism
      ? [{
          sourceId: "asm-chassis",
          parentSourceId: "asm-drive",
          name: "Chassis",
          instancePath: "/Robot/Drivetrain/Chassis",
          depth: 2,
          inferredType: "MECHANISM_CANDIDATE",
          stableSignature: "asm:path:/Robot/Drivetrain/Chassis",
        }]
      : []),
    {
      sourceId: "asm-bellypan",
      parentSourceId: componentParent,
      name: "Bellypan Module",
      instancePath: componentPath,
      depth: componentParent === "asm-root" ? 1 : componentParent === "asm-drive" ? 2 : 3,
      inferredType: "COMPONENT_ASSEMBLY_CANDIDATE",
      stableSignature: `asm:path:${componentPath}`,
    },
  ];
  const partDefinitions = [
    {
      sourceId: "part-rivet",
      name: "3/16 Aluminum Rivet",
      partNumber: "RVT-001",
      material: "aluminum",
      stableSignature: "part:number:RVT-001",
      metadata: { vendor: "McMaster-Carr" },
    },
    ...(options?.includeTubeParts
      ? [
          {
            sourceId: "part-tube-exact",
            name: "Drive Rail Tube",
            partNumber: options.exactTubePartNumber ?? "TUBE-EXACT",
            material: "aluminum",
            stableSignature: `part:number:${options.exactTubePartNumber ?? "TUBE-EXACT"}`,
          },
          {
            sourceId: "part-tube-ambiguous",
            name: "1x1 Aluminum Tube",
            partNumber: null,
            material: "aluminum",
            stableSignature: "part:name:1x1-aluminum-tube",
          },
        ]
      : []),
  ];
  const rivetInstances = Array.from({ length: rivetCount }, (_, index) => ({
    sourceId: `inst-rivet-${index + 1}`,
    partDefinitionSourceId: "part-rivet",
    parentAssemblySourceId: "asm-bellypan",
    instancePath: `${componentPath}/Rivet <${index + 1}>`,
    quantity: 1,
    stableSignature: `inst:path:${componentPath}/Rivet <${index + 1}>`,
  }));
  return JSON.stringify({
    rootName: "Robot",
    units: "inch",
    assemblyNodes: assemblies,
    partDefinitions,
    partInstances: [
      ...rivetInstances,
      ...(options?.includeTubeParts
        ? [
            {
              sourceId: "inst-tube-exact",
              partDefinitionSourceId: "part-tube-exact",
              parentAssemblySourceId: "asm-bellypan",
              instancePath: `${componentPath}/Drive Rail Tube <1>`,
              quantity: 1,
              stableSignature: "inst:path:/tube-exact",
            },
            {
              sourceId: "inst-tube-ambiguous",
              partDefinitionSourceId: "part-tube-ambiguous",
              parentAssemblySourceId: "asm-bellypan",
              instancePath: `${componentPath}/1x1 Aluminum Tube <1>`,
              quantity: 1,
              stableSignature: "inst:path:/tube-ambiguous",
            },
          ]
        : []),
    ],
  });
}

async function uploadStep(app: TestApp, label: string, fileText: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/cad/step-imports",
    payload: {
      fileName: `${label}.step`,
      fileText,
      label,
      projectId: "project-robot-2026",
      seasonId: "default-season",
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { snapshot: { id: string } };
}

function findNode(node: HierarchyNode, sourceId: string): HierarchyNode | null {
  if (node.sourceId === sourceId) {
    return node;
  }
  for (const child of node.children) {
    const match = findNode(child, sourceId);
    if (match) {
      return match;
    }
  }
  return null;
}

interface HierarchyNode {
  id: string;
  sourceKind: string;
  sourceId: string;
  name: string;
  inferredType: string;
  proposedClassification: string;
  resolvedSubsystemId: string | null;
  resolvedMechanismId: string | null;
  resolvedComponentAssemblyId: string | null;
  resolvedPartDefinitionId: string | null;
  confidence: string;
  status: string;
  children: HierarchyNode[];
  partSummary: {
    rawInstanceCount: number;
    groupedPartCount: number;
    totalQuantity: number;
    groups: Array<{ name: string; quantity: number; resolvedPartDefinitionId: string | null }>;
  };
}

test("hierarchy review returns a top-down assembly tree with component assembly classification", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    const imported = await uploadStep(app, "hierarchy-review", hierarchyCadFixture());
    resetLimits();

    const response = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/hierarchy-review`,
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { snapshotId: string; root: HierarchyNode; unresolved: unknown[] };
    assert.equal(body.snapshotId, imported.snapshot.id);
    assert.equal(body.root.sourceId, "asm-root");
    assert.equal(findNode(body.root, "asm-drive")?.proposedClassification, "SUBSYSTEM");
    assert.equal(findNode(body.root, "asm-chassis")?.proposedClassification, "MECHANISM");
    assert.equal(findNode(body.root, "asm-drive")?.partSummary.rawInstanceCount, 8);
    assert.equal(findNode(body.root, "asm-chassis")?.partSummary.rawInstanceCount, 8);
    const component = findNode(body.root, "asm-bellypan");
    assert.equal(component?.proposedClassification, "COMPONENT_ASSEMBLY");
    assert.equal(component?.partSummary.groups.length, 1);
    assert.equal(component?.partSummary.groups[0]?.quantity, 8);
    assert.ok(body.unresolved.some((item) => (item as { sourceId?: string }).sourceId === "asm-drive"));
  });
});

test("part match proposals reuse one database part for repeated rivets", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    const rivet = createDomainPart({ name: "3/16 Aluminum Rivet", partNumber: "RVT-001", type: "hardware", source: "McMaster-Carr" });
    const imported = await uploadStep(app, "repeated-rivets", hierarchyCadFixture({ rivetCount: 24 }));
    resetLimits();

    const response = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/part-match-proposals`,
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as {
      items: Array<{ cadPartDefinitionSourceId: string; instanceQuantity: number; status: string; candidates: Array<{ id: string; confidence: string; strategy: string }> }>;
    };
    assert.equal(body.items.filter((item) => item.cadPartDefinitionSourceId === "part-rivet").length, 1);
    const proposal = body.items.find((item) => item.cadPartDefinitionSourceId === "part-rivet");
    assert.equal(proposal?.instanceQuantity, 24);
    assert.equal(proposal?.status, "EXACT");
    assert.equal(proposal?.candidates[0]?.id, rivet.id);
    assert.equal(proposal?.candidates[0]?.confidence, "HIGH");
    assert.equal(proposal?.candidates[0]?.strategy, "EXACT_PART_NUMBER");
  });
});

test("part match proposals distinguish exact tube numbers from ambiguous tube names", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    const exactTube = createDomainPart({ name: "Competition Drive Tube", partNumber: "TUBE-042" });
    const tubeA = createDomainPart({ name: "1x1 Aluminum Tube", partNumber: "TUBE-A", type: "stock", source: "Online Metals" });
    const tubeB = createDomainPart({ name: "1x1 Aluminum Tube", partNumber: "TUBE-B", type: "stock", source: "Online Metals" });
    const imported = await uploadStep(app, "tube-matches", hierarchyCadFixture({
      includeTubeParts: true,
      exactTubePartNumber: exactTube.partNumber,
    }));
    resetLimits();

    const response = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/part-match-proposals`,
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as {
      items: Array<{ cadPartDefinitionSourceId: string; status: string; candidates: Array<{ id: string; confidence: string; strategy: string }> }>;
    };
    const exact = body.items.find((item) => item.cadPartDefinitionSourceId === "part-tube-exact");
    assert.equal(exact?.status, "EXACT");
    assert.equal(exact?.candidates[0]?.id, exactTube.id);
    assert.equal(exact?.candidates[0]?.strategy, "EXACT_PART_NUMBER");

    const ambiguous = body.items.find((item) => item.cadPartDefinitionSourceId === "part-tube-ambiguous");
    assert.equal(ambiguous?.status, "AMBIGUOUS");
    assert.deepEqual(new Set(ambiguous?.candidates.map((candidate) => candidate.id)), new Set([tubeA.id, tubeB.id]));
    assert.ok(ambiguous?.candidates.every((candidate) => candidate.confidence === "MEDIUM"));
  });
});

test("part match proposals score whitespace-separated vendor names", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    const drivePlate = createDomainPart({
      name: "Drive Plate",
      partNumber: "DRV-PLATE",
      source: "VendorCo",
    });
    const imported = await uploadStep(app, "whitespace-token-part-match", JSON.stringify({
      rootName: "Robot",
      units: "inch",
      assemblyNodes: [],
      partDefinitions: [
        {
          sourceId: "part-drive-rail",
          name: "Drive Rail",
          partNumber: null,
          material: "aluminum",
          stableSignature: "part:name:drive-rail",
          metadata: { vendor: "VendorCo" },
        },
      ],
      partInstances: [],
    }));
    resetLimits();

    const response = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/part-match-proposals`,
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as {
      items: Array<{ cadPartDefinitionSourceId: string; status: string; candidates: Array<{ id: string; strategy: string }> }>;
    };
    const proposal = body.items.find((item) => item.cadPartDefinitionSourceId === "part-drive-rail");
    assert.equal(proposal?.status, "SUGGESTED");
    assert.equal(proposal?.candidates[0]?.id, drivePlate.id);
    assert.equal(proposal?.candidates[0]?.strategy, "VENDOR_METADATA");
  });
});

test("hierarchy review groups 600 repeated part instances instead of overloading flat rows", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    createDomainPart({ name: "3/16 Aluminum Rivet", partNumber: "RVT-001", type: "hardware", source: "McMaster-Carr" });
    const imported = await uploadStep(app, "many-rivets", hierarchyCadFixture({ rivetCount: 600 }));
    resetLimits();

    const response = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/hierarchy-review`,
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { root: HierarchyNode; unresolved: unknown[]; partMatchProposals: unknown[] };
    const component = findNode(body.root, "asm-bellypan");
    assert.equal(component?.partSummary.totalQuantity, 600);
    assert.equal(component?.partSummary.groups.length, 1);
    assert.ok(body.unresolved.length < 20, `expected grouped unresolved review items, got ${body.unresolved.length}`);
    assert.equal(body.partMatchProposals.length, 1);
  });
});

test("component assemblies can be assigned to an existing parent mechanism", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    const rivet = createDomainPart({ name: "3/16 Aluminum Rivet", partNumber: "RVT-001", type: "hardware", source: "McMaster-Carr" });
    const imported = await uploadStep(app, "assigned-component-parent", hierarchyCadFixture({
      includeMechanism: false,
    }));
    resetLimits();

    const reviewResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/hierarchy-review`,
    });
    const review = reviewResponse.json() as { root: HierarchyNode };
    const drive = findNode(review.root, "asm-drive");
    const component = findNode(review.root, "asm-bellypan");
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${imported.snapshot.id}/hierarchy-review/apply`,
      payload: {
        assemblyDecisions: [
          { sourceId: drive?.id, targetKind: "SUBSYSTEM", targetId: "drive", status: "CONFIRMED" },
          { sourceId: component?.id, targetKind: "COMPONENT_ASSEMBLY", parentMechanismId: "chassis", status: "CONFIRMED" },
        ],
        partMatchConfirmations: [
          { cadPartDefinitionSourceId: "part-rivet", targetPartDefinitionId: rivet.id, status: "CONFIRMED" },
        ],
      },
    });
    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    resetLimits();

    const finalizeResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${imported.snapshot.id}/finalize`,
      payload: {},
    });
    assert.equal(finalizeResponse.statusCode, 200, finalizeResponse.body);
  });
});

test("hierarchy apply preserves part-instance decisions", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    const rivet = createDomainPart({ name: "3/16 Aluminum Rivet", partNumber: "RVT-001", type: "hardware", source: "McMaster-Carr" });
    const imported = await uploadStep(app, "part-instance-hierarchy-apply", hierarchyCadFixture());
    resetLimits();

    const mappingsResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/mappings?groupInstances=false`,
    });
    assert.equal(mappingsResponse.statusCode, 200, mappingsResponse.body);
    const instanceMapping = (mappingsResponse.json() as {
      items: Array<{ sourceKind: string; sourceId: string; targetId: string | null }>;
    }).items.find((mapping) => mapping.sourceKind === "PART_INSTANCE");
    assert.ok(instanceMapping);
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${imported.snapshot.id}/hierarchy-review/apply`,
      payload: {
        reviewedBy: "mentor@example.com",
        decisions: [
          {
            nodeId: instanceMapping.sourceId,
            sourceId: instanceMapping.sourceId,
            sourceKind: "PART_INSTANCE",
            targetKind: "PART_DEFINITION",
            targetId: rivet.id,
            status: "CONFIRMED",
          },
        ],
      },
    });

    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    const applied = applyResponse.json() as {
      updated: Array<{ sourceKind: string; sourceId: string; targetKind: string; targetId: string | null; status: string }>;
    };
    assert.equal(applied.updated.length, 1);
    assert.equal(applied.updated[0]?.sourceKind, "PART_INSTANCE");
    assert.equal(applied.updated[0]?.sourceId, instanceMapping.sourceId);
    assert.equal(applied.updated[0]?.targetKind, "PART_DEFINITION");
    assert.equal(applied.updated[0]?.targetId, rivet.id);
    assert.equal(applied.updated[0]?.status, "CONFIRMED");
  });
});

test("finalize reports hierarchy validation issues and still honors allowUnresolved", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    resetCadRuntimeStore();
    const rivet = createDomainPart({ name: "3/16 Aluminum Rivet", partNumber: "RVT-001", type: "hardware", source: "McMaster-Carr" });
    const imported = await uploadStep(app, "invalid-component-parent", hierarchyCadFixture({
      includeMechanism: false,
      includeComponentAtRoot: true,
    }));
    resetLimits();

    const reviewResponse = await app.inject({
      method: "GET",
      url: `/api/cad/snapshots/${imported.snapshot.id}/hierarchy-review`,
    });
    const review = reviewResponse.json() as { root: HierarchyNode };
    const root = findNode(review.root, "asm-root");
    const drive = findNode(review.root, "asm-drive");
    const component = findNode(review.root, "asm-bellypan");
    resetLimits();

    const applyResponse = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${imported.snapshot.id}/hierarchy-review/apply`,
      payload: {
        reviewedBy: "mentor@example.com",
        assemblyDecisions: [
          { sourceId: root?.id, targetKind: "IGNORE", status: "CONFIRMED" },
          { sourceId: drive?.id, targetKind: "SUBSYSTEM", targetId: "drive", status: "CONFIRMED" },
          { sourceId: component?.id, targetKind: "COMPONENT_ASSEMBLY", targetId: "asm-bellypan", status: "CONFIRMED" },
        ],
        partMatchConfirmations: [
          { cadPartDefinitionSourceId: "part-rivet", targetPartDefinitionId: rivet.id, status: "CONFIRMED" },
        ],
      },
    });
    assert.equal(applyResponse.statusCode, 200, applyResponse.body);
    resetLimits();

    const blocked = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${imported.snapshot.id}/finalize`,
      payload: {},
    });
    assert.equal(blocked.statusCode, 409, blocked.body);
    const blockedBody = blocked.json() as { issues: Array<{ code: string }> };
    assert.ok(blockedBody.issues.some((issue) => issue.code === "cad_component_assembly_missing_parent"));
    resetLimits();

    const forced = await app.inject({
      method: "POST",
      url: `/api/cad/snapshots/${imported.snapshot.id}/finalize`,
      payload: { allowUnresolved: true, finalizedBy: "mentor@example.com" },
    });
    assert.equal(forced.statusCode, 200, forced.body);
    const forcedBody = forced.json() as { item: { status: string }; warnings: Array<{ code: string }> };
    assert.equal(forcedBody.item.status, "finalized");
    assert.ok(forcedBody.warnings.some((warning) => warning.code === "cad_component_assembly_missing_parent"));
  });
});
