import type {
  Milestone,
  MilestoneRequirement,
  Member,
  PlatformSnapshot,
  QaFinding,
  QaReport,
  TestFinding,
  TestResult,
  Task,
  TaskDependency,
} from "../../domain/types";
import { isTaskWaitingOnDependencies } from "../../domain/taskDependencyState";
import { uniqueIds } from "./taskTargets";

export interface BootstrapSelection {
  personId: string | null;
  seasonId: string | null;
  projectId: string | null;
}

export interface BootstrapReportRecord {
  id: string;
  reportType: "QA" | "MilestoneTest";
  projectId: string;
  taskId: string | null;
  milestoneId: string | null;
  workstreamId: string | null;
  createdByMemberId: string | null;
  result: string;
  summary: string;
  notes: string;
  createdAt: string;
  participantIds?: string[];
  mentorApproved?: boolean;
  reviewedAt?: string;
  title?: string;
  status?: "pass" | "fail" | "blocked";
  findings?: string[];
}

export interface BootstrapReportFindingRecord {
  id: string;
  reportId: string;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactInstanceId: string | null;
  issueType: string;
  severity: "high" | "medium" | "low";
  notes: string;
  spawnedTaskId: string | null;
  spawnedIterationId: string | null;
  spawnedRiskId: string | null;
  title?: string;
  detail?: string;
  status?: "open" | "resolved";
  projectId?: string;
  workstreamId?: string | null;
  subsystemId?: string | null;
  taskId?: string | null;
  milestoneId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BootstrapTaskDependencyRecord {
  id: string;
  taskId: string;
  kind: TaskDependency["kind"];
  refId: string;
  requiredState?: string;
  dependencyType: TaskDependency["dependencyType"];
  createdAt: string;
}

export interface BootstrapTaskBlockerRecord {
  id: string;
  blockedTaskId: string;
  blockerType: "external" | "internal";
  blockerId: string | null;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "resolved";
  createdByMemberId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function readScopedId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isMemberActiveInSeason(member: Pick<Member, "seasonId" | "activeSeasonIds">, seasonId: string) {
  return uniqueIds([...(member.activeSeasonIds ?? []), member.seasonId]).includes(seasonId);
}

function isPartDefinitionActiveInSeason(
  partDefinition: Pick<PlatformSnapshot["partDefinitions"][number], "seasonId" | "activeSeasonIds">,
  seasonId: string,
) {
  return uniqueIds([...(partDefinition.activeSeasonIds ?? []), partDefinition.seasonId]).includes(
    seasonId,
  );
}

function buildTaskDependencyRecords(tasks: Task[]) {
  return tasks.flatMap<BootstrapTaskDependencyRecord>((task) =>
    uniqueIds(task.dependencyIds).map((refId, dependencyIndex) => ({
      id: `${task.id}:dependency:${dependencyIndex + 1}`,
      taskId: task.id,
      kind: "task",
      refId,
      requiredState: "complete",
      dependencyType: "hard",
      createdAt: task.startDate,
    })),
  );
}

function normalizeTaskDependencyRecord(
  dependency: Partial<TaskDependency> & {
    upstreamTaskId?: string;
    downstreamTaskId?: string;
    dependencyType?: TaskDependency["dependencyType"] | "blocks" | "finish_to_start";
  },
): BootstrapTaskDependencyRecord {
  const kind = dependency.kind ?? "task";

  return {
    id: dependency.id ?? "",
    taskId: dependency.taskId ?? dependency.downstreamTaskId ?? "",
    kind,
    refId: dependency.refId ?? dependency.upstreamTaskId ?? "",
    requiredState: dependency.requiredState ?? (kind === "part_instance" ? "ready" : "complete"),
    dependencyType: dependency.dependencyType === "soft" ? "soft" : "hard",
    createdAt: dependency.createdAt ?? new Date().toISOString(),
  };
}

function buildTaskBlockerRecords(tasks: Task[]) {
  return tasks.flatMap<BootstrapTaskBlockerRecord>((task) =>
    task.blockers.map((description, blockerIndex) => ({
      id: `${task.id}:blocker:${blockerIndex + 1}`,
      blockedTaskId: task.id,
      blockerType: "external",
      blockerId: null,
      description,
      severity: "medium",
      status: "open",
      createdByMemberId: null,
      createdAt: task.startDate,
      resolvedAt: null,
    })),
  );
}

function buildReports(args: {
  qaReports: QaReport[];
  tasksById: Map<string, Task>;
  testResults: TestResult[];
  milestonesById: Map<string, Milestone>;
  activeProjectIds: Set<string>;
}) {
  const qaReports = args.qaReports
    .map<BootstrapReportRecord | null>((report) => {
      const task = args.tasksById.get(report.taskId);
      if (!task || !args.activeProjectIds.has(task.projectId)) {
        return null;
      }

      return {
        id: report.id,
        reportType: "QA",
        projectId: task.projectId,
        taskId: report.taskId,
        milestoneId: null,
        workstreamId: task.workstreamId,
        createdByMemberId: null,
        result: report.result,
        summary: report.notes,
        notes: report.notes,
        createdAt: report.reviewedAt,
        participantIds: report.participantIds,
        mentorApproved: report.mentorApproved,
        reviewedAt: report.reviewedAt,
        title: task.title,
      };
    })
    .filter((report): report is BootstrapReportRecord => report !== null);

  const milestoneTestReports = args.testResults
    .map<BootstrapReportRecord | null>((result) => {
      const milestone = args.milestonesById.get(result.milestoneId);
      const projectId =
        milestone?.projectIds.find((candidate) => args.activeProjectIds.has(candidate)) ??
        milestone?.projectIds[0] ??
        null;
      if (!projectId || !args.activeProjectIds.has(projectId)) {
        return null;
      }

      return {
        id: result.id,
        reportType: "MilestoneTest",
        projectId,
        taskId: null,
        milestoneId: result.milestoneId,
        workstreamId: null,
        createdByMemberId: null,
        result: result.status,
        summary: result.title,
        notes: result.findings.join("\n"),
        createdAt: milestone?.startDateTime.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        title: result.title,
        status: result.status,
        findings: result.findings,
      };
    })
    .filter((report): report is BootstrapReportRecord => report !== null);

  return [...qaReports, ...milestoneTestReports];
}

function buildReportFindings(args: {
  qaFindings: QaFinding[];
  testFindings: TestFinding[];
  reportIds: Set<string>;
}) {
  const qaFindings = args.qaFindings
    .map<BootstrapReportFindingRecord | null>((finding) => {
      if (!finding.qaReportId || !args.reportIds.has(finding.qaReportId)) {
        return null;
      }

      return {
        id: finding.id,
        reportId: finding.qaReportId,
        mechanismId: finding.mechanismId,
        partInstanceId: finding.partInstanceId,
        artifactInstanceId: finding.artifactId,
        issueType: finding.title,
        severity: finding.severity,
        notes: finding.detail,
        spawnedTaskId: finding.taskId,
        spawnedIterationId: null,
        spawnedRiskId: null,
        title: finding.title,
        detail: finding.detail,
        status: finding.status === "resolved" ? "resolved" : "open",
        projectId: finding.projectId,
        workstreamId: finding.workstreamId,
        subsystemId: finding.subsystemId,
        taskId: finding.taskId,
        createdAt: finding.createdAt,
        updatedAt: finding.updatedAt,
      };
    })
    .filter((finding): finding is BootstrapReportFindingRecord => finding !== null);

  const testFindings = args.testFindings
    .map<BootstrapReportFindingRecord | null>((finding) => {
      if (!finding.testResultId || !args.reportIds.has(finding.testResultId)) {
        return null;
      }

      return {
        id: finding.id,
        reportId: finding.testResultId,
        mechanismId: finding.mechanismId,
        partInstanceId: finding.partInstanceId,
        artifactInstanceId: finding.artifactId,
        issueType: finding.title,
        severity: finding.severity,
        notes: finding.detail,
        spawnedTaskId: finding.taskId,
        spawnedIterationId: null,
        spawnedRiskId: null,
        title: finding.title,
        detail: finding.detail,
        status: finding.status === "resolved" ? "resolved" : "open",
        projectId: finding.projectId,
        workstreamId: finding.workstreamId,
        subsystemId: finding.subsystemId,
        taskId: finding.taskId,
        milestoneId: finding.milestoneId,
        createdAt: finding.createdAt,
        updatedAt: finding.updatedAt,
      };
    })
    .filter((finding): finding is BootstrapReportFindingRecord => finding !== null);

  return [...qaFindings, ...testFindings];
}

export function buildBootstrapResponse(snapshot: PlatformSnapshot, selection: BootstrapSelection) {
  const seasonScopedProjects = selection.seasonId
    ? snapshot.projects.filter((project) => project.seasonId === selection.seasonId)
    : snapshot.projects;
  const selectedProjectIsValid =
    selection.projectId !== null &&
    seasonScopedProjects.some((project) => project.id === selection.projectId);
  const activeProjectIds = new Set(
    (selectedProjectIsValid
      ? seasonScopedProjects.filter((project) => project.id === selection.projectId)
      : seasonScopedProjects
    ).map((project) => project.id),
  );
  const scopedWorkstreams = snapshot.workstreams.filter((workstream) =>
    activeProjectIds.has(workstream.projectId),
  );
  const scopedWorkstreamIds = new Set(scopedWorkstreams.map((workstream) => workstream.id));
  const scopedSubsystems = snapshot.subsystems.filter((subsystem) =>
    activeProjectIds.has(subsystem.projectId),
  );
  const scopedSubsystemIds = new Set(scopedSubsystems.map((subsystem) => subsystem.id));
  const scopedMechanisms = snapshot.mechanisms.filter((mechanism) =>
    scopedSubsystemIds.has(mechanism.subsystemId),
  );
  const scopedMechanismIds = new Set(scopedMechanisms.map((mechanism) => mechanism.id));
  const scopedArtifacts = snapshot.artifacts.filter((artifact) =>
    activeProjectIds.has(artifact.projectId),
  );
  const scopedPartInstances = snapshot.partInstances.filter(
    (partInstance) =>
      scopedSubsystemIds.has(partInstance.subsystemId) &&
      (!partInstance.mechanismId || scopedMechanismIds.has(partInstance.mechanismId)),
  );
  const scopedPartInstanceIds = new Set(
    scopedPartInstances.map((partInstance) => partInstance.id),
  );
  const scopedMilestones = snapshot.milestones.filter((milestone) => {
    const milestoneProjectIds = milestone.projectIds ?? [];
    return milestoneProjectIds.length === 0
      ? true
      : milestoneProjectIds.some((projectId) => activeProjectIds.has(projectId));
  });
  const scopedMilestoneIds = new Set(scopedMilestones.map((milestone) => milestone.id));
  const scopedMilestonesById = new Map(scopedMilestones.map((milestone) => [milestone.id, milestone] as const));
  const scopedMilestoneRequirements = (snapshot.milestoneRequirements ?? []).filter((requirement) => {
    if (!scopedMilestoneIds.has(requirement.milestoneId)) {
      return false;
    }

    switch (requirement.targetType) {
      case "project":
        return activeProjectIds.has(requirement.targetId);
      case "subsystem":
        return scopedSubsystemIds.has(requirement.targetId);
      case "mechanism":
        return scopedMechanismIds.has(requirement.targetId);
      case "artifact":
        return scopedArtifacts.some((artifact) => artifact.id === requirement.targetId);
      case "part-instance":
        return scopedPartInstanceIds.has(requirement.targetId);
      case "workflow":
        // Not currently modeled in the seed store; allow requirements through for forward compatibility.
        return true;
    }
  });
  const scopedTasks = snapshot.tasks.filter(
    (task) =>
      activeProjectIds.has(task.projectId) &&
      (scopedSubsystemIds.has(task.subsystemId) ||
        task.subsystemIds.some((subsystemId) => scopedSubsystemIds.has(subsystemId))),
  );
  const scopedTaskIds = new Set(scopedTasks.map((task) => task.id));
  const scopedTasksById = new Map(scopedTasks.map((task) => [task.id, task] as const));
  const scopedWorkLogs = snapshot.workLogs.filter(
    (workLog) =>
      scopedTaskIds.has(workLog.taskId) &&
      (selection.personId === null || workLog.participantIds.includes(selection.personId)),
  );
  const scopedPurchaseItems = snapshot.purchaseItems.filter(
    (item) =>
      scopedSubsystemIds.has(item.subsystemId) &&
      (selection.personId === null || item.requestedById === selection.personId),
  );
  const scopedManufacturingItems = snapshot.manufacturingItems.filter(
    (item) =>
      scopedSubsystemIds.has(item.subsystemId) &&
      (selection.personId === null || item.requestedById === selection.personId),
  );
  const scopedManufacturingItemIds = new Set(
    scopedManufacturingItems.map((item) => item.id),
  );
  const scopedQaReports = snapshot.qaReports.filter((report) => {
    const task = scopedTasksById.get(report.taskId);
    return Boolean(task);
  });
  const scopedTestResults = snapshot.testResults.filter((result) => {
    const milestone = scopedMilestonesById.get(result.milestoneId);
    return Boolean(milestone);
  });
  const scopedReports = buildReports({
    qaReports: scopedQaReports,
    tasksById: scopedTasksById,
    testResults: scopedTestResults,
    milestonesById: scopedMilestonesById,
    activeProjectIds,
  });
  const scopedReportIds = new Set(scopedReports.map((report) => report.id));
  const scopedReportFindings = buildReportFindings({
    qaFindings: snapshot.qaFindings,
    testFindings: snapshot.testFindings,
    reportIds: scopedReportIds,
  });
  const scopedRisks = snapshot.risks.filter((risk) => {
    if (risk.attachmentType === "project" && !activeProjectIds.has(risk.attachmentId)) {
      return false;
    }

    if (risk.attachmentType === "workstream" && !scopedWorkstreamIds.has(risk.attachmentId)) {
      return false;
    }

    if (risk.mitigationTaskId && !scopedTaskIds.has(risk.mitigationTaskId)) {
      return false;
    }

    if (risk.sourceType === "qa-report" && !scopedReportIds.has(risk.sourceId)) {
      return false;
    }

    if (risk.sourceType === "test-result" && !scopedReportIds.has(risk.sourceId)) {
      return false;
    }

    return true;
  });
  const scopedExplicitTaskDependencies = snapshot.taskDependencies
    .map((dependency) => normalizeTaskDependencyRecord(dependency as Partial<TaskDependency>))
    .filter((dependency) => {
      if (!scopedTaskIds.has(dependency.taskId)) {
        return false;
      }

      if (dependency.kind === "task") {
        return scopedTaskIds.has(dependency.refId);
      }

      if (dependency.kind === "milestone") {
        return scopedMilestoneIds.has(dependency.refId);
      }

      if (dependency.kind === "part_instance") {
        return scopedPartInstanceIds.has(dependency.refId);
      }

      return false;
    });
  const explicitTaskDependencyKeys = new Set(
    scopedExplicitTaskDependencies.map(
      (dependency) => `${dependency.taskId}:${dependency.kind}:${dependency.refId}:${dependency.dependencyType}:${dependency.requiredState ?? ""}`,
    ),
  );
  const scopedTaskDependencies = [
    ...scopedExplicitTaskDependencies,
    ...buildTaskDependencyRecords(snapshot.tasks).filter(
      (dependency) =>
        scopedTaskIds.has(dependency.taskId) &&
        scopedTaskIds.has(dependency.refId) &&
        !explicitTaskDependencyKeys.has(
          `${dependency.taskId}:${dependency.kind}:${dependency.refId}:${dependency.dependencyType}:${dependency.requiredState ?? ""}`,
        ),
    ),
  ];
  const scopedExplicitTaskBlockers = snapshot.taskBlockers.filter((blocker) =>
    scopedTaskIds.has(blocker.blockedTaskId),
  );
  const explicitTaskBlockerKeys = new Set(
    scopedExplicitTaskBlockers.map(
      (blocker) => `${blocker.blockedTaskId}:${blocker.description}`,
    ),
  );
  const scopedTaskBlockers = [
    ...scopedExplicitTaskBlockers,
    ...buildTaskBlockerRecords(scopedTasks).filter(
      (blocker) =>
        !explicitTaskBlockerKeys.has(`${blocker.blockedTaskId}:${blocker.description}`),
    ),
  ];
  const scopedSnapshot = {
    ...snapshot,
    tasks: scopedTasks,
    taskDependencies: scopedTaskDependencies,
    taskBlockers: scopedTaskBlockers,
  } as PlatformSnapshot;
  const scopedQaReviews = snapshot.qaReviews.filter((review) => {
    if (review.subjectType === "task") {
      return scopedTaskIds.has(review.subjectId);
    }

    return scopedManufacturingItemIds.has(review.subjectId);
  });
  const manufacturingQaReviewCounts = new Map<string, number>();
  for (const review of snapshot.qaReviews) {
    if (review.subjectType !== "manufacturing") {
      continue;
    }

    manufacturingQaReviewCounts.set(
      review.subjectId,
      (manufacturingQaReviewCounts.get(review.subjectId) ?? 0) + 1,
    );
  }
  const selectedSeasonId = selection.seasonId;
  const scopedMembers = selectedSeasonId
    ? snapshot.members.filter((member) => isMemberActiveInSeason(member, selectedSeasonId))
    : snapshot.members;
  const scopedPartDefinitions = selectedSeasonId
    ? snapshot.partDefinitions.filter((partDefinition) =>
        isPartDefinitionActiveInSeason(partDefinition, selectedSeasonId),
      )
    : snapshot.partDefinitions;

  return {
    seasons: snapshot.seasons,
    projects: seasonScopedProjects,
    workstreams: scopedWorkstreams,
    members: scopedMembers,
    subsystems: scopedSubsystems,
    disciplines: snapshot.disciplines,
    mechanisms: scopedMechanisms,
    materials: snapshot.materials,
    artifacts: scopedArtifacts,
    partDefinitions: scopedPartDefinitions,
    partInstances: scopedPartInstances,
    milestones: scopedMilestones,
    milestoneRequirements: scopedMilestoneRequirements as MilestoneRequirement[],
    reports: scopedReports,
    reportFindings: scopedReportFindings,
    qaReports: scopedQaReports,
    testResults: scopedTestResults,
    risks: scopedRisks,
    tasks: scopedTasks.map((task) => ({
      ...task,
      isBlocked: scopedTaskBlockers.some(
        (blocker) => blocker.blockedTaskId === task.id && blocker.status === "open",
      ),
      isWaitingOnDependency: isTaskWaitingOnDependencies(task, scopedSnapshot),
    })),
    taskDependencies: scopedTaskDependencies,
    taskBlockers: scopedTaskBlockers,
    workLogs: scopedWorkLogs,
    meetings: snapshot.meetings,
    attendanceRecords: snapshot.attendanceRecords,
    manufacturingItems: scopedManufacturingItems.map((item) => ({
      ...item,
      qaReviewCount: manufacturingQaReviewCounts.get(item.id) ?? 0,
    })),
    purchaseItems: scopedPurchaseItems,
    qaReviews: scopedQaReviews,
    escalations: snapshot.escalations,
  };
}

export function readBootstrapSelection(query: unknown): BootstrapSelection {
  const candidate = query as {
    personId?: unknown;
    seasonId?: unknown;
    projectId?: unknown;
  } | null;

  return {
    personId: readScopedId(candidate?.personId),
    seasonId: readScopedId(candidate?.seasonId),
    projectId: readScopedId(candidate?.projectId),
  };
}
