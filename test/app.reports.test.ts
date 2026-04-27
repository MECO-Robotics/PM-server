import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("qa report and event report endpoints support create flows with link validation", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      tasks: Array<{
        id: string;
        projectId: string;
        workstreamId: string | null;
      }>;
      events: Array<{
        id: string;
        projectIds: string[];
      }>;
      projects: Array<{
        id: string;
      }>;
    };
    const qaTask = bootstrapBody.tasks.find((task) => task.id === "swerve-sensor-bundle") ?? null;
    const eventRecord = bootstrapBody.events.find(
      (event) => event.id === "outreach-milestone-may-05",
    ) ?? null;

    resetLimits();

    const qaReportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "QA",
        projectId: qaTask?.projectId ?? bootstrapBody.projects[0]?.id ?? "",
        taskId: "swerve-sensor-bundle",
        eventId: null,
        workstreamId: qaTask?.workstreamId ?? null,
        createdByMemberId: null,
        result: "minor-fix",
        summary: "QA report from web form",
        participantIds: ["priya", "lucas", "priya"],
        mentorApproved: false,
        notes: "  QA report from web form  ",
        createdAt: "2026-04-25",
        reviewedAt: "2026-04-25",
        title: "",
        status: "pass",
        findings: [],
      },
    });

    assert.equal(qaReportCreateResponse.statusCode, 201);
    const qaReportCreatedBody = qaReportCreateResponse.json() as {
      item: {
        id: string;
        mentorApproved: boolean;
        notes: string;
        participantIds: string[];
        result: string;
        reviewedAt: string;
        taskId: string;
      };
    };
    assert.equal(qaReportCreatedBody.item.taskId, "swerve-sensor-bundle");
    assert.deepEqual(qaReportCreatedBody.item.participantIds, ["priya", "lucas"]);
    assert.equal(qaReportCreatedBody.item.result, "minor-fix");
    assert.equal(qaReportCreatedBody.item.mentorApproved, false);
    assert.equal(qaReportCreatedBody.item.notes, "QA report from web form");
    assert.equal(qaReportCreatedBody.item.reviewedAt, "2026-04-25");

    resetLimits();

    const qaReportInvalidTaskResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "QA",
        projectId: qaTask?.projectId ?? bootstrapBody.projects[0]?.id ?? "",
        taskId: "missing-task",
        eventId: null,
        workstreamId: null,
        createdByMemberId: null,
        result: "pass",
        summary: "Invalid task linkage",
        participantIds: ["priya"],
        mentorApproved: true,
        notes: "Invalid task linkage",
        createdAt: "2026-04-25",
        reviewedAt: "2026-04-25",
        title: "",
        status: "pass",
        findings: [],
      },
    });

    assert.equal(qaReportInvalidTaskResponse.statusCode, 400);
    assert.equal(
      qaReportInvalidTaskResponse.json().message,
      "The selected task does not exist.",
    );

    resetLimits();

    const eventReportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "EventTest",
        projectId: eventRecord?.projectIds[0] ?? bootstrapBody.projects[0]?.id ?? "",
        taskId: null,
        eventId: "outreach-milestone-may-05",
        workstreamId: null,
        createdByMemberId: null,
        result: "pass",
        summary: "Event report route test",
        title: "Event report route test",
        status: "pass",
        findings: ["Drive team aligned", "Drive team aligned", "Checklist complete"],
        notes: "Drive team aligned\nChecklist complete",
        createdAt: "2026-04-25",
        reviewedAt: "2026-04-25",
        participantIds: [],
        mentorApproved: false,
      },
    });

    assert.equal(eventReportCreateResponse.statusCode, 201);
    const eventReportCreatedBody = eventReportCreateResponse.json() as {
      item: {
        eventId: string;
        findings: string[];
        id: string;
        status: string;
        title: string;
      };
    };
    assert.equal(eventReportCreatedBody.item.eventId, "outreach-milestone-may-05");
    assert.equal(eventReportCreatedBody.item.title, "Event report route test");
    assert.equal(eventReportCreatedBody.item.status, "pass");
    assert.deepEqual(eventReportCreatedBody.item.findings, [
      "Drive team aligned",
      "Checklist complete",
    ]);

    resetLimits();

    const eventReportInvalidEventResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "EventTest",
        projectId: bootstrapBody.projects[0]?.id ?? "",
        taskId: null,
        eventId: "missing-event",
        workstreamId: null,
        createdByMemberId: null,
        result: "blocked",
        summary: "Invalid event linkage",
        title: "Invalid event linkage",
        status: "blocked",
        findings: ["No event match"],
        notes: "No event match",
        createdAt: "2026-04-25",
        reviewedAt: "2026-04-25",
        participantIds: [],
        mentorApproved: false,
      },
    });

    assert.equal(eventReportInvalidEventResponse.statusCode, 400);
    assert.equal(
      eventReportInvalidEventResponse.json().message,
      "The selected event does not exist.",
    );
  });
});

