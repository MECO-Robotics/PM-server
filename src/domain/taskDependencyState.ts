import type { MilestoneStatus, PlatformSnapshot, Task, TaskDependency } from "./types";

type LegacyTaskDependencyRecord = {
  id: string;
  upstreamTaskId: string;
  downstreamTaskId: string;
  dependencyType: "blocks" | "soft" | "finish_to_start";
  createdAt: string;
};

type DependencyLike = TaskDependency | LegacyTaskDependencyRecord | Partial<TaskDependency & LegacyTaskDependencyRecord>;

const MILESTONE_STATUS_ORDER: Record<MilestoneStatus, number> = {
  "not ready": 0,
  blocked: 1,
  qa: 2,
  ready: 3,
};

const PART_INSTANCE_STATUS_ORDER: Record<MilestoneStatus, number> = {
  "not ready": 0,
  blocked: 1,
  qa: 2,
  ready: 3,
};

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeDependencyRecord(dependency: DependencyLike, index: number): TaskDependency {
  const dependencyRecord = dependency as {
    id?: string;
    kind?: TaskDependency["kind"];
    taskId?: string;
    downstreamTaskId?: string;
    refId?: string;
    upstreamTaskId?: string;
    requiredState?: string;
    dependencyType?: TaskDependency["dependencyType"] | "blocks" | "finish_to_start";
    createdAt?: string;
  };
  const kind = dependencyRecord.kind ?? "task";
  const dependencyType = dependencyRecord.dependencyType === "soft" ? "soft" : "hard";
  const taskId = dependencyRecord.taskId ?? dependencyRecord.downstreamTaskId ?? "";
  const refId = dependencyRecord.refId ?? dependencyRecord.upstreamTaskId ?? "";

  return {
    id: dependencyRecord.id ?? `${taskId || "task"}:dependency:${index + 1}`,
    taskId,
    kind,
    refId,
      requiredState:
      dependencyRecord.requiredState ?? (kind === "part_instance" ? "ready" : "complete"),
    dependencyType,
    createdAt: dependencyRecord.createdAt ?? new Date().toISOString(),
  };
}

function getTaskDependencies(snapshot: PlatformSnapshot) {
  const explicitDependencies = (snapshot.taskDependencies ?? []).map((dependency, index) =>
    normalizeDependencyRecord(dependency as DependencyLike, index),
  );
  const fallbackDependencies = snapshot.tasks.flatMap((task, taskIndex) =>
    uniqueIds(task.dependencyIds).map<TaskDependency>((refId, dependencyIndex) => ({
      id: `${task.id}:dependency:${taskIndex + dependencyIndex + 1}`,
      taskId: task.id,
      kind: "task",
      refId,
      requiredState: "complete",
      dependencyType: "hard",
      createdAt: task.startDate ? `${task.startDate}T00:00:00.000Z` : new Date().toISOString(),
    })),
  );

  const dependencyKey = (dependency: TaskDependency) =>
    `${dependency.taskId}:${dependency.kind}:${dependency.refId}:${dependency.dependencyType}:${dependency.requiredState ?? ""}`;

  const explicitKeys = new Set(explicitDependencies.map(dependencyKey));
  return [
    ...explicitDependencies,
    ...fallbackDependencies.filter((dependency) => !explicitKeys.has(dependencyKey(dependency))),
  ];
}

function getTaskBlockers(snapshot: PlatformSnapshot) {
  const explicitBlockers = snapshot.taskBlockers ?? [];
  const fallbackBlockers = snapshot.tasks.flatMap((task) =>
    task.blockers.map((description, blockerIndex) => ({
      id: `${task.id}:blocker:${blockerIndex + 1}`,
      blockedTaskId: task.id,
      blockerType: "external" as const,
      blockerId: null,
      description,
      severity: "medium" as const,
      status: "open" as const,
      createdByMemberId: null,
      createdAt: task.startDate ? `${task.startDate}T00:00:00.000Z` : new Date().toISOString(),
      resolvedAt: null,
    })),
  );
  const blockerKey = (blocker: { blockedTaskId: string; description: string; status: string }) =>
    `${blocker.blockedTaskId}:${blocker.description}:${blocker.status}`;
  const explicitKeys = new Set(explicitBlockers.map(blockerKey));

  return [
    ...explicitBlockers,
    ...fallbackBlockers.filter((blocker) => !explicitKeys.has(blockerKey(blocker))),
  ];
}

function getTaskById(snapshot: PlatformSnapshot, taskId: string) {
  return snapshot.tasks.find((task) => task.id === taskId) ?? null;
}

function getMilestoneById(snapshot: PlatformSnapshot, milestoneId: string) {
  return snapshot.milestones.find((milestone) => milestone.id === milestoneId) ?? null;
}

