import assert from "node:assert/strict";
import { test } from "node:test";

import { resetRequestLimits } from "../src/security/requestLimits";

test("buildApp serves health and public auth config without auth enabled", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousAuthJwtSecret = process.env.AUTH_JWT_SECRET;
  const previousGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const previousEmailHost = process.env.AUTH_EMAIL_SMTP_HOST;
  const previousEmailFrom = process.env.AUTH_EMAIL_FROM;
  const previousCorsOrigin = process.env.CORS_ORIGIN;
  const previousApiRateLimitMaxRequests = process.env.API_RATE_LIMIT_MAX_REQUESTS;
  const previousApiRateLimitWindowSeconds = process.env.API_RATE_LIMIT_WINDOW_SECONDS;
  const previousAuthRateLimitMaxRequests = process.env.AUTH_RATE_LIMIT_MAX_REQUESTS;
  const previousAuthRateLimitWindowSeconds = process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS;
  const previousAuthEmailRateLimitMaxRequests =
    process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS;
  const previousAuthEmailRateLimitWindowSeconds =
    process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS;

  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public";
  delete process.env.CORS_ORIGIN;
  delete process.env.AUTH_JWT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.AUTH_EMAIL_SMTP_HOST;
  delete process.env.AUTH_EMAIL_FROM;
  process.env.API_RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.API_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS = "60";

  const { buildApp } = await import("../src/app");
  const app = await buildApp();

  try {
    resetRequestLimits();

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(healthResponse.statusCode, 200);

    const healthBody = healthResponse.json() as {
      service: string;
      status: string;
      timestamp: string;
    };
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.service, "meco-platform");
    assert.equal(Number.isNaN(Date.parse(healthBody.timestamp)), false);

    const authConfigResponse = await app.inject({
      method: "GET",
      url: "/api/auth/config",
    });

    assert.equal(authConfigResponse.statusCode, 200);
    assert.deepEqual(authConfigResponse.json(), {
      enabled: false,
      googleClientId: null,
      hostedDomain: "mecorobotics.org",
      emailEnabled: false,
      devBypassAvailable: false,
    });
    assert.equal(authConfigResponse.headers["cache-control"], "no-store");
    assert.equal(authConfigResponse.headers["pragma"], "no-cache");
    assert.equal(authConfigResponse.headers["x-content-type-options"], "nosniff");
    assert.equal(authConfigResponse.headers["x-frame-options"], "DENY");
    assert.equal(authConfigResponse.headers["referrer-policy"], "no-referrer");

    const authConfigRateLimitedResponse = await app.inject({
      method: "GET",
      url: "/api/auth/config",
    });

    assert.equal(authConfigRateLimitedResponse.statusCode, 429);

    const dashboardResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    assert.equal(dashboardResponse.statusCode, 200);

    const dashboardRateLimitedResponse = await app.inject({
      method: "GET",
      url: "/api/dashboard",
    });

    assert.equal(dashboardRateLimitedResponse.statusCode, 429);

    resetRequestLimits();

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
        iteration: number;
        materialId: string | null;
      };
    };
    assert.equal(partDefinitionBody.item.iteration, 4);
    assert.equal(partDefinitionBody.item.materialId, "mat-onyx-filament");
    assert.equal(partDefinitionBody.item.description, "Created from the app test suite.");

    resetRequestLimits();

    const partDefinitionIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/part-definitions/${partDefinitionBody.item.id}`,
      payload: {
        iteration: 5,
      },
    });

    assert.equal(partDefinitionIterationUpdateResponse.statusCode, 200);
    assert.equal(partDefinitionIterationUpdateResponse.json().item.iteration, 5);

    resetRequestLimits();

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

    resetRequestLimits();

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

    resetRequestLimits();

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
        iteration: number;
      };
    };
    assert.equal(childSubsystemBody.item.iteration, 2);

    resetRequestLimits();

    const childSubsystemIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/subsystems/${childSubsystemBody.item.id}`,
      payload: {
        iteration: 3,
      },
    });

    assert.equal(childSubsystemIterationUpdateResponse.statusCode, 200);
    assert.equal(childSubsystemIterationUpdateResponse.json().item.iteration, 3);

    resetRequestLimits();

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
        iteration: number;
      };
    };
    assert.equal(mechanismBody.item.iteration, 2);

    resetRequestLimits();

    const mechanismIterationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/mechanisms/${mechanismBody.item.id}`,
      payload: {
        iteration: 3,
      },
    });

    assert.equal(mechanismIterationUpdateResponse.statusCode, 200);
    assert.equal(mechanismIterationUpdateResponse.json().item.iteration, 3);

    resetRequestLimits();

    const cyclicSubsystemResponse = await app.inject({
      method: "PATCH",
      url: "/api/subsystems/manipulator",
      payload: {
        parentSubsystemId: childSubsystemBody.item.id,
      },
    });

    assert.equal(cyclicSubsystemResponse.statusCode, 400);
    assert.match(
      cyclicSubsystemResponse.json().message as string,
      /cycle|descendant/i,
    );

    resetRequestLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      artifacts: Array<{
        id: string;
        kind: string;
        projectId: string;
        workstreamId: string | null;
      }>;
      attendanceRecords: Array<{
        id: string;
        memberId: string;
      }>;
      escalations: Array<{
        title: string;
      }>;
      manufacturingItems: Array<{
        batchLabel?: string;
        id: string;
        partDefinitionId: string | null;
        process: string;
        qaReviewCount: number;
        status: string;
        title: string;
      }>;
      meetings: Array<{
        id: string;
      }>;
      qaReviews: Array<{
        id: string;
        subjectId: string;
      }>;
      workLogs: Array<{
        id: string;
        participantIds: string[];
        taskId: string;
      }>;
    };

    const seededFabricationItem = bootstrapBody.manufacturingItems.find(
      (item) => item.id === "frame-weldment",
    );
    assert.ok(seededFabricationItem);
    assert.equal(seededFabricationItem?.process, "fabrication");
    assert.equal(seededFabricationItem?.partDefinitionId, null);
    assert.equal(seededFabricationItem?.batchLabel, "FAB-03");
    const seededManufacturingQaItem = bootstrapBody.manufacturingItems.find(
      (item) => item.id === "sensor-bracket",
    );
    assert.equal(seededManufacturingQaItem?.qaReviewCount, 1);
    assert.ok(bootstrapBody.meetings.some((meeting) => meeting.id === "design-review"));
    assert.ok(
      bootstrapBody.attendanceRecords.some((record) => record.id === "att-1"),
    );
    assert.ok(bootstrapBody.qaReviews.some((review) => review.id === "qa-1"));
    assert.ok(bootstrapBody.escalations.length > 0);
    const seededOperationsArtifact = bootstrapBody.artifacts.find(
      (artifact) => artifact.id === "artifact-sponsor-recap-apr",
    );
    assert.ok(seededOperationsArtifact);
    assert.equal(seededOperationsArtifact?.projectId, "project-operations-2026");
    assert.equal(seededOperationsArtifact?.kind, "nontechnical");
    assert.ok(bootstrapBody.workLogs.some((workLog) => workLog.id === "log-1"));

    resetRequestLimits();

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

    resetRequestLimits();

    const artifactsResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts",
    });

    assert.equal(artifactsResponse.statusCode, 200);
    const artifactsBody = artifactsResponse.json() as {
      items: Array<{
        id: string;
        kind: string;
        projectId: string;
        title: string;
      }>;
    };
    assert.ok(
      artifactsBody.items.some(
        (artifact) =>
          artifact.id === "artifact-event-volunteer-guide" &&
          artifact.projectId === "project-operations-2026" &&
          artifact.kind === "document",
      ),
    );

    resetRequestLimits();

    const createWorkstreamResponse = await app.inject({
      method: "POST",
      url: "/api/workstreams",
      payload: {
        projectId: "project-operations-2026",
        name: "Awards",
        description: "Awards submission workflow.",
      },
    });

    assert.equal(createWorkstreamResponse.statusCode, 201);
    const createWorkstreamBody = createWorkstreamResponse.json() as {
      item: {
        id: string;
        projectId: string;
        name: string;
      };
    };
    assert.equal(createWorkstreamBody.item.id, "awards");
    assert.equal(createWorkstreamBody.item.projectId, "project-operations-2026");

    resetRequestLimits();

    const workstreamsResponse = await app.inject({
      method: "GET",
      url: "/api/workstreams?pageSize=60",
    });

    assert.equal(workstreamsResponse.statusCode, 200);
    const workstreamsBody = workstreamsResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    assert.ok(
      workstreamsBody.items.some(
        (workstream) => workstream.id === createWorkstreamBody.item.id,
      ),
    );

    resetRequestLimits();

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

    resetRequestLimits();

    const updateRobotProjectResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${createRobotProjectBody.item.id}`,
      payload: {
        name: "Practice Bot V2",
      },
    });

    assert.equal(updateRobotProjectResponse.statusCode, 200);
    assert.equal(updateRobotProjectResponse.json().item.name, "Practice Bot V2");

    resetRequestLimits();

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

    resetRequestLimits();

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

    resetRequestLimits();

    const mobileTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Mobile task payload",
        summary: "Created from the mobile app's compact task draft.",
        subsystemId: mobileSubsystemCreatedBody.item.id,
        disciplineId: "mechanical",
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

    resetRequestLimits();

    const multiTargetTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        projectId: "project-robot-2026",
        workstreamIds: ["workstream-drive", "workstream-controls"],
        title: "Multi-target task payload",
        summary: "Created with multiple linked workstreams, subsystems, mechanisms, and parts.",
        subsystemIds: ["drive", "controls"],
        disciplineId: "mechanical",
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
      },
    });

    assert.equal(multiTargetTaskCreateResponse.statusCode, 201);
    const multiTargetTaskCreatedBody = multiTargetTaskCreateResponse.json() as {
      item: {
        id: string;
        workstreamId: string | null;
        workstreamIds: string[];
        subsystemId: string;
        subsystemIds: string[];
        mechanismId: string | null;
        mechanismIds: string[];
        partInstanceId: string | null;
        partInstanceIds: string[];
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

    resetRequestLimits();

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

    resetRequestLimits();

    const mobileManufacturingUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/manufacturing/${mobileManufacturingCreatedBody.item.id}`,
      payload: {
        inHouse: true,
      },
    });

    assert.equal(mobileManufacturingUpdateResponse.statusCode, 200);
    const mobileManufacturingUpdatedBody =
      mobileManufacturingUpdateResponse.json() as {
        item: {
          inHouse: boolean;
        };
      };
    assert.equal(mobileManufacturingUpdatedBody.item.inHouse, true);

    resetRequestLimits();

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
          partInstanceId: string | null;
          partInstanceIds: string[];
        };
      };
    assert.equal(
      targetedManufacturingCreatedBody.item.partInstanceId,
      "pi-swerve-encoder-bracket-front-left",
    );
    assert.deepEqual(targetedManufacturingCreatedBody.item.partInstanceIds, [
      "pi-swerve-encoder-bracket-front-left",
    ]);

    resetRequestLimits();

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

    resetRequestLimits();

    const paginatedArtifactsResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts?page=2&pageSize=30",
    });

    assert.equal(paginatedArtifactsResponse.statusCode, 200);
    const paginatedArtifactsBody = paginatedArtifactsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    };
    assert.equal(paginatedArtifactsBody.pagination.pageSize, 30);
    assert.equal(paginatedArtifactsBody.pagination.page, 1);
    assert.equal(paginatedArtifactsBody.pagination.totalPages >= 1, true);
    assert.equal(
      paginatedArtifactsBody.pagination.totalItems >= paginatedArtifactsBody.items.length,
      true,
    );
    assert.equal(paginatedArtifactsBody.pagination.hasPreviousPage, false);

    resetRequestLimits();

    const invalidPageSizeArtifactsResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts?pageSize=99",
    });

    assert.equal(invalidPageSizeArtifactsResponse.statusCode, 200);
    const invalidPageSizeArtifactsBody = invalidPageSizeArtifactsResponse.json() as {
      pagination: {
        pageSize: number;
      };
    };
    assert.equal(invalidPageSizeArtifactsBody.pagination.pageSize, 15);

    resetRequestLimits();

    const createArtifactResponse = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: {
        projectId: "project-operations-2026",
        workstreamId: "workstream-operations-comms",
        kind: "nontechnical",
        title: "Parent Night Summary",
        summary: "Highlights from mentor and parent orientation night.",
        status: "draft",
        link: "https://example.org/meco/parent-night-summary",
      },
    });

    assert.equal(createArtifactResponse.statusCode, 201);
    const createdArtifactBody = createArtifactResponse.json() as {
      item: {
        id: string;
        kind: string;
        projectId: string;
        status: string;
        title: string;
        updatedAt: string;
        workstreamId: string | null;
      };
    };
    assert.equal(createdArtifactBody.item.projectId, "project-operations-2026");
    assert.equal(createdArtifactBody.item.workstreamId, "workstream-operations-comms");
    assert.equal(createdArtifactBody.item.kind, "nontechnical");
    assert.equal(createdArtifactBody.item.status, "draft");
    assert.equal(
      Number.isNaN(Date.parse(createdArtifactBody.item.updatedAt)),
      false,
    );

    resetRequestLimits();

    const updateArtifactResponse = await app.inject({
      method: "PATCH",
      url: `/api/artifacts/${createdArtifactBody.item.id}`,
      payload: {
        kind: "document",
        status: "published",
        title: "Parent Night Summary Final",
      },
    });

    assert.equal(updateArtifactResponse.statusCode, 200);
    const updatedArtifactBody = updateArtifactResponse.json() as {
      item: {
        kind: string;
        status: string;
        title: string;
      };
    };
    assert.equal(updatedArtifactBody.item.kind, "document");
    assert.equal(updatedArtifactBody.item.status, "published");
    assert.equal(updatedArtifactBody.item.title, "Parent Night Summary Final");

    resetRequestLimits();

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
      },
    });

    assert.equal(createEventResponse.statusCode, 201);
    const createdEventBody = createEventResponse.json() as {
      item: {
        id: string;
        projectIds: string[];
        relatedSubsystemIds: string[];
      };
    };
    assert.deepEqual(createdEventBody.item.projectIds, [
      "project-robot-2026",
      "project-operations-2026",
    ]);
    assert.deepEqual(createdEventBody.item.relatedSubsystemIds, ["drive", "operations"]);

    resetRequestLimits();

    const updateEventResponse = await app.inject({
      method: "PATCH",
      url: `/api/events/${createdEventBody.item.id}`,
      payload: {
        projectIds: ["project-outreach-2026"],
        relatedSubsystemIds: ["outreach"],
      },
    });

    assert.equal(updateEventResponse.statusCode, 200);
    const updatedEventBody = updateEventResponse.json() as {
      item: {
        projectIds: string[];
        relatedSubsystemIds: string[];
      };
    };
    assert.deepEqual(updatedEventBody.item.projectIds, ["project-outreach-2026"]);
    assert.deepEqual(updatedEventBody.item.relatedSubsystemIds, ["outreach"]);

    resetRequestLimits();

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
      },
    });

    assert.equal(unknownProjectResponse.statusCode, 400);

    resetRequestLimits();

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
      },
    });

    assert.equal(mismatchedSubsystemResponse.statusCode, 400);

    resetRequestLimits();

    const deleteArtifactResponse = await app.inject({
      method: "DELETE",
      url: `/api/artifacts/${createdArtifactBody.item.id}`,
    });

    assert.equal(deleteArtifactResponse.statusCode, 200);

    resetRequestLimits();

    const artifactsAfterDeleteResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts",
    });

    assert.equal(artifactsAfterDeleteResponse.statusCode, 200);
    const artifactsAfterDeleteBody = artifactsAfterDeleteResponse.json() as {
      items: Array<{ id: string }>;
    };
    assert.equal(
      artifactsAfterDeleteBody.items.some(
        (artifact) => artifact.id === createdArtifactBody.item.id,
      ),
      false,
    );

    resetRequestLimits();

    const workLogCreateResponse = await app.inject({
      method: "POST",
      url: "/api/work-logs",
      payload: {
        taskId: "swerve-sensor-bundle",
        date: "2026-04-23",
        hours: 1.5,
        participantIds: ["priya", "lucas"],
        notes: "Route test work log",
      },
    });

    assert.equal(workLogCreateResponse.statusCode, 201);
    const workLogCreatedBody = workLogCreateResponse.json() as {
      item: {
        date: string;
        hours: number;
        id: string;
        notes: string;
        participantIds: string[];
        taskId: string;
      };
    };
    assert.equal(workLogCreatedBody.item.taskId, "swerve-sensor-bundle");
    assert.equal(workLogCreatedBody.item.hours, 1.5);
    assert.deepEqual(workLogCreatedBody.item.participantIds, ["priya", "lucas"]);
    assert.equal(workLogCreatedBody.item.notes, "Route test work log");

    resetRequestLimits();

    const filteredBootstrapAfterWorkLogResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?personId=priya",
    });

    assert.equal(filteredBootstrapAfterWorkLogResponse.statusCode, 200);
    const filteredBootstrapAfterWorkLogBody = filteredBootstrapAfterWorkLogResponse.json() as {
      workLogs: Array<{
        id: string;
        notes: string;
        participantIds: string[];
      }>;
    };
    const createdWorkLog = filteredBootstrapAfterWorkLogBody.workLogs.find(
      (workLog) => workLog.notes === "Route test work log",
    );
    assert.ok(createdWorkLog);
    assert.deepEqual(createdWorkLog?.participantIds, ["priya", "lucas"]);

    resetRequestLimits();

    const workLogUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/work-logs/${workLogCreatedBody.item.id}`,
      payload: {
        hours: 2,
        participantIds: ["lucas"],
        notes: "Route test work log updated from mobile",
      },
    });

    assert.equal(workLogUpdateResponse.statusCode, 200);
    const workLogUpdatedBody = workLogUpdateResponse.json() as {
      item: {
        hours: number;
        notes: string;
        participantIds: string[];
      };
    };
    assert.equal(workLogUpdatedBody.item.hours, 2);
    assert.equal(workLogUpdatedBody.item.notes, "Route test work log updated from mobile");
    assert.deepEqual(workLogUpdatedBody.item.participantIds, ["lucas"]);

    resetRequestLimits();

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

    resetRequestLimits();

    const fabricationUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/manufacturing/${fabricationCreatedBody.item.id}`,
      payload: {
        title: "Custom Welded Intake Frame Rev B",
        status: "in-progress",
      },
    });

    assert.equal(fabricationUpdateResponse.statusCode, 200);
    const fabricationUpdatedBody = fabricationUpdateResponse.json() as {
      item: {
        partDefinitionId: string | null;
        process: string;
        status: string;
        title: string;
      };
    };
    assert.equal(fabricationUpdatedBody.item.process, "fabrication");
    assert.equal(fabricationUpdatedBody.item.partDefinitionId, null);
    assert.equal(fabricationUpdatedBody.item.title, "Custom Welded Intake Frame Rev B");
    assert.equal(fabricationUpdatedBody.item.status, "in-progress");

    resetRequestLimits();

    const bootstrapAfterUpdateResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapAfterUpdateResponse.statusCode, 200);
    const bootstrapAfterUpdateBody = bootstrapAfterUpdateResponse.json() as {
      manufacturingItems: Array<{
        id: string;
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

    resetRequestLimits();

    const mobileTaskDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${mobileTaskCreatedBody.item.id}`,
    });

    assert.equal(mobileTaskDeleteResponse.statusCode, 200);
    assert.equal(mobileTaskDeleteResponse.json().item.id, mobileTaskCreatedBody.item.id);

    resetRequestLimits();

    const mobileWorkLogDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/work-logs/${workLogCreatedBody.item.id}`,
    });

    assert.equal(mobileWorkLogDeleteResponse.statusCode, 200);
    assert.equal(mobileWorkLogDeleteResponse.json().item.id, workLogCreatedBody.item.id);

    resetRequestLimits();

    const mobileManufacturingDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/manufacturing/${mobileManufacturingCreatedBody.item.id}`,
    });

    assert.equal(mobileManufacturingDeleteResponse.statusCode, 200);
    assert.equal(
      mobileManufacturingDeleteResponse.json().item.id,
      mobileManufacturingCreatedBody.item.id,
    );

    resetRequestLimits();

    const mobilePurchaseDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/purchases/${mobilePurchaseCreatedBody.item.id}`,
    });

    assert.equal(mobilePurchaseDeleteResponse.statusCode, 200);
    assert.equal(
      mobilePurchaseDeleteResponse.json().item.id,
      mobilePurchaseCreatedBody.item.id,
    );

    resetRequestLimits();

    const mobileSubsystemDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/subsystems/${mobileSubsystemCreatedBody.item.id}`,
    });

    assert.equal(mobileSubsystemDeleteResponse.statusCode, 200);
    assert.equal(
      mobileSubsystemDeleteResponse.json().item.id,
      mobileSubsystemCreatedBody.item.id,
    );
  } finally {
    await app.close();
    resetRequestLimits();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousAuthJwtSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = previousAuthJwtSecret;
    }

    if (previousGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = previousGoogleClientId;
    }

    if (previousEmailHost === undefined) {
      delete process.env.AUTH_EMAIL_SMTP_HOST;
    } else {
      process.env.AUTH_EMAIL_SMTP_HOST = previousEmailHost;
    }

    if (previousEmailFrom === undefined) {
      delete process.env.AUTH_EMAIL_FROM;
    } else {
      process.env.AUTH_EMAIL_FROM = previousEmailFrom;
    }

    if (previousCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = previousCorsOrigin;
    }

    if (previousApiRateLimitMaxRequests === undefined) {
      delete process.env.API_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.API_RATE_LIMIT_MAX_REQUESTS = previousApiRateLimitMaxRequests;
    }

    if (previousApiRateLimitWindowSeconds === undefined) {
      delete process.env.API_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.API_RATE_LIMIT_WINDOW_SECONDS = previousApiRateLimitWindowSeconds;
    }

    if (previousAuthRateLimitMaxRequests === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = previousAuthRateLimitMaxRequests;
    }

    if (previousAuthRateLimitWindowSeconds === undefined) {
      delete process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = previousAuthRateLimitWindowSeconds;
    }

    if (previousAuthEmailRateLimitMaxRequests === undefined) {
      delete process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.AUTH_EMAIL_RATE_LIMIT_MAX_REQUESTS =
        previousAuthEmailRateLimitMaxRequests;
    }

    if (previousAuthEmailRateLimitWindowSeconds === undefined) {
      delete process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS =
        previousAuthEmailRateLimitWindowSeconds;
    }
  }
});
