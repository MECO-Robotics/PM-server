import type {
  RosterAvailabilityStatus,
  RosterInsightsMember,
  RosterInsightsSource,
  RosterInsightsTaskPreview,
} from "./rosterInsightsTypes";

export function parseDateValue(value: string) {
  const calendarDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (calendarDateMatch) {
    const year = Number(calendarDateMatch[1]);
    const month = Number(calendarDateMatch[2]);
    const day = Number(calendarDateMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    return parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function availabilityStatusFromMetrics(metrics: {
  activeTaskCount: number;
  attendanceHoursLast14Days: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  remainingOpenHours: number;
}): RosterAvailabilityStatus {
  if (metrics.activeTaskCount > 0 && metrics.attendanceHoursLast14Days <= 0.25) {
    return "unavailable";
  }

  if (
    metrics.overdueTaskCount >= 3 ||
    metrics.remainingOpenHours >= 28 ||
    (metrics.blockedTaskCount >= 3 && metrics.activeTaskCount >= 4)
  ) {
    return "overloaded";
  }

  if (
    metrics.overdueTaskCount >= 1 ||
    metrics.blockedTaskCount >= 1 ||
    (metrics.activeTaskCount >= 3 && metrics.attendanceHoursLast14Days < 4)
  ) {
    return "at-risk";
  }

  return "available";
}

function sortTaskPreviews(left: RosterInsightsTaskPreview, right: RosterInsightsTaskPreview) {
  const leftDue = parseDateValue(left.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDue = parseDateValue(right.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  const priorityOrder = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  } as const;
  const priorityDelta = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.title.localeCompare(right.title);
}

export function buildMemberInsights(args: {
  source: RosterInsightsSource;
  openTasks: RosterInsightsSource["tasks"];
  openTaskBlockerIds: Set<string>;
  projectsById: Map<string, { id: string; name: string }>;
  day7Start: Date;
  day14Start: Date;
  day30Start: Date;
  today: Date;
  dueSoonEnd: Date;
}) {
  const attendanceRecords = args.source.attendanceRecords ?? [];

  return args.source.members.map<RosterInsightsMember>((member) => {
    const assignedTasks = args.openTasks.filter(
      (task) => task.ownerId === member.id || task.assigneeIds.includes(member.id),
    );
    const topTasks = assignedTasks
      .map<RosterInsightsTaskPreview>((task) => ({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        priority: task.priority,
        projectId: task.projectId,
        projectName: args.projectsById.get(task.projectId)?.name ?? "Unknown project",
        status: task.status,
      }))
      .sort(sortTaskPreviews)
      .slice(0, 3);

    const overdueTaskCount = assignedTasks.filter((task) => {
      const dueDate = parseDateValue(task.dueDate);
      return dueDate !== null && dueDate.getTime() < args.today.getTime();
    }).length;

    const dueSoonTaskCount = assignedTasks.filter((task) => {
      const dueDate = parseDateValue(task.dueDate);
      if (!dueDate) {
        return false;
      }

      const time = dueDate.getTime();
      return time >= args.today.getTime() && time <= args.dueSoonEnd.getTime();
    }).length;

    const blockedTaskCount = assignedTasks.filter(
      (task) => task.isBlocked || args.openTaskBlockerIds.has(task.id),
    ).length;
    const waitingForQaTaskCount = assignedTasks.filter(
      (task) => task.status === "waiting-for-qa",
    ).length;
    const estimatedOpenHours = assignedTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
    const remainingOpenHours = assignedTasks.reduce(
      (sum, task) => sum + Math.max(0, task.estimatedHours - task.actualHours),
      0,
    );

    const memberAttendanceRecords = attendanceRecords.filter((record) => record.memberId === member.id);
    const attendanceHoursLast7Days = memberAttendanceRecords.reduce((sum, record) => {
      const attendanceDate = parseDateValue(record.date);
      return !attendanceDate ||
        attendanceDate < args.day7Start ||
        attendanceDate > args.today
        ? sum
        : sum + record.totalHours;
    }, 0);
    const attendanceHoursLast14Days = memberAttendanceRecords.reduce((sum, record) => {
      const attendanceDate = parseDateValue(record.date);
      return !attendanceDate ||
        attendanceDate < args.day14Start ||
        attendanceDate > args.today
        ? sum
        : sum + record.totalHours;
    }, 0);
    const attendanceHoursLast30Days = memberAttendanceRecords.reduce((sum, record) => {
      const attendanceDate = parseDateValue(record.date);
      return !attendanceDate ||
        attendanceDate < args.day30Start ||
        attendanceDate > args.today
        ? sum
        : sum + record.totalHours;
    }, 0);
    const attendanceSessionsLast30Days = memberAttendanceRecords.filter((record) => {
      const attendanceDate = parseDateValue(record.date);
      return Boolean(attendanceDate && attendanceDate >= args.day30Start && attendanceDate <= args.today);
    }).length;

    return {
      memberId: member.id,
      memberName: member.name,
      role: member.role,
      disciplineId: member.disciplineId ?? null,
      activeTaskCount: assignedTasks.length,
      blockedTaskCount,
      waitingForQaTaskCount,
      overdueTaskCount,
      dueSoonTaskCount,
      estimatedOpenHours: Number(estimatedOpenHours.toFixed(1)),
      remainingOpenHours: Number(remainingOpenHours.toFixed(1)),
      attendanceHoursLast7Days: Number(attendanceHoursLast7Days.toFixed(1)),
      attendanceHoursLast14Days: Number(attendanceHoursLast14Days.toFixed(1)),
      attendanceHoursLast30Days: Number(attendanceHoursLast30Days.toFixed(1)),
      attendanceSessionsLast30Days,
      availabilityStatus: availabilityStatusFromMetrics({
        activeTaskCount: assignedTasks.length,
        attendanceHoursLast14Days,
        overdueTaskCount,
        blockedTaskCount,
        remainingOpenHours,
      }),
      topTasks,
    };
  });
}