test("risk endpoints support create, update, and delete with link validation", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const qaReportsResponse = await app.inject({
      method: "GET",
      url: "/api/reports",
    });

    assert.equal(qaReportsResponse.statusCode, 200);
    const qaReportsBody = qaReportsResponse.json() as {
      items: Array<{
        id: string;
        reportType: string;
      }>;
    };
    const sourceQaReportId = qaReportsBody.items.find((item) => item.reportType === "QA")?.id ?? null;
    assert.ok(sourceQaReportId);

    resetLimits();

    const projectsResponse = await app.inject({
      method: "GET",
      url: "/api/projects",
    });

    assert.equal(projectsResponse.statusCode, 200);
    const projectsBody = projectsResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    const attachmentProjectId = projectsBody.items[0]?.id ?? null;
    assert.ok(attachmentProjectId);

    resetLimits();

    const tasksResponse = await app.inject({
      method: "GET",
      url: "/api/tasks",
    });

    assert.equal(tasksResponse.statusCode, 200);
    const tasksBody = tasksResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    const mitigationTaskId = tasksBody.items[0]?.id ?? null;
    assert.ok(mitigationTaskId);

    resetLimits();

    const createRiskResponse = await app.inject({
      method: "POST",
      url: "/api/risks",
      payload: {
        title: "Cable routing delay risk",
        detail: "Awaiting updated harness path confirmation from controls.",
        severity: "medium",
        sourceType: "qa-report",
        sourceId: sourceQaReportId,
        attachmentType: "project",
        attachmentId: attachmentProjectId,
        mitigationTaskId,
      },
    });

    assert.equal(createRiskResponse.statusCode, 201);
    const createdRiskBody = createRiskResponse.json() as {
      item: {
        attachmentId: string;
        attachmentType: string;
        id: string;
        mitigationTaskId: string | null;
        severity: string;
        sourceId: string;
        sourceType: string;
        title: string;
      };
    };
    assert.equal(createdRiskBody.item.title, "Cable routing delay risk");
    assert.equal(createdRiskBody.item.sourceType, "qa-report");
    assert.equal(createdRiskBody.item.sourceId, sourceQaReportId);
    assert.equal(createdRiskBody.item.attachmentType, "project");
    assert.equal(createdRiskBody.item.attachmentId, attachmentProjectId);
    assert.equal(createdRiskBody.item.mitigationTaskId, mitigationTaskId);

    resetLimits();

    const updateRiskResponse = await app.inject({
      method: "PATCH",
      url: `/api/risks/${createdRiskBody.item.id}`,
      payload: {
        severity: "high",
        mitigationTaskId: null,
      },
    });

    assert.equal(updateRiskResponse.statusCode, 200);
    const updatedRiskBody = updateRiskResponse.json() as {
      item: {
        mitigationTaskId: string | null;
        severity: string;
      };
    };
    assert.equal(updatedRiskBody.item.severity, "high");
    assert.equal(updatedRiskBody.item.mitigationTaskId, null);

    resetLimits();

    const invalidRiskResponse = await app.inject({
      method: "POST",
      url: "/api/risks",
      payload: {
        title: "Missing linkage",
        detail: "Should fail because source is missing.",
        severity: "low",
        sourceType: "qa-report",
        sourceId: "missing-qa-report",
        attachmentType: "project",
        attachmentId: attachmentProjectId,
        mitigationTaskId: null,
      },
    });

    assert.equal(invalidRiskResponse.statusCode, 400);
    assert.equal(
      invalidRiskResponse.json().message,
      "The selected QA report does not exist.",
    );

    resetLimits();

    const deleteRiskResponse = await app.inject({
      method: "DELETE",
      url: `/api/risks/${createdRiskBody.item.id}`,
    });

    assert.equal(deleteRiskResponse.statusCode, 200);
    assert.equal(deleteRiskResponse.json().item.id, createdRiskBody.item.id);

    resetLimits();

    const missingRiskResponse = await app.inject({
      method: "DELETE",
      url: `/api/risks/${createdRiskBody.item.id}`,
    });

    assert.equal(missingRiskResponse.statusCode, 404);
    assert.equal(missingRiskResponse.json().message, "Risk not found.");
  });
});
