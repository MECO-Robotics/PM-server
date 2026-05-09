import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function readRepoFile(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assertIncludesAll(source: string, snippets: string[], label: string) {
  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `${label} is missing: ${snippet}`);
  }
}

function assertOrdered(source: string, earlier: string, later: string, label: string) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  assert.ok(earlierIndex >= 0, `${label} is missing: ${earlier}`);
  assert.ok(laterIndex >= 0, `${label} is missing: ${later}`);
  assert.ok(earlierIndex < laterIndex, `${label} has unexpected order: ${earlier} then ${later}`);
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
  assert.equal(metrics.subsystemMetrics.length, snapshot.subsystems.length);
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

test("deploy workflow keeps schema push ahead of milestone normalization", () => {
  const composeFile = readRepoFile("docker-compose.prod.yml");
  assertOrdered(
    composeFile,
    "npm run prisma:deploy:accept-data-loss",
    "npm run prisma:normalize-event-types",
    "deploy compose command",
  );
  assertIncludesAll(
    composeFile,
    [
      'sh -c "if [ -z \\"$${DATABASE_URL:-}\\" ]; then',
      'export DATABASE_URL=\\"postgresql://$${POSTGRES_USER}:$${POSTGRES_PASSWORD}@postgres:5432/$${POSTGRES_DB}?schema=public\\"',
      'wget -qO- http://127.0.0.1:8080/health || exit 1',
    ],
    "production compose file",
  );
});

test("deploy workflow validates secrets and retains the app health gate", () => {
  const deployWorkflow = readRepoFile(".github/workflows/deploy-vps.yml");

  assertIncludesAll(
    deployWorkflow,
    [
      "deploy-source-gate",
      "- validate",
      "environment:",
      "name: production",
      "Validate deploy secrets",
      "Missing required deploy secret(s):",
      "Backup existing VPS server deployment",
      "Production deploy is allowed only from main, release-* tags, or a release manifest.",
      "set -euo pipefail",
      "curl --fail --silent http://127.0.0.1:8080/health",
      "Health check passed.",
      "Application never became healthy.",
      "docker compose --env-file .env.production -f docker-compose.prod.yml logs app --tail=200 || true",
      "docker compose --env-file .env.production -f docker-compose.prod.yml ps",
    ],
    "deploy workflow",
  );
});

test("deploy bootstrap script guards Linux-only execution and installs prerequisites", () => {
  const bootstrapScript = readRepoFile("deploy/bootstrap-vps.sh");

  assertIncludesAll(
    bootstrapScript,
    [
      "set -euo pipefail",
      'if [[ "$(uname -s)" != "Linux" ]]; then',
      "This bootstrap script is intended for Ubuntu on the VPS.",
      "apt-get install -y ca-certificates curl gnupg rsync",
      "docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
      'if [[ "${EUID}" -ne 0 ]]; then',
      'usermod -aG docker "$USER"',
    ],
    "bootstrap script",
  );
});

test("ci workflow watches deploy artifacts and runs the full validation matrix", () => {
  const ciWorkflow = readRepoFile(".github/workflows/ci.yml");

  assertIncludesAll(
    ciWorkflow,
    [
      "workflow_dispatch:",
      "pull_request:",
      "- development",
      "- main",
      "push:",
      '"feature/**"',
      '"fix/**"',
      '"hotfix/**"',
      "branch-model",
      '".github/workflows/deploy-vps.yml"',
      '"deploy/**"',
      '"docker-compose.prod.yml"',
      '"Dockerfile"',
      '".dockerignore"',
      '"tsconfig.test.json"',
      '"test/**"',
      "npm ci",
      "npm run typecheck:test",
      "npm run verify",
      "npx prisma validate",
      "snapshot-validate",
      "cross-repo-production-gate",
    ],
    "ci workflow",
  );
});
