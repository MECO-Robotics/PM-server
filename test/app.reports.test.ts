import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMemberInsights,
  parseDateValue,
} from "../src/routes/helpers/rosterInsightsMemberMetrics";
import { buildRosterInsights } from "../src/routes/helpers/rosterInsights";
import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("parseDateValue rejects invalid calendar YYYY-MM-DD values", () => {
  const validDate = parseDateValue("2026-02-28");
  assert.ok(validDate);
  assert.equal(validDate?.toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(
    parseDateValue("0099-12-31")?.toISOString(),
    "0099-12-31T00:00:00.000Z",
  );
  assert.equal(parseDateValue("2026-02-30"), null);
  assert.equal(parseDateValue("2026-13-01"), null);
});

test("buildMemberInsights includes same-day timestamps and excludes future attendance", () => {
  const today = new Date("2026-05-01T00:00:00Z");
  const tomorrow = new Date("2026-05-02T00:00:00Z");
  const members = buildMemberInsights({
    source: {
      members: [
        {
          id: "ava",
          name: "Ava",
          role: "student",
          disciplineId: "design",
        },
      ],
      projects: [],
      tasks: [],
      attendanceRecords: [
        {
          id: "attendance-present",
          memberId: "ava",
          date: "2026-04-30",
          totalHours: 2,
        },
        {
          id: "attendance-same-day-timestamp",
          memberId: "ava",
          date: "2026-05-01T12:00:00Z",
          totalHours: 3,
        },
        {
          id: "attendance-future",
          memberId: "ava",
          date: "2026-05-03",
          totalHours: 5,
        },
      ],
    },
    openTasks: [],
    openTaskBlockerIds: new Set<string>(),
    projectsById: new Map(),
    day7Start: new Date("2026-04-24T00:00:00Z"),
    day14Start: new Date("2026-04-17T00:00:00Z"),
    day30Start: new Date("2026-04-01T00:00:00Z"),
    today,
    attendanceUpperBound: tomorrow,
    dueSoonEnd: new Date("2026-05-08T00:00:00Z"),
  });

  assert.equal(members.length, 1);
  assert.equal(members[0].attendanceHoursLast7Days, 5);
  assert.equal(members[0].attendanceHoursLast14Days, 5);
  assert.equal(members[0].attendanceHoursLast30Days, 5);
  assert.equal(members[0].attendanceSessionsLast30Days, 2);
});

test("buildRosterInsights includes same-day timestamps and excludes future attendance", () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  const response = buildRosterInsights({
    members: [
      {
        id: "ava",
        name: "Ava",
        role: "student",
        disciplineId: "design",
      },
    ],
    projects: [],
    tasks: [],
    attendanceRecords: [
      {
        id: "attendance-today",
        memberId: "ava",
        date: todayKey,
        totalHours: 2,
      },
      {
        id: "attendance-today-timestamp",
        memberId: "ava",
        date: `${todayKey}T12:00:00Z`,
        totalHours: 1.5,
      },
      {
        id: "attendance-future",
        memberId: "ava",
        date: tomorrowKey,
        totalHours: 5,
      },
    ],
  });

  assert.deepEqual(response.attendanceTimeline, [
    {
      date: todayKey,
      totalHours: 3.5,
      memberCount: 1,
    },
  ]);
  assert.deepEqual(
    response.recentAttendance.map((record) => record.id),
    ["attendance-today-timestamp", "attendance-today"],
  );
});

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

    const legacyDependencyCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-dependencies",
      payload: {
        upstreamTaskId: "intake-guard",
        downstreamTaskId: "swerve-sensor-bundle",
        dependencyType: "blocks",
      },
    });

    assert.equal(legacyDependencyCreateResponse.statusCode, 201);
    const legacyDependencyBody = legacyDependencyCreateResponse.json() as {
      item: {
        id: string;
        dependencyType: string;
        refId: string;
        taskId: string;
      };
    };
    assert.equal(legacyDependencyBody.item.taskId, "swerve-sensor-bundle");
    assert.equal(legacyDependencyBody.item.refId, "intake-guard");
    assert.equal(legacyDependencyBody.item.dependencyType, "hard");

    resetLimits();

    const legacyDependencyUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/task-dependencies/${legacyDependencyBody.item.id}`,
      payload: {
        dependencyType: "finish_to_start",
      },
    });

    assert.equal(legacyDependencyUpdateResponse.statusCode, 200);
    assert.equal(legacyDependencyUpdateResponse.json().item.dependencyType, "hard");

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
      bootstrapBody.taskDependencies.some(
        (dependency) =>
          dependency.id === legacyDependencyBody.item.id &&
          dependency.taskId === "swerve-sensor-bundle" &&
          dependency.refId === "intake-guard" &&
          dependency.dependencyType === "hard",
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

test("seeded list endpoints and auth fallbacks stay healthy on mock data", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const seasonsResponse = await app.inject({
      method: "GET",
      url: "/api/seasons?pageSize=60",
    });
    assert.equal(seasonsResponse.statusCode, 200);
    const seasonsBody = seasonsResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(seasonsBody.pagination.pageSize, 60);
    assert.ok(seasonsBody.items.some((season) => season.id === "default-season"));

    resetLimits();

    const membersResponse = await app.inject({
      method: "GET",
      url: "/api/members?pageSize=60",
    });
    assert.equal(membersResponse.statusCode, 200);
    const membersBody = membersResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(membersBody.pagination.pageSize, 60);
    assert.ok(membersBody.items.some((member) => member.id === "ava"));

    resetLimits();

    const materialsResponse = await app.inject({
      method: "GET",
      url: "/api/materials?pageSize=60",
    });
    assert.equal(materialsResponse.statusCode, 200);
    const materialsBody = materialsResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(materialsBody.pagination.pageSize, 60);
    assert.ok(materialsBody.items.some((material) => material.id === "mat-onyx-filament"));

    resetLimits();

    const partDefinitionsResponse = await app.inject({
      method: "GET",
      url: "/api/part-definitions?pageSize=60",
    });
    assert.equal(partDefinitionsResponse.statusCode, 200);
    const partDefinitionsBody = partDefinitionsResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(partDefinitionsBody.pagination.pageSize, 60);
    assert.ok(
      partDefinitionsBody.items.some((partDefinition) => partDefinition.id === "pd-swerve-encoder-bracket"),
    );

    resetLimits();

    const partInstancesResponse = await app.inject({
      method: "GET",
      url: "/api/part-instances?pageSize=60",
    });
    assert.equal(partInstancesResponse.statusCode, 200);
    const partInstancesBody = partInstancesResponse.json() as {
      items: Array<{ id: string; name: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(partInstancesBody.pagination.pageSize, 60);
    assert.ok(
      partInstancesBody.items.some((partInstance) => partInstance.id === "pi-swerve-encoder-bracket-front-left"),
    );

    resetLimits();

    const milestonesResponse = await app.inject({
      method: "GET",
      url: "/api/milestones?pageSize=60",
    });
    assert.equal(milestonesResponse.statusCode, 200);
    const milestonesBody = milestonesResponse.json() as {
      items: Array<{ id: string; title: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(milestonesBody.pagination.pageSize, 60);
    assert.ok(milestonesBody.items.some((milestone) => milestone.id === "outreach-milestone-may-05"));

    resetLimits();

    const reportsResponse = await app.inject({
      method: "GET",
      url: "/api/reports?pageSize=60",
    });
    assert.equal(reportsResponse.statusCode, 200);
    const reportsBody = reportsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(reportsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(reportsBody.items));

    resetLimits();

    const reportFindingsResponse = await app.inject({
      method: "GET",
      url: "/api/report-findings?pageSize=60",
    });
    assert.equal(reportFindingsResponse.statusCode, 200);
    const reportFindingsBody = reportFindingsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(reportFindingsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(reportFindingsBody.items));

    resetLimits();

    const testResultsResponse = await app.inject({
      method: "GET",
      url: "/api/test-results?pageSize=60",
    });
    assert.equal(testResultsResponse.statusCode, 200);
    const testResultsBody = testResultsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(testResultsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(testResultsBody.items));

    resetLimits();

    const risksResponse = await app.inject({
      method: "GET",
      url: "/api/risks?pageSize=60",
    });
    assert.equal(risksResponse.statusCode, 200);
    const risksBody = risksResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(risksBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(risksBody.items));

    resetLimits();

    const iterationsResponse = await app.inject({
      method: "GET",
      url: "/api/iterations?pageSize=60",
    });
    assert.equal(iterationsResponse.statusCode, 200);
    const iterationsBody = iterationsResponse.json() as {
      items: Array<{ id: string; iteration: number }>;
      pagination: { pageSize: number };
    };
    assert.equal(iterationsBody.pagination.pageSize, 60);
    assert.ok(iterationsBody.items.length > 0);

    resetLimits();

    const findingsResponse = await app.inject({
      method: "GET",
      url: "/api/findings?pageSize=60",
    });
    assert.equal(findingsResponse.statusCode, 200);
    const findingsBody = findingsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(findingsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(findingsBody.items));

    resetLimits();

    const taskTargetsResponse = await app.inject({
      method: "GET",
      url: "/api/task-targets?pageSize=60",
    });
    assert.equal(taskTargetsResponse.statusCode, 200);
    const taskTargetsBody = taskTargetsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(taskTargetsBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(taskTargetsBody.items));

    resetLimits();

    const manufacturingResponse = await app.inject({
      method: "GET",
      url: "/api/manufacturing?pageSize=60",
    });
    assert.equal(manufacturingResponse.statusCode, 200);
    const manufacturingBody = manufacturingResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(manufacturingBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(manufacturingBody.items));

    resetLimits();

    const purchasesResponse = await app.inject({
      method: "GET",
      url: "/api/purchases?pageSize=60",
    });
    assert.equal(purchasesResponse.statusCode, 200);
    const purchasesBody = purchasesResponse.json() as {
      items: Array<{ id: string }>;
      pagination: { pageSize: number };
    };
    assert.equal(purchasesBody.pagination.pageSize, 60);
    assert.ok(Array.isArray(purchasesBody.items));

    resetLimits();

    const meetingsResponse = await app.inject({
      method: "GET",
      url: "/api/meetings",
    });
    assert.equal(meetingsResponse.statusCode, 200);
    const meetingsBody = meetingsResponse.json() as {
      attendance: Array<{ id: string }>;
      meetings: Array<{ id: string }>;
      workLogs: Array<{ id: string }>;
    };
    assert.ok(meetingsBody.meetings.length > 0);
    assert.ok(meetingsBody.attendance.length > 0);
    assert.ok(meetingsBody.workLogs.length > 0);

    resetLimits();

    const rosterSummarySubsystemCreateResponse = await app.inject({
      method: "POST",
      url: "/api/subsystems",
      payload: {
        name: "Roster Insights Dedupe Subsystem",
        description: "Temporary subsystem for roster insights coverage.",
        parentSubsystemId: "manipulator",
        responsibleEngineerId: "ava",
        mentorIds: ["riley"],
        risks: [],
      },
    });
    assert.equal(rosterSummarySubsystemCreateResponse.statusCode, 201);
    const rosterSummarySubsystemBody = rosterSummarySubsystemCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const rosterSummaryTaskCreateResponse = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Roster summary dedupe task",
        summary: "Ensures roster summary task counts stay deduplicated.",
        subsystemId: rosterSummarySubsystemBody.item.id,
        disciplineId: "design",
        requirementId: null,
        mechanismId: null,
        partInstanceId: null,
        targetMilestoneId: null,
        ownerId: "ava",
        assigneeIds: ["ava", "priya"],
        mentorId: "riley",
        dueDate: "2026-04-01",
        priority: "high",
        status: "waiting-for-qa",
        dependencyIds: [],
        blockers: [],
        linkedManufacturingIds: [],
        linkedPurchaseIds: [],
        estimatedHours: 2,
        actualHours: 0,
      },
    });
    assert.equal(rosterSummaryTaskCreateResponse.statusCode, 201);
    const rosterSummaryTaskBody = rosterSummaryTaskCreateResponse.json() as {
      item: {
        id: string;
      };
    };

    resetLimits();

    const rosterSummaryBlockerCreateResponse = await app.inject({
      method: "POST",
      url: "/api/task-blockers",
      payload: {
        blockedTaskId: rosterSummaryTaskBody.item.id,
        blockerType: "external",
        blockerId: null,
        description: "Scoped blocker for roster summary dedupe coverage.",
        severity: "high",
        status: "open",
        createdByMemberId: "ava",
      },
    });
    assert.equal(rosterSummaryBlockerCreateResponse.statusCode, 201);

    resetLimits();

    const rosterInsightsResponse = await app.inject({
      method: "GET",
      url: "/api/roster/insights?seasonId=default-season&projectId=project-robot-2026",
    });
    assert.equal(rosterInsightsResponse.statusCode, 200);
    const rosterInsightsBody = rosterInsightsResponse.json() as {
      attendanceTimeline: Array<{ date: string; memberCount: number; totalHours: number }>;
      members: Array<{
        activeTaskCount: number;
        availabilityStatus: "available" | "at-risk" | "overloaded" | "unavailable";
        memberId: string;
      }>;
      recentAttendance: Array<{ activeTaskCount: number; id: string; memberId: string }>;
      summary: {
        attendanceHoursLast14Days: number;
        blockedTaskCount: number;
        memberCount: number;
        openTaskCount: number;
        overdueTaskCount: number;
        waitingForQaTaskCount: number;
      };
    };
    assert.ok(rosterInsightsBody.members.length > 0);
    assert.ok(
      rosterInsightsBody.members.some((member) =>
        ["available", "at-risk", "overloaded", "unavailable"].includes(
          member.availabilityStatus,
        ),
      ),
    );
    assert.equal(typeof rosterInsightsBody.summary.openTaskCount, "number");
    assert.equal(typeof rosterInsightsBody.summary.blockedTaskCount, "number");
    assert.equal(typeof rosterInsightsBody.summary.attendanceHoursLast14Days, "number");
    assert.ok(Array.isArray(rosterInsightsBody.recentAttendance));
    assert.ok(Array.isArray(rosterInsightsBody.attendanceTimeline));
    assert.ok(
      rosterInsightsBody.summary.blockedTaskCount <=
        rosterInsightsBody.summary.openTaskCount,
    );
    assert.ok(
      rosterInsightsBody.summary.waitingForQaTaskCount <=
        rosterInsightsBody.summary.openTaskCount,
    );
    assert.ok(
      rosterInsightsBody.summary.overdueTaskCount <=
        rosterInsightsBody.summary.openTaskCount,
    );
    const scopedMemberIds = new Set(
      rosterInsightsBody.members.map((member) => member.memberId),
    );
    assert.ok(
      rosterInsightsBody.recentAttendance.every((record) =>
        scopedMemberIds.has(record.memberId),
      ),
    );

    resetLimits();

    const qaResponse = await app.inject({
      method: "GET",
      url: "/api/qa",
    });
    assert.equal(qaResponse.statusCode, 200);
    const qaBody = qaResponse.json() as {
      mentorBackedPasses: number;
      reviews: Array<{ id: string }>;
    };
    assert.ok(qaBody.reviews.length > 0);
    assert.ok(qaBody.mentorBackedPasses >= 0);

    resetLimits();

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/api/metrics",
    });
    assert.equal(metricsResponse.statusCode, 200);
    const metricsBody = metricsResponse.json() as {
      attendanceHours: number;
      completionRate: number;
      mechanismMetrics: Array<unknown>;
      subsystemMetrics: Array<unknown>;
    };
    assert.equal(typeof metricsBody.completionRate, "number");
    assert.equal(typeof metricsBody.attendanceHours, "number");
    assert.ok(metricsBody.subsystemMetrics.length > 0);
    assert.ok(metricsBody.mechanismMetrics.length > 0);

    resetLimits();

    const googleAuthResponse = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        credential: "mock-google-credential",
      },
    });
    assert.equal(googleAuthResponse.statusCode, 503);
    assert.equal(
      googleAuthResponse.json().message,
      "Google sign-in is not configured on the server yet.",
    );

    resetLimits();

    const emailStartResponse = await app.inject({
      method: "POST",
      url: "/api/auth/email/start",
      payload: {
        email: "tester@mecorobotics.org",
      },
    });
    assert.equal(emailStartResponse.statusCode, 503);
    assert.equal(
      emailStartResponse.json().message,
      "Email sign-in is not configured on the server yet.",
    );

    resetLimits();

    const emailVerifyResponse = await app.inject({
      method: "POST",
      url: "/api/auth/email/verify",
      payload: {
        email: "tester@mecorobotics.org",
        code: "123456",
      },
    });
    assert.equal(emailVerifyResponse.statusCode, 503);
    assert.equal(
      emailVerifyResponse.json().message,
      "Email sign-in is not configured on the server yet.",
    );
  });
});
