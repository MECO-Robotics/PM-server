import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("task and event endpoints support mobile and multi-target payloads", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const mobileMemberCreateResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Mobile Test Student",
        role: "student",
      },
    });

    assert.equal(mobileMemberCreateResponse.statusCode, 201);
    const mobileMemberCreatedBody = mobileMemberCreateResponse.json() as {
      item: {
        email: string;
        elevated: boolean;
        id: string;
        seasonId: string;
      };
    };
    assert.equal(mobileMemberCreatedBody.item.email, "");
    assert.equal(mobileMemberCreatedBody.item.elevated, false);
    assert.equal(mobileMemberCreatedBody.item.seasonId, "default-season");

    resetLimits();

    const mobileSubsystemCreateResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        name: "Mobile Test Intake",
        description: "Subsystem created with the mobile app payload shape.",
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
        projectId: string;
      };
    };
    assert.equal(mobileSubsystemCreatedBody.item.projectId, "project-robot-2026");

    resetLimits();

    const mobileTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Mobile task payload",
        summary: "Created from the mobile app's compact task draft.",
        subsystemId: mobileSubsystemCreatedBody.item.id,
        disciplineId: "design",
        requirementId: null,
        mechanismId: null,
        partInstanceId: null,
        targetEventId: null,
        ownerId: mobileMemberCreatedBody.item.id,
        assigneeIds: [mobileMemberCreatedBody.item.id, "ava"],
        mentorId: "riley",
        dueDate: "2026-05-06",
        priority: "medium",
        status: "not-started",
        dependencyIds: [],
        blockers: [],
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 0,
        actualHours: 0,
        photoUrl: "https://cdn.example.test/tasks/mobile-task.png",
      },
    });

    assert.equal(mobileTaskCreateResponse.statusCode, 201);
    const mobileTaskCreatedBody = mobileTaskCreateResponse.json() as {
      item: {
        id: string;
        projectId: string;
        assigneeIds: string[];
        startDate: string;
        workstreamId: string | null;
        photoUrl: string;
      };
    };
    assert.equal(mobileTaskCreatedBody.item.projectId, "project-robot-2026");
    assert.deepEqual(mobileTaskCreatedBody.item.assigneeIds, [
      mobileMemberCreatedBody.item.id,
      "ava",
    ]);
    assert.equal(mobileTaskCreatedBody.item.startDate, "2026-05-06");
    assert.equal(
      typeof mobileTaskCreatedBody.item.workstreamId === "string" ||
        mobileTaskCreatedBody.item.workstreamId === null,
      true,
    );
    assert.equal(
      mobileTaskCreatedBody.item.photoUrl,
      "https://cdn.example.test/tasks/mobile-task.png",
    );

    resetLimits();

    const invalidOperationsTaskResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        projectId: "project-operations-2026",
        workstreamId: "workstream-operations-logistics",
        title: "Invalid operations discipline",
        summary: "Attempts to use a robot-only discipline on a business task.",
        subsystemId: "pit-readiness",
        disciplineId: "design",
        mechanismId: "pit-board",
        partInstanceId: "pi-pit-board-frame",
        targetEventId: "pit-freeze-apr-28",
        ownerId: "sofia",
        mentorId: "marco",
        dueDate: "2026-05-01",
        priority: "medium",
        status: "not-started",
        dependencyIds: [],
        blockers: [],
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 2,
        actualHours: 0,
      },
    });

    assert.equal(invalidOperationsTaskResponse.statusCode, 400);
    assert.match(
      invalidOperationsTaskResponse.body,
      /selected discipline does not belong to the selected project/i,
    );

    resetLimits();

    const multiTargetTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        projectId: "project-robot-2026",
        workstreamIds: ["workstream-drive", "workstream-controls"],
        title: "Multi-target task payload",
        summary: "Created with multiple linked workstreams, subsystems, mechanisms, and parts.",
        subsystemIds: ["drive", "controls"],
        disciplineId: "design",
        mechanismIds: ["swerve-module", "auto-safety"],
        partInstanceIds: ["pi-swerve-encoder-bracket-front-left"],
        targetEventId: null,
        ownerId: mobileMemberCreatedBody.item.id,
        mentorId: "riley",
        dueDate: "2026-05-08",
        priority: "high",
        status: "not-started",
        dependencyIds: [],
        blockers: [],
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 2,
        actualHours: 0,
        photoUrl: "https://cdn.example.test/tasks/multi-target-task.png",
      },
    });

    assert.equal(multiTargetTaskCreateResponse.statusCode, 201);
    const multiTargetTaskCreatedBody = multiTargetTaskCreateResponse.json() as {
      item: {
        workstreamId: string | null;
        workstreamIds: string[];
        subsystemId: string;
        subsystemIds: string[];
        mechanismId: string | null;
        mechanismIds: string[];
        partInstanceId: string | null;
        partInstanceIds: string[];
        photoUrl: string;
      };
    };
    assert.equal(multiTargetTaskCreatedBody.item.workstreamId, "workstream-drive");
    assert.deepEqual(multiTargetTaskCreatedBody.item.workstreamIds, [
      "workstream-drive",
      "workstream-controls",
    ]);
    assert.equal(multiTargetTaskCreatedBody.item.subsystemId, "drive");
    assert.deepEqual(multiTargetTaskCreatedBody.item.subsystemIds, ["drive", "controls"]);
    assert.equal(multiTargetTaskCreatedBody.item.mechanismId, "swerve-module");
    assert.deepEqual(multiTargetTaskCreatedBody.item.mechanismIds, [
      "swerve-module",
      "auto-safety",
    ]);
    assert.equal(
      multiTargetTaskCreatedBody.item.partInstanceId,
      "pi-swerve-encoder-bracket-front-left",
    );
    assert.deepEqual(multiTargetTaskCreatedBody.item.partInstanceIds, [
      "pi-swerve-encoder-bracket-front-left",
    ]);
    assert.equal(
      multiTargetTaskCreatedBody.item.photoUrl,
      "https://cdn.example.test/tasks/multi-target-task.png",
    );

    resetLimits();

    const createEventResponse = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: {
        title: "Cross Project Demo",
        type: "demo",
        startDateTime: "2026-05-14T18:00:00-04:00",
        endDateTime: null,
        isExternal: true,
        description: "Milestone shared across robot and operations work.",
        projectIds: ["project-robot-2026", "project-operations-2026"],
        relatedSubsystemIds: ["drive", "operations"],
        photoUrl: "https://cdn.example.test/forms/event-demo.png",
      },
    });

    assert.equal(createEventResponse.statusCode, 201);
    const createdEventBody = createEventResponse.json() as {
      item: {
        id: string;
        projectIds: string[];
        relatedSubsystemIds: string[];
        photoUrl: string;
      };
    };
    assert.deepEqual(createdEventBody.item.projectIds, [
      "project-robot-2026",
      "project-operations-2026",
    ]);
    assert.deepEqual(createdEventBody.item.relatedSubsystemIds, ["drive", "operations"]);
    assert.equal(
      createdEventBody.item.photoUrl,
      "https://cdn.example.test/forms/event-demo.png",
    );

    resetLimits();

    const updateEventResponse = await app.inject({
      method: "PATCH",
      url: `/api/events/${createdEventBody.item.id}`,
      payload: {
        projectIds: ["project-outreach-2026"],
        relatedSubsystemIds: ["outreach"],
        photoUrl: "https://cdn.example.test/forms/event-demo-v2.png",
      },
    });

    assert.equal(updateEventResponse.statusCode, 200);
    const updatedEventBody = updateEventResponse.json() as {
      item: {
        projectIds: string[];
        relatedSubsystemIds: string[];
        photoUrl: string;
      };
    };
    assert.deepEqual(updatedEventBody.item.projectIds, ["project-outreach-2026"]);
    assert.deepEqual(updatedEventBody.item.relatedSubsystemIds, ["outreach"]);
    assert.equal(
      updatedEventBody.item.photoUrl,
      "https://cdn.example.test/forms/event-demo-v2.png",
    );

    resetLimits();

    const unknownProjectResponse = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: {
        title: "Unknown Project Demo",
        type: "demo",
        startDateTime: "2026-05-15T18:00:00-04:00",
        endDateTime: null,
        isExternal: true,
        description: "",
        projectIds: ["missing-project"],
        relatedSubsystemIds: [],
        photoUrl: "https://cdn.example.test/forms/invalid.png",
      },
    });

    assert.equal(unknownProjectResponse.statusCode, 400);

    resetLimits();

    const mismatchedSubsystemResponse = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: {
        title: "Mismatched Subsystem Demo",
        type: "demo",
        startDateTime: "2026-05-16T18:00:00-04:00",
        endDateTime: null,
        isExternal: true,
        description: "",
        projectIds: ["project-outreach-2026"],
        relatedSubsystemIds: ["drive"],
        photoUrl: "https://cdn.example.test/forms/invalid-subsystem.png",
      },
    });

    assert.equal(mismatchedSubsystemResponse.statusCode, 400);

    resetLimits();

    const mobileTaskDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${mobileTaskCreatedBody.item.id}`,
    });

    assert.equal(mobileTaskDeleteResponse.statusCode, 200);
    assert.equal(mobileTaskDeleteResponse.json().item.id, mobileTaskCreatedBody.item.id);

    resetLimits();

    const mobileSubsystemDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/subsystems/${mobileSubsystemCreatedBody.item.id}`,
    });

    assert.equal(mobileSubsystemDeleteResponse.statusCode, 200);
    assert.equal(
      mobileSubsystemDeleteResponse.json().item.id,
      mobileSubsystemCreatedBody.item.id,
    );

    resetLimits();

    const inferredTasksResponse = await app.inject({
      method: "GET",
      url: `/api/events/${createdEventBody.item.id}/milestones/tasks`,
    });
    assert.equal(inferredTasksResponse.statusCode, 200);
    const inferredTasksBody = inferredTasksResponse.json() as {
      eventId: string;
      items: Array<{
        taskId: string;
        matchedRequirementIds: string[];
        isLegacyLink: boolean;
      }>;
    };
    assert.equal(inferredTasksBody.eventId, createdEventBody.item.id);
    assert.ok(
      inferredTasksBody.items.some((item) => item.taskId === "outreach-kiosk-assembly"),
    );

    resetLimits();

    const taskMilestonesResponse = await app.inject({
      method: "GET",
      url: "/api/tasks/outreach-kiosk-assembly/milestones",
    });
    assert.equal(taskMilestonesResponse.statusCode, 200);
    const taskMilestonesBody = taskMilestonesResponse.json() as {
      taskId: string;
      items: Array<{ eventId: string; matchedRequirementIds: string[]; isLegacyLink: boolean }>;
    };
    assert.equal(taskMilestonesBody.taskId, "outreach-kiosk-assembly");
    assert.ok(
      taskMilestonesBody.items.some((item) =>
        ["outreach-milestone-may-05", createdEventBody.item.id].includes(item.eventId),
      ),
    );
  });
});
