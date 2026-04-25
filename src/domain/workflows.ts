import {
  PlatformSnapshot,
  QaReview,
  Task,
  TaskStatus,
} from "./types";

export function evaluateTaskCompletion(task: Task, snapshot: PlatformSnapshot) {
  const workLogs = snapshot.workLogs.filter((workLog) => workLog.taskId === task.id);
  const qaReviews = snapshot.qaReviews.filter(
    (review) => review.subjectType === "task" && review.subjectId === task.id,
  );

  const missing: string[] = [];

  if (workLogs.length === 0) {
    missing.push("required work log");
  }

  if (task.requiresDocumentation && !task.documentationLinked) {
    missing.push("notebook or documentation evidence");
  }

  if (!hasMentorPass(qaReviews)) {
    missing.push("mentor-backed QA approval");
  }

  return {
    status: task.status,
    canFinalize: missing.length === 0,
    missing,
    workLogCount: workLogs.length,
    qaReviewCount: qaReviews.length,
  };
}

export function buildDashboard(snapshot: PlatformSnapshot) {
  const taskMap = new Map(snapshot.tasks.map((task) => [task.id, task]));

  const totalHours = snapshot.workLogs.reduce((sum, workLog) => {
    return sum + workLog.hours;
  }, 0);

  const openTasks = snapshot.tasks.filter((task) => task.status !== "complete");
  const waitingForQa = snapshot.tasks.filter(
    (task) => task.status === "waiting-for-qa",
  ).length;
  const blocked = snapshot.tasks.filter((task) => task.blockers.length > 0).length;
  const nextTasks = snapshot.tasks
    .filter((task) => {
      if (task.status === "complete" || task.blockers.length > 0) {
        return false;
      }

      return task.dependencyIds.every((dependencyId) => {
        return taskMap.get(dependencyId)?.status === "complete";
      });
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
    }));

  return {
    summary: {
      openTasks: openTasks.length,
      waitingForQa,
      blocked,
      trackedHours: totalHours,
      nextMeeting: snapshot.meetings[0],
    },
    subsystemCards: snapshot.subsystems.map((subsystem) => {
      const tasks = snapshot.tasks.filter(
        (task) =>
          task.subsystemId === subsystem.id ||
          (task.subsystemIds ?? [task.subsystemId]).includes(subsystem.id),
      );
      const done = tasks.filter((task) => task.status === "complete").length;

      return {
        id: subsystem.id,
        name: subsystem.name,
        risks: subsystem.risks,
        completionRate:
          tasks.length === 0 ? 0 : Number((done / tasks.length).toFixed(2)),
        activeTasks: tasks.filter((task) => task.status !== "complete").length,
      };
    }),
    nextTasks,
    escalations: snapshot.escalations,
  };
}

export function buildMetrics(snapshot: PlatformSnapshot) {
  const completedTasks = snapshot.tasks.filter((task) => task.status === "complete");
  const totalHours = snapshot.workLogs.reduce((sum, workLog) => sum + workLog.hours, 0);
  const qaPasses = snapshot.qaReviews.filter(
    (review) => review.result === "pass" && review.mentorApproved,
  ).length;
  const deliveredPurchases = snapshot.purchaseItems.filter(
    (purchase) => purchase.status === "delivered",
  ).length;
  const lowStockMaterials = snapshot.materials.filter(
    (material) => material.onHandQuantity <= material.reorderPoint,
  ).length;

  return {
    completionRate: Number(
      (completedTasks.length / Math.max(snapshot.tasks.length, 1)).toFixed(2),
    ),
    averageTrackedHoursPerTask: Number(
      (totalHours / Math.max(snapshot.tasks.length, 1)).toFixed(2),
    ),
    qaPasses,
    deliveredPurchases,
    lowStockMaterials,
    trackedMaterials: snapshot.materials.length,
    waitingForQa: snapshot.tasks.filter((task) => task.status === "waiting-for-qa")
      .length,
    blockerCount: snapshot.tasks.reduce((sum, task) => sum + task.blockers.length, 0),
    attendanceHours: snapshot.attendanceRecords.reduce((sum, record) => {
      return sum + record.totalHours;
    }, 0),
  };
}

export function formatTaskStatus(status: TaskStatus) {
  if (status === "not-started") {
    return "Not Started";
  }

  if (status === "in-progress") {
    return "In Progress";
  }

  if (status === "waiting-for-qa") {
    return "Waiting for QA";
  }

  return "Complete";
}

function hasMentorPass(qaReviews: QaReview[]) {
  return qaReviews.some((review) => {
    return review.result === "pass" && review.mentorApproved;
  });
}
