import { buildMemberInsights, parseDateValue } from "./rosterInsightsMemberMetrics";
import type {
  RosterAvailabilityStatus,
  RosterInsightsResponse,
  RosterInsightsSource,
} from "./rosterInsightsTypes";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateOnlyKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isTaskOpen(status: RosterInsightsSource["tasks"][number]["status"]) {
  return status !== "complete";
}

export function buildRosterInsights(source: RosterInsightsSource): RosterInsightsResponse {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day7Start = new Date(today.getTime() - 6 * MS_PER_DAY);
  const day14Start = new Date(today.getTime() - 13 * MS_PER_DAY);
  const day30Start = new Date(today.getTime() - 29 * MS_PER_DAY);
  const dueSoonEnd = new Date(today.getTime() + 7 * MS_PER_DAY);
  const attendanceRecords = source.attendanceRecords ?? [];
  const openTasks = source.tasks.filter((task) => isTaskOpen(task.status));
  const openTaskBlockerIds = new Set(
    (source.taskBlockers ?? [])
      .filter((blocker) => blocker.status === "open")
      .map((blocker) => blocker.blockedTaskId),
  );
  const overdueTaskCount = openTasks.filter((task) => {
    const dueDate = parseDateValue(task.dueDate);
    return dueDate !== null && dueDate.getTime() < today.getTime();
  }).length;
  const blockedTaskCount = openTasks.filter(
    (task) => task.isBlocked || openTaskBlockerIds.has(task.id),
  ).length;
  const waitingForQaTaskCount = openTasks.filter(
    (task) => task.status === "waiting-for-qa",
  ).length;
  const projectsById = new Map(source.projects.map((project) => [project.id, project] as const));

  const members = buildMemberInsights({
    source,
    openTasks,
    openTaskBlockerIds,
    projectsById,
    day7Start,
    day14Start,
    day30Start,
    today,
    dueSoonEnd,
  }).sort((left, right) => {
    const statusOrder: Record<RosterAvailabilityStatus, number> = {
      unavailable: 0,
      overloaded: 1,
      "at-risk": 2,
      available: 3,
    };

    const statusDelta = statusOrder[left.availabilityStatus] - statusOrder[right.availabilityStatus];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    if (left.overdueTaskCount !== right.overdueTaskCount) {
      return right.overdueTaskCount - left.overdueTaskCount;
    }
    if (left.activeTaskCount !== right.activeTaskCount) {
      return right.activeTaskCount - left.activeTaskCount;
    }
    return left.memberName.localeCompare(right.memberName);
  });

  const attendanceTimelineByDate = new Map<string, { totalHours: number; memberIds: Set<string> }>();
  attendanceRecords.forEach((record) => {
    const attendanceDate = parseDateValue(record.date);
    if (!attendanceDate || attendanceDate < day30Start || attendanceDate > today) {
      return;
    }

    const key = dateOnlyKey(attendanceDate);
    const bucket = attendanceTimelineByDate.get(key) ?? { totalHours: 0, memberIds: new Set<string>() };
    bucket.totalHours += record.totalHours;
    bucket.memberIds.add(record.memberId);
    attendanceTimelineByDate.set(key, bucket);
  });

  const attendanceTimeline = [...attendanceTimelineByDate.entries()]
    .map(([date, metric]) => ({
      date,
      totalHours: Number(metric.totalHours.toFixed(1)),
      memberCount: metric.memberIds.size,
    }))
    .sort((left, right) => right.date.localeCompare(left.date));

  const membersById = new Map(members.map((member) => [member.memberId, member] as const));
  const recentAttendance = [...attendanceRecords]
    .filter((record) => {
      const attendanceDate = parseDateValue(record.date);
      return Boolean(attendanceDate && attendanceDate <= today);
    })
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 30)
    .map((record) => {
      const member = membersById.get(record.memberId);
      return {
        id: record.id,
        memberId: record.memberId,
        memberName: member?.memberName ?? "Unknown member",
        date: record.date,
        totalHours: record.totalHours,
        activeTaskCount: member?.activeTaskCount ?? 0,
        availabilityStatus: member?.availabilityStatus ?? "available",
      };
    });

  return {
    summary: {
      memberCount: members.length,
      activeMemberCount: members.filter((member) => member.activeTaskCount > 0).length,
      openTaskCount: openTasks.length,
      overdueTaskCount,
      blockedTaskCount,
      waitingForQaTaskCount,
      unassignedTaskCount: openTasks.filter(
        (task) => task.ownerId === null && task.assigneeIds.length === 0,
      ).length,
      overloadedMemberCount: members.filter((member) => member.availabilityStatus === "overloaded").length,
      unavailableMemberCount: members.filter((member) => member.availabilityStatus === "unavailable").length,
      attendanceHoursLast14Days: Number(
        members.reduce((sum, member) => sum + member.attendanceHoursLast14Days, 0).toFixed(1),
      ),
      attendanceHoursLast30Days: Number(
        members.reduce((sum, member) => sum + member.attendanceHoursLast30Days, 0).toFixed(1),
      ),
      noRecentAttendanceWithTasksCount: members.filter(
        (member) => member.activeTaskCount > 0 && member.attendanceHoursLast14Days <= 0.25,
      ).length,
    },
    members,
    attendanceTimeline,
    recentAttendance,
    generatedAt: now.toISOString(),
  };
}

