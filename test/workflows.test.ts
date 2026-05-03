import assert from "node:assert/strict";
import { test } from "node:test";

import { snapshot as initialSnapshot } from "../src/data/mockData";
import {
  buildDashboard,
  buildMetrics,
  evaluateTaskCompletion,
  formatTaskStatus,
} from "../src/domain/workflows";
import type {
  AttendanceRecord,
  Meeting,
  Material,
  PlatformSnapshot,
  PurchaseItem,
  QaReview,
  Task,
  WorkLog,
} from "../src/domain/types";

function makeTask(overrides: Partial<Task> = {}) {
  const baseTask: Task = {
    id: "task-a",
    projectId: "default-season-robot",
    workstreamId: null,
    workstreamIds: [],
    title: "Drive calibration",
    summary: "Validate encoder calibration before practice.",
    subsystemId: "drive",
    subsystemIds: ["drive"],
    disciplineId: "design",
    mechanismId: null,
    mechanismIds: [],
    partInstanceId: null,
    partInstanceIds: [],
    artifactId: null,
    artifactIds: [],
    targetMilestoneId: null,
    ownerId: "ava",
    assigneeIds: ["ava"],
    mentorId: "jordan",
    startDate: "2026-04-01",
    dueDate: "2026-04-05",
    priority: "critical",
    status: "in-progress",
    dependencyIds: [],
    blockers: [],
    linkedManufacturingIds: [],
    linkedPurchaseIds: [],
    estimatedHours: 4,
    actualHours: 1,
    requiresDocumentation: false,
    documentationLinked: false,
  };

  const mergedTask = {
    ...baseTask,
    ...overrides,
  } as Task;

  return {
    ...mergedTask,
    workstreamIds:
      overrides.workstreamIds ??
      (mergedTask.workstreamId ? [mergedTask.workstreamId] : []),
    subsystemIds: overrides.subsystemIds ?? [mergedTask.subsystemId],
    mechanismIds:
      overrides.mechanismIds ??
      (mergedTask.mechanismId ? [mergedTask.mechanismId] : []),
    partInstanceIds:
      overrides.partInstanceIds ??
      (mergedTask.partInstanceId ? [mergedTask.partInstanceId] : []),
  };
}

