import type { MemberRole, TaskPriority, TaskStatus } from "../../domain/types";

export type RosterAvailabilityStatus = "available" | "at-risk" | "overloaded" | "unavailable";

export interface RosterInsightsTaskPreview {
  id: string;
  title: string;
  dueDate: string;
  priority: TaskPriority;
  projectId: string;
  projectName: string;
  status: TaskStatus;
}

export interface RosterInsightsMember {
  memberId: string;
  memberName: string;
  role: MemberRole;
  disciplineId: string | null;
  activeTaskCount: number;
  blockedTaskCount: number;
  waitingForQaTaskCount: number;
  overdueTaskCount: number;
  dueSoonTaskCount: number;
  estimatedOpenHours: number;
  remainingOpenHours: number;
  attendanceHoursLast7Days: number;
  attendanceHoursLast14Days: number;
  attendanceHoursLast30Days: number;
  attendanceSessionsLast30Days: number;
  availabilityStatus: RosterAvailabilityStatus;
  topTasks: RosterInsightsTaskPreview[];
}

export interface RosterAttendanceTimelinePoint {
  date: string;
  totalHours: number;
  memberCount: number;
}

export interface RosterRecentAttendanceRecord {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  totalHours: number;
  activeTaskCount: number;
  availabilityStatus: RosterAvailabilityStatus;
}

export interface RosterInsightsSummary {
  memberCount: number;
  activeMemberCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  waitingForQaTaskCount: number;
  unassignedTaskCount: number;
  overloadedMemberCount: number;
  unavailableMemberCount: number;
  attendanceHoursLast14Days: number;
  attendanceHoursLast30Days: number;
  noRecentAttendanceWithTasksCount: number;
}

export interface RosterInsightsResponse {
  summary: RosterInsightsSummary;
  members: RosterInsightsMember[];
  attendanceTimeline: RosterAttendanceTimelinePoint[];
  recentAttendance: RosterRecentAttendanceRecord[];
  generatedAt: string;
}

export interface RosterInsightsSource {
  attendanceRecords?: Array<{
    id: string;
    memberId: string;
    date: string;
    totalHours: number;
  }>;
  members: Array<{
    id: string;
    name: string;
    role: MemberRole;
    disciplineId?: string | null;
  }>;
  projects: Array<{
    id: string;
    name: string;
  }>;
  taskBlockers?: Array<{
    blockedTaskId: string;
    status: "open" | "resolved";
  }>;
  tasks: Array<{
    id: string;
    projectId: string;
    title: string;
    ownerId: string | null;
    assigneeIds: string[];
    dueDate: string;
    priority: TaskPriority;
    status: TaskStatus;
    estimatedHours: number;
    actualHours: number;
    isBlocked?: boolean;
  }>;
}

