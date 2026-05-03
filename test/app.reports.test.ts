import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("qa report and milestone report endpoints support create flows with link validation", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const qaReportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/qa-reports",
      payload: {
        taskId: "swerve-sensor-bundle",
        participantIds: ["priya", "lucas", "priya"],
        result: "minor-fix",
        mentorApproved: false,
        notes: "  QA report from web form  ",
        reviewedAt: "2026-04-25",
        photoUrl: "https://cdn.example.test/forms/qa-report.png",
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
        photoUrl: string;
      };
    };
    assert.equal(qaReportCreatedBody.item.taskId, "swerve-sensor-bundle");
    assert.deepEqual(qaReportCreatedBody.item.participantIds, ["priya", "lucas"]);
    assert.equal(qaReportCreatedBody.item.result, "minor-fix");
    assert.equal(qaReportCreatedBody.item.mentorApproved, false);
    assert.equal(qaReportCreatedBody.item.notes, "QA report from web form");
    assert.equal(qaReportCreatedBody.item.reviewedAt, "2026-04-25");
    assert.equal(
      qaReportCreatedBody.item.photoUrl,
      "https://cdn.example.test/forms/qa-report.png",
    );

    resetLimits();

    const qaReportInvalidTaskResponse = await app.inject({
      method: "POST",
      url: "/api/qa-reports",
      payload: {
        taskId: "missing-task",
        participantIds: ["priya"],
        result: "pass",
        mentorApproved: true,
        notes: "Invalid task linkage",
        reviewedAt: "2026-04-25",
      },
    });

    assert.equal(qaReportInvalidTaskResponse.statusCode, 400);
    assert.equal(
      qaReportInvalidTaskResponse.json().message,
      "The selected task does not exist.",
    );

    resetLimits();

    const milestoneReportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/test-results",
      payload: {
        milestoneId: "outreach-milestone-may-05",
        title: "Milestone report route test",
        status: "pass",
        findings: ["Drive team aligned", "Drive team aligned", "Checklist complete"],
        photoUrl: "https://cdn.example.test/forms/milestone-report.png",
      },
    });

    assert.equal(milestoneReportCreateResponse.statusCode, 201);
    const milestoneReportCreatedBody = milestoneReportCreateResponse.json() as {
      item: {
        milestoneId: string;
        findings: string[];
        id: string;
        status: string;
        title: string;
        photoUrl: string;
      };
    };
    assert.equal(milestoneReportCreatedBody.item.milestoneId, "outreach-milestone-may-05");
    assert.equal(milestoneReportCreatedBody.item.title, "Milestone report route test");
    assert.equal(milestoneReportCreatedBody.item.status, "pass");
    assert.equal(
      milestoneReportCreatedBody.item.photoUrl,
      "https://cdn.example.test/forms/milestone-report.png",
    );
    assert.deepEqual(milestoneReportCreatedBody.item.findings, [
      "Drive team aligned",
      "Checklist complete",
    ]);

    resetLimits();

    const milestoneReportInvalidMilestoneResponse = await app.inject({
      method: "POST",
      url: "/api/test-results",
      payload: {
        milestoneId: "missing-milestone",
        title: "Invalid milestone linkage",
        status: "blocked",
        findings: ["No milestone match"],
        photoUrl: "https://cdn.example.test/forms/milestone-report-invalid.png",
      },
    });

    assert.equal(milestoneReportInvalidMilestoneResponse.statusCode, 400);
    assert.equal(
      milestoneReportInvalidMilestoneResponse.json().message,
      "The selected milestone does not exist.",
    );
  });
});

