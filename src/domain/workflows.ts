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
  const workHoursByTaskId = new Map<string, number>();

  snapshot.workLogs.forEach((workLog) => {
    workHoursByTaskId.set(
      workLog.taskId,
      (workHoursByTaskId.get(workLog.taskId) ?? 0) + workLog.hours,
    );
  });

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
  const subsystemMetrics = buildSubsystemMetrics(snapshot, workHoursByTaskId);
  const mechanismMetrics = buildMechanismMetrics(snapshot, workHoursByTaskId);

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
    subsystemMetrics,
    mechanismMetrics,
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

function buildSubsystemMetrics(
  snapshot: PlatformSnapshot,
  workHoursByTaskId: Map<string, number>,
) {
  return snapshot.subsystems
    .map((subsystem) => {
      const tasks = snapshot.tasks.filter((task) =>
        [task.subsystemId, ...(task.subsystemIds ?? [])].includes(subsystem.id),
      );
      const taskIds = new Set(tasks.map((task) => task.id));
      const completeTaskCount = tasks.filter((task) => task.status === "complete").length;
      const waitingForQaCount = tasks.filter((task) => task.status === "waiting-for-qa").length;
      const blockerCount = tasks.reduce((sum, task) => sum + task.blockers.length, 0);
      const plannedHours = tasks.reduce((sum, task) => sum + task.estimatedHours, 0);
      const loggedHours = tasks.reduce(
        (sum, task) => sum + (workHoursByTaskId.get(task.id) ?? 0),
        0,
      );
      const qaPassCount = snapshot.qaReviews.filter((review) => {
        return (
          review.subjectType === "task" &&
          review.result === "pass" &&
          review.mentorApproved &&
          review.subjectId &&
          taskIds.has(review.subjectId)
        );
      }).length;
      const mechanismCount = snapshot.mechanisms.filter((mechanism) => {
        return mechanism.subsystemId === subsystem.id;
      }).length;

      return {
        id: subsystem.id,
        name: subsystem.name,
        projectId: subsystem.projectId,
        taskCount: tasks.length,
        activeTaskCount: tasks.length - completeTaskCount,
        completeTaskCount,
        waitingForQaCount,
        blockerCount,
        plannedHours: Number(plannedHours.toFixed(1)),
        loggedHours: Number(loggedHours.toFixed(1)),
        completionRate: Number(
          (completeTaskCount / Math.max(tasks.length, 1)).toFixed(2),
        ),
        qaPassCount,
        mechanismCount,
      };
    })
    .sort((left, right) => {
      const activeOrder = right.activeTaskCount - left.activeTaskCount;
      if (activeOrder !== 0) {
        return activeOrder;
      }

      const blockerOrder = right.blockerCount - left.blockerCount;
      if (blockerOrder !== 0) {
        return blockerOrder;
      }

      const completionOrder = left.completionRate - right.completionRate;
      if (completionOrder !== 0) {
        return completionOrder;
      }

      return left.name.localeCompare(right.name);
    });
}

function buildMechanismMetrics(
  snapshot: PlatformSnapshot,
  workHoursByTaskId: Map<string, number>,
) {
  return snapshot.mechanisms
    .map((mechanism) => {
      const tasks = snapshot.tasks.filter((task) =>
        [task.mechanismId, ...(task.mechanismIds ?? [])].includes(mechanism.id),
      );
      const taskIds = new Set(tasks.map((task) => task.id));
      const subsystemName = snapshot.subsystems.find(
        (subsystem) => subsystem.id === mechanism.subsystemId,
      )?.name ?? "Unknown subsystem";
      const completeTaskCount = tasks.filter((task) => task.status === "complete").length;
      const waitingForQaCount = tasks.filter((task) => task.status === "waiting-for-qa").length;
      const blockerCount = tasks.reduce((sum, task) => sum + task.blockers.length, 0);
      const plannedHours = tasks.reduce((sum, task) => sum + task.estimatedHours, 0);
      const loggedHours = tasks.reduce(
        (sum, task) => sum + (workHoursByTaskId.get(task.id) ?? 0),
        0,
      );
      const qaPassCount = snapshot.qaReviews.filter((review) => {
        return (
          review.subjectType === "task" &&
          review.result === "pass" &&
          review.mentorApproved &&
          review.subjectId &&
          taskIds.has(review.subjectId)
        );
      }).length;
      const partInstanceCount = snapshot.partInstances.filter((partInstance) => {
        return partInstance.mechanismId === mechanism.id;
      }).length;

      return {
        id: mechanism.id,
        name: mechanism.name,
        subsystemId: mechanism.subsystemId,
        subsystemName,
        taskCount: tasks.length,
        activeTaskCount: tasks.length - completeTaskCount,
        completeTaskCount,
        waitingForQaCount,
        blockerCount,
        plannedHours: Number(plannedHours.toFixed(1)),
        loggedHours: Number(loggedHours.toFixed(1)),
        completionRate: Number(
          (completeTaskCount / Math.max(tasks.length, 1)).toFixed(2),
        ),
        qaPassCount,
        partInstanceCount,
      };
    })
    .sort((left, right) => {
      const activeOrder = right.activeTaskCount - left.activeTaskCount;
      if (activeOrder !== 0) {
        return activeOrder;
      }

      const blockerOrder = right.blockerCount - left.blockerCount;
      if (blockerOrder !== 0) {
        return blockerOrder;
      }

      const completionOrder = left.completionRate - right.completionRate;
      if (completionOrder !== 0) {
        return completionOrder;
      }

      return left.name.localeCompare(right.name);
    });
}
