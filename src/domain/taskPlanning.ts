import type {
  PlatformSnapshot,
  Task,
  TaskBlocker,
  TaskDependency,
  TaskDependencyType,
  TaskPlanningState,
} from "./types";

const BLOCKING_DEPENDENCY_TYPES = new Set<TaskDependencyType>([
  "blocks",
  "finish_to_start",
]);

function dayPortion(value: string) {
  return value.slice(0, 10);
}

function utcNoon(value: string) {
  return new Date(`${dayPortion(value)}T12:00:00Z`);
}

function hoursUntilDay(day: string, now: Date) {
  const deadline = utcNoon(day);
  const deltaMs = deadline.getTime() - now.getTime();
  return deltaMs <= 0 ? 0 : deltaMs / (1000 * 60 * 60);
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

export function isBlockingDependency(dependency: TaskDependency) {
  return BLOCKING_DEPENDENCY_TYPES.has(dependency.dependencyType);
}

export function getBlockingUpstreamTaskIds(
  taskId: string,
  dependencies: TaskDependency[],
) {
  return uniqueIds(
    dependencies
      .filter(
        (dependency) =>
          dependency.downstreamTaskId === taskId && isBlockingDependency(dependency),
      )
      .map((dependency) => dependency.upstreamTaskId),
  );
}

export function getBlockingDownstreamTaskIds(
  taskId: string,
  dependencies: TaskDependency[],
) {
  return uniqueIds(
    dependencies
      .filter(
        (dependency) =>
          dependency.upstreamTaskId === taskId && isBlockingDependency(dependency),
      )
      .map((dependency) => dependency.downstreamTaskId),
  );
}

export function getOpenTaskBlockers(taskId: string, blockers: TaskBlocker[]) {
  return blockers.filter(
    (blocker) => blocker.blockedTaskId === taskId && blocker.status === "open",
  );
}

export function wouldCreateDependencyCycle(
  dependencies: TaskDependency[],
  upstreamTaskId: string,
  downstreamTaskId: string,
  ignoreDependencyId?: string | null,
) {
  const adjacency = new Map<string, string[]>();

  dependencies.forEach((dependency) => {
    if (ignoreDependencyId && dependency.id === ignoreDependencyId) {
      return;
    }

    const existing = adjacency.get(dependency.upstreamTaskId);
    if (existing) {
      existing.push(dependency.downstreamTaskId);
    } else {
      adjacency.set(dependency.upstreamTaskId, [dependency.downstreamTaskId]);
    }
  });

  const stack = [downstreamTaskId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (current === upstreamTaskId) {
      return true;
    }

    const next = adjacency.get(current) ?? [];
    next.forEach((candidate) => stack.push(candidate));
  }

  return false;
}

function getTaskDeadlineDay(task: Task, snapshot: PlatformSnapshot) {
  const event = task.targetEventId
    ? snapshot.events.find((candidate) => candidate.id === task.targetEventId)
    : null;

  if (event) {
    const eventDay = dayPortion(event.startDateTime);
    return eventDay < task.dueDate ? eventDay : task.dueDate;
  }

  return task.dueDate;
}

function getRemainingHours(task: Task) {
  return Math.max(task.estimatedHours - task.actualHours, 0);
}

function getBlockingDependencyChildren(
  taskId: string,
  snapshot: PlatformSnapshot,
  memo: Map<string, number>,
  visiting: Set<string>,
) {
  if (memo.has(taskId)) {
    return memo.get(taskId) ?? 0;
  }

  if (visiting.has(taskId)) {
    return 0;
  }

  visiting.add(taskId);
  const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.status === "complete") {
    memo.set(taskId, 0);
    visiting.delete(taskId);
    return 0;
  }

  const upstreamTaskIds = getBlockingUpstreamTaskIds(taskId, snapshot.taskDependencies);
  let longestUpstream = 0;

  upstreamTaskIds.forEach((upstreamTaskId) => {
    const upstreamHours = getBlockingDependencyChildren(upstreamTaskId, snapshot, memo, visiting);
    if (upstreamHours > longestUpstream) {
      longestUpstream = upstreamHours;
    }
  });

  const total = getRemainingHours(task) + longestUpstream;
  memo.set(taskId, total);
  visiting.delete(taskId);
  return total;
}

export function buildTaskPlanningState(
  task: Task,
  snapshot: PlatformSnapshot,
  now: Date = new Date(),
): TaskPlanningState {
  if (task.status === "complete") {
    return "ready";
  }

  const openBlockers = getOpenTaskBlockers(task.id, snapshot.taskBlockers);
  if (openBlockers.length > 0 || (snapshot.taskBlockers.length === 0 && task.blockers.length > 0)) {
    return "blocked";
  }

  const blockingUpstreamTaskIds = getBlockingUpstreamTaskIds(task.id, snapshot.taskDependencies);
  const legacyBlockingUpstreamTaskIds =
    snapshot.taskDependencies.length === 0 ? task.dependencyIds : [];
  const incompleteBlockingUpstream = blockingUpstreamTaskIds.filter((upstreamTaskId) => {
    const upstreamTask = snapshot.tasks.find((candidate) => candidate.id === upstreamTaskId);
    return upstreamTask?.status !== "complete";
  });
  const incompleteLegacyBlockingUpstream = legacyBlockingUpstreamTaskIds.filter((upstreamTaskId) => {
    const upstreamTask = snapshot.tasks.find((candidate) => candidate.id === upstreamTaskId);
    return upstreamTask?.status !== "complete";
  });

  if (incompleteBlockingUpstream.length > 0 || incompleteLegacyBlockingUpstream.length > 0) {
    return "waiting-on-dependency";
  }

  const deadlineDay = getTaskDeadlineDay(task, snapshot);
  const hoursUntilDeadline = hoursUntilDay(deadlineDay, now);
  if (hoursUntilDeadline <= 0) {
    return "overdue";
  }

  const criticalPathHours = getBlockingDependencyChildren(
    task.id,
    snapshot,
    new Map<string, number>(),
    new Set<string>(),
  );

  if (criticalPathHours > hoursUntilDeadline) {
    return "at-risk";
  }

  return "ready";
}