function getPartInstanceById(snapshot: PlatformSnapshot, partInstanceId: string) {
  return snapshot.partInstances.find((partInstance) => partInstance.id === partInstanceId) ?? null;
}

function normalizeMilestoneRequiredState(requiredState: string | undefined) {
  const normalized = (requiredState ?? "ready").trim().toLowerCase();
  if (
    normalized === "started" ||
    normalized === "available" ||
    normalized === "installed" ||
    normalized === "complete"
  ) {
    return "ready" as const;
  }

  if (normalized === "not-ready" || normalized === "not_ready") {
    return "not ready" as const;
  }

  if (normalized === "planned" || normalized === "retired") {
    return "not ready" as const;
  }

  if (normalized === "needed") {
    return "blocked" as const;
  }

  if (normalized === "in-qa" || normalized === "waiting-for-qa") {
    return "qa" as const;
  }

  if (normalized === "in-progress") {
    return "blocked" as const;
  }

  return normalized as MilestoneStatus;
}

function isMilestoneDependencySatisfied(
  snapshot: PlatformSnapshot,
  milestoneId: string,
  requiredState: string | undefined,
) {
  const milestone = getMilestoneById(snapshot, milestoneId);
  if (!milestone) {
    return false;
  }

  const requiredOrder = MILESTONE_STATUS_ORDER[normalizeMilestoneRequiredState(requiredState)];
  const targetOrder = MILESTONE_STATUS_ORDER[normalizeMilestoneRequiredState(milestone.status ?? "not ready")];

  return targetOrder >= requiredOrder;
}

function isPartInstanceDependencySatisfied(
  snapshot: PlatformSnapshot,
  partInstanceId: string,
  requiredState: string | undefined,
) {
  const partInstance = getPartInstanceById(snapshot, partInstanceId);
  if (!partInstance) {
    return false;
  }

  const requiredOrder = PART_INSTANCE_STATUS_ORDER[normalizeMilestoneRequiredState(requiredState)];
  const targetOrder = PART_INSTANCE_STATUS_ORDER[partInstance.status];

  if (requiredOrder === undefined || targetOrder === undefined) {
    return partInstance.status === normalizeMilestoneRequiredState(requiredState);
  }

  return targetOrder >= requiredOrder;
}

function isTaskDependencySatisfied(dependency: TaskDependency, snapshot: PlatformSnapshot, now: Date) {
  if (dependency.dependencyType === "soft") {
    return true;
  }

  if (dependency.kind === "task") {
    return getTaskById(snapshot, dependency.refId)?.status === (dependency.requiredState ?? "complete");
  }

  if (dependency.kind === "part_instance") {
    return isPartInstanceDependencySatisfied(snapshot, dependency.refId, dependency.requiredState);
  }

  if (dependency.kind === "milestone") {
    return isMilestoneDependencySatisfied(snapshot, dependency.refId, dependency.requiredState);
  }

  return false;
}

export function getTaskDependencyRecords(task: Task, snapshot: PlatformSnapshot) {
  return getTaskDependencies(snapshot).filter(
    (dependency) => dependency.taskId === task.id || dependency.refId === task.id,
  );
}

export function getTaskWaitingOnDependencyRecords(
  taskId: string,
  snapshot: PlatformSnapshot,
  now: Date = new Date(),
) {
  return getTaskDependencies(snapshot).filter(
    (dependency) =>
      dependency.taskId === taskId &&
      dependency.dependencyType !== "soft" &&
      !isTaskDependencySatisfied(dependency, snapshot, now),
  );
}

export function isTaskWaitingOnDependencies(
  task: Pick<Task, "id" | "status">,
  snapshot: PlatformSnapshot,
  now: Date = new Date(),
) {
  return (
    task.status !== "complete" && getTaskWaitingOnDependencyRecords(task.id, snapshot, now).length > 0
  );
}

export function getTaskBlocksDependencyRecords(taskId: string, snapshot: PlatformSnapshot) {
  return getTaskDependencies(snapshot).filter(
    (dependency) =>
      dependency.refId === taskId && dependency.dependencyType !== "soft" && dependency.kind === "task",
  );
}

export function getTaskWaitingOnTasks(taskId: string, snapshot: PlatformSnapshot) {
  return getTaskWaitingOnDependencyRecords(taskId, snapshot)
    .filter((dependency) => dependency.kind === "task")
    .map((dependency) => dependency.refId)
    .filter((candidate) => getTaskById(snapshot, candidate)?.status !== "complete");
}

export function getTaskBlocksTasks(taskId: string, snapshot: PlatformSnapshot) {
  return getTaskBlocksDependencyRecords(taskId, snapshot).map((dependency) => dependency.taskId);
}

export function getOpenTaskBlockers(taskId: string, snapshot: PlatformSnapshot) {
  return getTaskBlockers(snapshot).filter(
    (blocker) => blocker.blockedTaskId === taskId && blocker.status === "open",
  );
}
