import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("manufacturing and purchase endpoints preserve mobile and fabrication flows", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const mobileMemberCreateResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Inventory Test Student",
        role: "student",
      },
    });

    assert.equal(mobileMemberCreateResponse.statusCode, 201);
    const mobileMemberCreatedBody = mobileMemberCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const mobileSubsystemCreateResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        name: "Inventory Test Intake",
        description: "Subsystem used for inventory integration test payloads.",
        parentSubsystemId: "manipulator",
        responsibleEngineerId: mobileMemberCreatedBody.item.id,
        mentorIds: ["riley"],
        risks: [],
      },
    });

    assert.equal(mobileSubsystemCreateResponse.statusCode, 201);
    const mobileSubsystemCreatedBody = mobileSubsystemCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const mobileManufacturingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/manufacturing",
      payload: {
        title: "Mobile CNC Item",
        subsystemId: mobileSubsystemCreatedBody.item.id,
        requestedById: mobileMemberCreatedBody.item.id,
        process: "cnc",
        dueDate: "2026-05-07",
        material: "Aluminum plate",
        quantity: 1,
        status: "requested",
        mentorReviewed: false,
        inHouse: false,
        qaReviewCount: 0,
      },
    });

    assert.equal(mobileManufacturingCreateResponse.statusCode, 201);
    const mobileManufacturingCreatedBody =
      mobileManufacturingCreateResponse.json() as {
        item: {
          id: string;
          inHouse: boolean;
          partDefinitionId: string | null;
          title: string;
        };
      };
    assert.equal(mobileManufacturingCreatedBody.item.inHouse, false);
    assert.equal(mobileManufacturingCreatedBody.item.partDefinitionId, null);
    assert.equal(mobileManufacturingCreatedBody.item.title, "Mobile CNC Item");

    resetLimits();

    const mobileManufacturingUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/manufacturing/${mobileManufacturingCreatedBody.item.id}`,
      payload: {
        inHouse: true,
      },
    });

    assert.equal(mobileManufacturingUpdateResponse.statusCode, 200);
    assert.equal(mobileManufacturingUpdateResponse.json().item.inHouse, true);

    resetLimits();

    const targetedManufacturingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/manufacturing",
      payload: {
        title: "Targeted CNC Item",
        subsystemId: "drive",
        requestedById: "ava",
        process: "cnc",
        dueDate: "2026-05-08",
        material: "Aluminum plate",
        materialId: "mat-onyx-filament",
        partDefinitionId: "pd-swerve-encoder-bracket",
        partInstanceId: "pi-swerve-encoder-bracket-front-left",
        partInstanceIds: ["pi-swerve-encoder-bracket-front-left"],
        quantity: 1,
        status: "requested",
        mentorReviewed: false,
        inHouse: true,
      },
    });

    assert.equal(targetedManufacturingCreateResponse.statusCode, 201);
    const targetedManufacturingCreatedBody =
      targetedManufacturingCreateResponse.json() as {
        item: {
          materialId: string | null;
          partInstanceId: string | null;
          partInstanceIds: string[];
        };
      };
    assert.equal(targetedManufacturingCreatedBody.item.materialId, "mat-onyx-filament");
    assert.equal(
      targetedManufacturingCreatedBody.item.partInstanceId,
      "pi-swerve-encoder-bracket-front-left",
    );
    assert.deepEqual(targetedManufacturingCreatedBody.item.partInstanceIds, [
      "pi-swerve-encoder-bracket-front-left",
    ]);

    resetLimits();

    const mismatchedManufacturingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/manufacturing",
      payload: {
        title: "Mismatched CNC Item",
        subsystemId: "manipulator",
        requestedById: "ava",
        process: "cnc",
        dueDate: "2026-05-08",
        material: "Onyx",
        materialId: "mat-onyx-filament",
        partDefinitionId: "pd-intake-guard",
        partInstanceId: "pi-intake-guard-set",
        partInstanceIds: ["pi-intake-guard-set"],
        quantity: 1,
        status: "requested",
        mentorReviewed: false,
        inHouse: true,
      },
    });

    assert.equal(mismatchedManufacturingCreateResponse.statusCode, 400);
    assert.equal(
      mismatchedManufacturingCreateResponse.json().message,
      "The selected material does not match the selected part.",
    );

    resetLimits();

    const derivedManufacturingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/manufacturing",
      payload: {
        title: "Derived Material CNC Item",
        subsystemId: "manipulator",
        requestedById: "ava",
        process: "cnc",
        dueDate: "2026-05-08",
        material: "Polycarbonate",
        partDefinitionId: "pd-intake-guard",
        partInstanceId: "pi-intake-guard-set",
        partInstanceIds: ["pi-intake-guard-set"],
        quantity: 1,
        status: "requested",
        mentorReviewed: false,
        inHouse: true,
      },
    });

    assert.equal(derivedManufacturingCreateResponse.statusCode, 201);
    assert.equal(
      derivedManufacturingCreateResponse.json().item.materialId,
      "mat-1-8-polycarbonate",
    );

    resetLimits();

    const mobilePurchaseCreateResponse = await app.inject({
      method: "POST",
      url: "/api/purchases",
      payload: {
        title: "Mobile purchase item",
        subsystemId: mobileSubsystemCreatedBody.item.id,
        requestedById: mobileMemberCreatedBody.item.id,
        quantity: 1,
        vendor: "Mobile Vendor",
        linkLabel: "mobile.example/item",
        estimatedCost: 42,
        approvedByMentor: false,
        status: "requested",
      },
    });

    assert.equal(mobilePurchaseCreateResponse.statusCode, 201);
    const mobilePurchaseCreatedBody = mobilePurchaseCreateResponse.json() as {
      item: {
        id: string;
        partDefinitionId: string | null;
        title: string;
      };
    };
    assert.equal(mobilePurchaseCreatedBody.item.partDefinitionId, null);
    assert.equal(mobilePurchaseCreatedBody.item.title, "Mobile purchase item");

    resetLimits();

    const fabricationCreateResponse = await app.inject({
      method: "POST",
      url: "/api/manufacturing",
      payload: {
        title: "Custom Welded Intake Frame",
        subsystemId: "manipulator",
        requestedById: "lucas",
        process: "fabrication",
        dueDate: "2026-04-29",
        material: "1/8 aluminum tube",
        quantity: 1,
        status: "requested",
        mentorReviewed: false,
        batchLabel: "FAB-04",
      },
    });

    assert.equal(fabricationCreateResponse.statusCode, 201);
    const fabricationCreatedBody = fabricationCreateResponse.json() as {
      item: {
        batchLabel?: string;
        id: string;
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      };
    };
    assert.equal(fabricationCreatedBody.item.process, "fabrication");
    assert.equal(fabricationCreatedBody.item.partDefinitionId, null);
    assert.equal(fabricationCreatedBody.item.title, "Custom Welded Intake Frame");
    assert.equal(fabricationCreatedBody.item.batchLabel, "FAB-04");

    resetLimits();

    const fabricationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/manufacturing/${fabricationCreatedBody.item.id}`,
      payload: {
        title: "Custom Welded Intake Frame Rev B",
        materialId: "mat-1-8-polycarbonate",
        status: "in-progress",
      },
    });

    assert.equal(fabricationUpdateResponse.statusCode, 200);
    const fabricationUpdatedBody = fabricationUpdateResponse.json() as {
      item: {
        materialId: string | null;
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      };
    };
    assert.equal(fabricationUpdatedBody.item.process, "fabrication");
    assert.equal(fabricationUpdatedBody.item.materialId, "mat-1-8-polycarbonate");
    assert.equal(fabricationUpdatedBody.item.partDefinitionId, null);
    assert.equal(fabricationUpdatedBody.item.title, "Custom Welded Intake Frame Rev B");
    assert.equal(fabricationUpdatedBody.item.status, "in-progress");

    resetLimits();

    const bootstrapAfterUpdateResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapAfterUpdateResponse.statusCode, 200);
    const bootstrapAfterUpdateBody = bootstrapAfterUpdateResponse.json() as {
      manufacturingItems: Array<{
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      }>;
    };

    const createdFabricationItem = bootstrapAfterUpdateBody.manufacturingItems.find(
      (item) => item.title === "Custom Welded Intake Frame Rev B",
    );
    assert.ok(createdFabricationItem);
    assert.equal(createdFabricationItem?.process, "fabrication");
    assert.equal(createdFabricationItem?.partDefinitionId, null);
    assert.equal(createdFabricationItem?.status, "in-progress");

    resetLimits();

    const mobileManufacturingDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/manufacturing/${mobileManufacturingCreatedBody.item.id}`,
    });

    assert.equal(mobileManufacturingDeleteResponse.statusCode, 200);
    assert.equal(
      mobileManufacturingDeleteResponse.json().item.id,
      mobileManufacturingCreatedBody.item.id,
    );

    resetLimits();

    const mobilePurchaseDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/purchases/${mobilePurchaseCreatedBody.item.id}`,
    });

    assert.equal(mobilePurchaseDeleteResponse.statusCode, 200);
    assert.equal(
      mobilePurchaseDeleteResponse.json().item.id,
      mobilePurchaseCreatedBody.item.id,
    );
  });
});