function makeWorkflowSnapshot() {
  const snapshot = structuredClone(initialSnapshot) as PlatformSnapshot;
  const partDefinitionId = snapshot.partDefinitions[0]?.id ?? "part-def-a";

  snapshot.tasks = [
    makeTask({
      mechanismId: "drive-shaft",
      mechanismIds: ["drive-shaft"],
      status: "waiting-for-qa",
      priority: "critical",
      requiresDocumentation: true,
      documentationLinked: false,
      estimatedHours: 4,
      actualHours: 3,
    }),
    makeTask({
      id: "task-b",
      title: "Controls firmware",
      subsystemId: "controls",
      disciplineId: "programming",
      ownerId: "ethan",
      mentorId: "riley",
      status: "complete",
      priority: "medium",
      requiresDocumentation: false,
      documentationLinked: false,
      estimatedHours: 2,
      actualHours: 2,
    }),
    makeTask({
      id: "task-c",
      title: "Controls integration",
      subsystemId: "controls",
      disciplineId: "testing",
      ownerId: "ethan",
      mentorId: "riley",
      status: "in-progress",
      priority: "high",
      dependencyIds: ["task-a"],
      blockers: ["Waiting on parts"],
      requiresDocumentation: false,
      documentationLinked: false,
      estimatedHours: 6,
      actualHours: 1,
    }),
  ];

  snapshot.mechanisms = [
    {
      id: "drive-shaft",
      subsystemId: "drive",
      name: "Drive shaft",
      description: "Transfers torque to the wheels.",
      iteration: 1,
      isArchived: false,
    },
    {
      id: "controls-io",
      subsystemId: "controls",
      name: "Controls IO",
      description: "Sensor and telemetry interface.",
      iteration: 1,
      isArchived: false,
    },
  ];

  snapshot.partInstances = [
    {
      id: "part-instance-a",
      subsystemId: "drive",
      mechanismId: "drive-shaft",
      partDefinitionId,
      name: "Drive shaft assembly",
      quantity: 1,
      trackIndividually: true,
      status: "ready",
    },
  ];

  snapshot.workLogs = [
    {
      id: "log-a",
      taskId: "task-a",
      date: "2026-04-02",
      hours: 5,
      participantIds: ["ava", "jordan"],
      notes: "Calibration and notebook evidence.",
    } satisfies WorkLog,
    {
      id: "log-b",
      taskId: "task-c",
      date: "2026-04-03",
      hours: 2,
      participantIds: ["ethan"],
      notes: "Integration troubleshooting.",
    } satisfies WorkLog,
  ];

  snapshot.qaReviews = [
    {
      id: "qa-a",
      subjectId: "task-a",
      subjectType: "task",
      subjectTitle: "Drive calibration",
      participantIds: ["ava", "jordan"],
      result: "pass",
      mentorApproved: true,
      notes: "Calibration approved for the next practice block.",
      reviewedAt: "2026-04-03",
    } satisfies QaReview,
  ];

  snapshot.materials = [
    {
      id: "mat-1",
      name: "1/8 Polycarbonate Sheet",
      category: "plastic",
      unit: "sheet",
      onHandQuantity: 1,
      reorderPoint: 2,
      location: "Shelf A1",
      vendor: "McMaster-Carr",
      notes: "Guard stock.",
    } satisfies Material,
    {
      id: "mat-2",
      name: "M3 Hardware Kit",
      category: "hardware",
      unit: "kit",
      onHandQuantity: 5,
      reorderPoint: 5,
      location: "Hardware drawers",
      vendor: "Grainger",
      notes: "Fastener kit.",
    } satisfies Material,
    {
      id: "mat-3",
      name: "12 AWG Wire",
      category: "consumable",
      unit: "ft",
      onHandQuantity: 6,
      reorderPoint: 2,
      location: "Wire rack",
      vendor: "Online Metals",
      notes: "Power routing stock.",
    } satisfies Material,
  ];

  snapshot.purchaseItems = [
    {
      id: "purchase-a",
      title: "Polycarbonate sheet",
      subsystemId: "manipulator",
      requestedById: "lucas",
      partDefinitionId: null,
      quantity: 2,
      vendor: "McMaster",
      linkLabel: "mcmaster.com/8560K239",
      estimatedCost: 82,
      approvedByMentor: true,
      status: "delivered",
    } satisfies PurchaseItem,
    {
      id: "purchase-b",
      title: "Ferrule refill kit",
      subsystemId: "drive",
      requestedById: "priya",
      partDefinitionId: null,
      quantity: 1,
      vendor: "AutomationDirect",
      linkLabel: "automationdirect.com/ferrules",
      estimatedCost: 39,
      approvedByMentor: false,
      status: "requested",
    } satisfies PurchaseItem,
  ];

  snapshot.attendanceRecords = [
    {
      id: "att-1",
      memberId: "ava",
      date: "2026-04-02",
      totalHours: 2,
    } satisfies AttendanceRecord,
    {
      id: "att-2",
      memberId: "jordan",
      date: "2026-04-02",
      totalHours: 3,
    } satisfies AttendanceRecord,
  ];

  snapshot.meetings = [
    {
      id: "meeting-1",
      title: "Planning",
      date: "2026-04-04",
      time: "7:00 PM",
      rsvpsYes: 6,
      rsvpsMaybe: 1,
      openSignIns: 2,
    } satisfies Meeting,
  ];

  snapshot.escalations = [
    {
      title: "Parts delayed",
      detail: "Waiting on a vendor shipment.",
      severity: "medium",
    },
  ];

  return snapshot;
}

