import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("planning entity endpoints round-trip hierarchy and archive defaults", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const filteredBootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?personId=priya",
    });

    assert.equal(filteredBootstrapResponse.statusCode, 200);
    const filteredBootstrapBody = filteredBootstrapResponse.json() as {
      workLogs: Array<{
        id: string;
        participantIds: string[];
      }>;
    };
    assert.deepEqual(
      filteredBootstrapBody.workLogs.map((workLog) => workLog.id),
      ["log-3", "log-4"],
    );

    resetLimits();

    const partDefinitionResponse = await app.inject({
      method: "POST",
      url: "/api/part-definitions",
      payload: {
        name: "Route Test Part",
        partNumber: "TST-900",
        revision: "A",
        iteration: 4,
        type: "custom",
        source: "Onshape",
        materialId: "mat-onyx-filament",
        description: "Created from the app test suite.",
      },
    });

    assert.equal(partDefinitionResponse.statusCode, 201);
    const partDefinitionBody = partDefinitionResponse.json() as {
      item: {
        description: string;
        id: string;
        isArchived: boolean;
        iteration: number;
        materialId: string | null;
      };
    };
    assert.equal(partDefinitionBody.item.isArchived, false);
    assert.equal(partDefinitionBody.item.iteration, 4);
    assert.equal(partDefinitionBody.item.materialId, "mat-onyx-filament");
    assert.equal(partDefinitionBody.item.description, "Created from the app test suite.");

    resetLimits();

    const partDefinitionIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/part-definitions/${partDefinitionBody.item.id}`,
      payload: {
        iteration: 5,
        isArchived: true,
      },
    });

    assert.equal(partDefinitionIterationUpdateResponse.statusCode, 200);
    assert.equal(partDefinitionIterationUpdateResponse.json().item.iteration, 5);
    assert.equal(partDefinitionIterationUpdateResponse.json().item.isArchived, true);

    resetLimits();

    const partInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        subsystemId: "drive",
        mechanismId: "swerve-module",
        partDefinitionId: partDefinitionBody.item.id,
        name: "Route test part instance",
        quantity: 2,
        trackIndividually: true,
        status: "available",
      },
    });

    assert.equal(partInstanceResponse.statusCode, 201);
    const partInstanceBody = partInstanceResponse.json() as {
      item: {
        mechanismId: string | null;
        status: string;
        subsystemId: string;
      };
    };
    assert.equal(partInstanceBody.item.mechanismId, "swerve-module");
    assert.equal(partInstanceBody.item.subsystemId, "drive");
    assert.equal(partInstanceBody.item.status, "available");

    resetLimits();

    const mismatchedPartInstanceResponse = await app.inject({
      method: "POST",
      url: "/api/part-instances",
      payload: {
        subsystemId: "manipulator",
        mechanismId: "swerve-module",
        partDefinitionId: partDefinitionBody.item.id,
        name: "Invalid relationship",
        quantity: 1,
        trackIndividually: false,
        status: "planned",
      },
    });

    assert.equal(mismatchedPartInstanceResponse.statusCode, 400);
    assert.match(
      mismatchedPartInstanceResponse.json().message as string,
      /does not belong to the selected subsystem/i,
    );

    resetLimits();

    const childSubsystemResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        projectId: "project-robot-2026",
        name: "Route Test Intake",
        description: "Temporary child subsystem for route edge-case coverage.",
        iteration: 2,
        parentSubsystemId: "manipulator",
        responsibleEngineerId: "lucas",
        mentorIds: ["riley"],
        risks: [],
      },
    });

    assert.equal(childSubsystemResponse.statusCode, 201);
    const childSubsystemBody = childSubsystemResponse.json() as {
      item: {
        id: string;
        isArchived: boolean;
        iteration: number;
      };
    };
    assert.equal(childSubsystemBody.item.isArchived, false);
    assert.equal(childSubsystemBody.item.iteration, 2);

    resetLimits();

    const childSubsystemIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/subsystems/${childSubsystemBody.item.id}`,
      payload: {
        iteration: 3,
        isArchived: true,
      },
    });

    assert.equal(childSubsystemIterationUpdateResponse.statusCode, 200);
    assert.equal(childSubsystemIterationUpdateResponse.json().item.iteration, 3);
    assert.equal(childSubsystemIterationUpdateResponse.json().item.isArchived, true);

    resetLimits();

    const mechanismResponse = await app.inject({
      method: "POST",
      url: "/api/mechanisms",
      payload: {
        subsystemId: childSubsystemBody.item.id,
        name: "Route Test Roller",
        description: "Temporary mechanism for route iteration coverage.",
        iteration: 2,
      },
    });

    assert.equal(mechanismResponse.statusCode, 201);
    const mechanismBody = mechanismResponse.json() as {
      item: {
        id: string;
        isArchived: boolean;
        iteration: number;
      };
    };
    assert.equal(mechanismBody.item.isArchived, false);
    assert.equal(mechanismBody.item.iteration, 2);

    resetLimits();

    const mechanismIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/mechanisms/${mechanismBody.item.id}`,
      payload: {
        iteration: 3,
        isArchived: true,
      },
    });

    assert.equal(mechanismIterationUpdateResponse.statusCode, 200);
    assert.equal(mechanismIterationUpdateResponse.json().item.iteration, 3);
    assert.equal(mechanismIterationUpdateResponse.json().item.isArchived, true);

    resetLimits();

    const cyclicSubsystemResponse = await app.inject({
      method: "PATCH",
      url: "/api/subsystems/manipulator",
      payload: {
        parentSubsystemId: childSubsystemBody.item.id,
      },
    });

    assert.equal(cyclicSubsystemResponse.statusCode, 400);
    assert.match(cyclicSubsystemResponse.json().message as string, /cycle|descendant/i);

    resetLimits();

    const createRobotProjectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        seasonId: "default-season",
        name: "Practice Bot",
        projectType: "robot",
      },
    });

    assert.equal(createRobotProjectResponse.statusCode, 201);
    const createRobotProjectBody = createRobotProjectResponse.json() as {
      item: {
        id: string;
        name: string;
        projectType: string;
        seasonId: string;
        status: string;
      };
    };
    assert.equal(createRobotProjectBody.item.name, "Practice Bot");
    assert.equal(createRobotProjectBody.item.projectType, "robot");
    assert.equal(createRobotProjectBody.item.seasonId, "default-season");
    assert.equal(createRobotProjectBody.item.status, "active");

    resetLimits();

    const updateRobotProjectResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${createRobotProjectBody.item.id}`,
      payload: {
        name: "Practice Bot V2",
      },
    });

    assert.equal(updateRobotProjectResponse.statusCode, 200);
    assert.equal(updateRobotProjectResponse.json().item.name, "Practice Bot V2");
  });
});