test("web report and task planning contract endpoints persist records", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const reportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "QA",
        projectId: "project-robot-2026",
        taskId: "swerve-sensor-bundle",
        milestoneId: null,
        workstreamId: null,
        createdByMemberId: "ava",
        result: "minor-fix",
        summary: "QA report contract route",
        notes: "QA report contract route",
        photoUrl: "https://cdn.example.test/report.png",
        createdAt: "2026-04-26",
        participantIds: ["ava"],
        mentorApproved: false,
        reviewedAt: "2026-04-26",
      },
    });

    assert.equal(reportCreateResponse.statusCode, 201);
    const reportBody = reportCreateResponse.json() as {
      item: {
        id: string;
        reportType: string;
        taskId: string | null;
      };
    };
    assert.equal(reportBody.item.reportType, "QA");
    assert.equal(reportBody.item.taskId, "swerve-sensor-bundle");

    resetLimits();

    const unsupportedReportCreateResponse = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        reportType: "Practice",
        projectId: "project-robot-2026",
        taskId: null,
        milestoneId: "drive-practice-apr-30",
        workstreamId: null,
        createdByMemberId: "ava",
        result: "pass",
        summary: "Unsupported report type",
        notes: "",
        createdAt: "2026-04-26",
      },
    });

    assert.equal(unsupportedReportCreateResponse.statusCode, 400);

    resetLimits();

    const findingCreateResponse = await app.inject({
      method: "POST",
      url: "/api/report-findings",
      payload: {
        reportId: reportBody.item.id,
        mechanismId: null,
        partInstanceId: "pi-swerve-encoder-bracket-front-left",
        artifactInstanceId: null,
        issueType: "Bracket needs edge cleanup",
        severity: "medium",
        notes: "Deburr the bracket before final install.",
        spawnedTaskId: null,
        spawnedIterationId: null,
        spawnedRiskId: null,
      },
    });

    assert.equal(findingCreateResponse.statusCode, 201);
    assert.equal(findingCreateResponse.json().item.reportId, reportBody.item.id);

    resetLimits();

    const dependencyCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-dependencies",
      payload: {
        taskId: "swerve-sensor-bundle",
        kind: "task",
        refId: "intake-guard",
        dependencyType: "hard",
      },
    });

    assert.equal(dependencyCreateResponse.statusCode, 201);
    const dependencyBody = dependencyCreateResponse.json() as {
      item: {
        id: string;
        dependencyType: string;
      };
    };
    assert.equal(dependencyBody.item.dependencyType, "hard");

    resetLimits();

    const dependencyUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/task-dependencies/${dependencyBody.item.id}`,
      payload: {
        dependencyType: "soft",
      },
    });

    assert.equal(dependencyUpdateResponse.statusCode, 200);
    assert.equal(dependencyUpdateResponse.json().item.dependencyType, "soft");

    resetLimits();

    const softDependencyCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-dependencies",
      payload: {
        taskId: "pit-bin-labeling",
        kind: "task",
        refId: "pit-board-refresh",
        dependencyType: "soft",
      },
    });

    assert.equal(softDependencyCreateResponse.statusCode, 201);
    const softDependencyBody = softDependencyCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const invalidBlockerCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-blockers",
      payload: {
        blockedTaskId: "swerve-sensor-bundle",
        blockerType: "task",
        blockerId: "not-a-real-task",
        description: "Invalid linked task",
        severity: "high",
        status: "open",
        createdByMemberId: "ava",
      },
    });

    assert.equal(invalidBlockerCreateResponse.statusCode, 400);
    assert.equal(
      invalidBlockerCreateResponse.json().message,
      "The selected blocker task does not exist.",
    );

    resetLimits();

    const blockerCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-blockers",
      payload: {
        blockedTaskId: "swerve-sensor-bundle",
        blockerType: "external",
        blockerId: null,
        description: "Waiting for replacement encoder stock.",
        severity: "high",
        status: "open",
        createdByMemberId: "ava",
      },
    });

    assert.equal(blockerCreateResponse.statusCode, 201);
    const blockerBody = blockerCreateResponse.json() as {
      item: {
        id: string;
        severity: string;
      };
    };
    assert.equal(blockerBody.item.severity, "high");

    resetLimits();

    const blockerUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/task-blockers/${blockerBody.item.id}`,
      payload: {
        description: "Waiting for replacement encoder stock and mentor review.",
        severity: "critical",
      },
    });

    assert.equal(blockerUpdateResponse.statusCode, 200);
    assert.equal(blockerUpdateResponse.json().item.severity, "critical");

    resetLimits();

    const taskDependenciesResponse = await app.inject({
      method: "GET",
      url: "/api/task-dependencies",
    });
    assert.equal(taskDependenciesResponse.statusCode, 200);
    assert.ok(
      (taskDependenciesResponse.json() as { items: Array<{ id: string }> }).items.some(
        (dependency) => dependency.id === dependencyBody.item.id,
      ),
    );

    resetLimits();

    const taskBlockersResponse = await app.inject({
      method: "GET",
      url: "/api/task-blockers",
    });
    assert.equal(taskBlockersResponse.statusCode, 200);
    assert.ok(
      (taskBlockersResponse.json() as { items: Array<{ id: string }> }).items.some(
        (blocker) => blocker.id === blockerBody.item.id,
      ),
    );

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      reportFindings: Array<{ reportId: string }>;
      reports: Array<{ id: string }>;
      taskBlockers: Array<{ id: string; severity: string }>;
      taskDependencies: Array<{
        taskId: string;
        kind: string;
        refId: string;
        dependencyType: string;
        id: string;
      }>;
    };
    assert.ok(bootstrapBody.reports.some((report) => report.id === reportBody.item.id));
    assert.ok(
      bootstrapBody.reportFindings.some((finding) => finding.reportId === reportBody.item.id),
    );
    assert.ok(
      bootstrapBody.taskDependencies.some(
        (dependency) =>
          dependency.id === dependencyBody.item.id &&
          dependency.dependencyType === "soft",
      ),
    );
    assert.ok(
      bootstrapBody.taskDependencies.some(
        (dependency) =>
          dependency.id === softDependencyBody.item.id &&
          dependency.dependencyType === "soft",
      ),
    );
    assert.ok(
      bootstrapBody.taskDependencies.some(
        (dependency) =>
          dependency.taskId === "pit-bin-labeling" &&
          dependency.refId === "pit-board-refresh" &&
          dependency.dependencyType === "soft",
      ),
    );
    assert.ok(
      bootstrapBody.taskBlockers.some(
        (blocker) => blocker.id === blockerBody.item.id && blocker.severity === "critical",
      ),
    );

    resetLimits();

    const dependencyDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/task-dependencies/${dependencyBody.item.id}`,
    });
    assert.equal(dependencyDeleteResponse.statusCode, 200);

    resetLimits();

    const softDependencyDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/task-dependencies/${softDependencyBody.item.id}`,
    });
    assert.equal(softDependencyDeleteResponse.statusCode, 200);

    resetLimits();

    const blockerDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/task-blockers/${blockerBody.item.id}`,
    });
    assert.equal(blockerDeleteResponse.statusCode, 200);
  });
});

test("risk endpoints support create, update, and delete with link validation", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const qaReportsResponse = await app.inject({
      method: "GET",
      url: "/api/qa-reports",
    });

    assert.equal(qaReportsResponse.statusCode, 200);
    const qaReportsBody = qaReportsResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    const sourceQaReportId = qaReportsBody.items[0]?.id ?? null;
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