test("evaluateTaskCompletion reports missing gate conditions and a passing path", () => {
  const snapshot = makeWorkflowSnapshot();
  const task = snapshot.tasks.find((candidate) => candidate.id === "task-a");

  assert.ok(task);

  const missingResult = evaluateTaskCompletion(task, snapshot);

  assert.equal(missingResult.canFinalize, false);
  assert.deepEqual(missingResult.missing, ["notebook or documentation evidence"]);
  assert.equal(missingResult.workLogCount, 1);
  assert.equal(missingResult.qaReviewCount, 1);

  const passingSnapshot = structuredClone(snapshot) as PlatformSnapshot;
  const passingTask = passingSnapshot.tasks.find(
    (candidate) => candidate.id === "task-a",
  );

  assert.ok(passingTask);

  passingTask.documentationLinked = true;

  const passingResult = evaluateTaskCompletion(passingTask, passingSnapshot);

  assert.equal(passingResult.canFinalize, true);
  assert.deepEqual(passingResult.missing, []);
});

test("buildDashboard summarizes the snapshot into actionable cards", () => {
  const snapshot = makeWorkflowSnapshot();
  const dashboard = buildDashboard(snapshot);

  assert.deepEqual(dashboard.summary, {
    openTasks: 2,
    waitingForQa: 1,
    blocked: 1,
    trackedHours: 7,
    nextMeeting: snapshot.meetings[0],
  });
  assert.deepEqual(dashboard.nextTasks, [
    {
      id: "task-a",
      title: "Drive calibration",
      status: "waiting-for-qa",
      priority: "critical",
    },
  ]);

  const driveCard = dashboard.subsystemCards.find(
    (card) => card.id === "drive",
  );
  const controlsCard = dashboard.subsystemCards.find(
    (card) => card.id === "controls",
  );

  assert.equal(driveCard?.completionRate, 0);
  assert.equal(driveCard?.activeTasks, 1);
  assert.equal(controlsCard?.completionRate, 0.5);
  assert.equal(controlsCard?.activeTasks, 1);
  assert.deepEqual(dashboard.escalations, snapshot.escalations);
});

test("buildMetrics aggregates progress, stock, and activity totals", () => {
  const snapshot = makeWorkflowSnapshot();
  const metrics = buildMetrics(snapshot);

  assert.equal(metrics.completionRate, 0.33);
  assert.equal(metrics.averageTrackedHoursPerTask, 2.33);
  assert.equal(metrics.qaPasses, 1);
  assert.equal(metrics.deliveredPurchases, 1);
  assert.equal(metrics.lowStockMaterials, 2);
  assert.equal(metrics.trackedMaterials, 3);
  assert.equal(metrics.waitingForQa, 1);
  assert.equal(metrics.blockerCount, 1);
  assert.equal(metrics.attendanceHours, 5);
  assert.equal(metrics.subsystemMetrics.length, 9);
  assert.equal(metrics.mechanismMetrics.length, 2);

  const driveSubsystem = metrics.subsystemMetrics.find((metric) => metric.id === "drive");
  const driveMechanism = metrics.mechanismMetrics.find((metric) => metric.id === "drive-shaft");

  assert.deepEqual(driveSubsystem, {
    id: "drive",
    name: "Drivetrain",
    projectId: "project-robot-2026",
    taskCount: 1,
    activeTaskCount: 1,
    completeTaskCount: 0,
    waitingForQaCount: 1,
    blockerCount: 0,
    plannedHours: 4,
    loggedHours: 5,
    completionRate: 0,
    qaPassCount: 1,
    mechanismCount: 1,
  });

  assert.deepEqual(driveMechanism, {
    id: "drive-shaft",
    name: "Drive shaft",
    subsystemId: "drive",
    subsystemName: "Drivetrain",
    taskCount: 1,
    activeTaskCount: 1,
    completeTaskCount: 0,
    waitingForQaCount: 1,
    blockerCount: 0,
    plannedHours: 4,
    loggedHours: 5,
    completionRate: 0,
    qaPassCount: 1,
    partInstanceCount: 1,
  });
});

test("formatTaskStatus renders the public labels", () => {
  assert.equal(formatTaskStatus("not-started"), "Not Started");
  assert.equal(formatTaskStatus("in-progress"), "In Progress");
  assert.equal(formatTaskStatus("waiting-for-qa"), "QA");
  assert.equal(formatTaskStatus("complete"), "Complete");
});
