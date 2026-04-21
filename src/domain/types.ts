export type MemberRole = "student" | "mentor" | "admin";
export type TaskStatus =
  | "not-started"
  | "in-progress"
  | "waiting-for-qa"
  | "complete";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type ManufacturingProcess = "3d-print" | "cnc" | "fabrication";
export type ManufacturingStatus =
  | "requested"
  | "approved"
  | "in-progress"
  | "qa"
  | "complete";
export type PurchaseStatus =
  | "requested"
  | "approved"
  | "purchased"
  | "shipped"
  | "delivered";
export type QaResult = "pass" | "minor-fix" | "iteration-worthy";

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
}

export interface Subsystem {
  id: string;
  name: string;
  responsibleEngineerId: string;
  mentorIds: string[];
  risks: string[];
}

export interface Task {
  id: string;
  title: string;
  summary: string;
  subsystemId: string;
  ownerId: string;
  mentorId: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  dependencyIds: string[];
  blockers: string[];
  linkedManufacturingIds: string[];
  linkedPurchaseIds: string[];
  estimatedHours: number;
  actualHours: number;
  requiresDocumentation: boolean;
  documentationLinked: boolean;
}

export interface WorkLog {
  id: string;
  taskId: string;
  date: string;
  hours: number;
  participantIds: string[];
  notes: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  rsvpsYes: number;
  rsvpsMaybe: number;
  openSignIns: number;
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  date: string;
  totalHours: number;
}

export interface ManufacturingItem {
  id: string;
  title: string;
  subsystemId: string;
  requestedById: string;
  process: ManufacturingProcess;
  dueDate: string;
  material: string;
  quantity: number;
  status: ManufacturingStatus;
  mentorReviewed: boolean;
  batchLabel?: string;
}

export interface PurchaseItem {
  id: string;
  title: string;
  subsystemId: string;
  requestedById: string;
  quantity: number;
  vendor: string;
  linkLabel: string;
  estimatedCost: number;
  finalCost?: number;
  approvedByMentor: boolean;
  status: PurchaseStatus;
}

export interface QaReview {
  id: string;
  subjectId: string;
  subjectType: "task" | "manufacturing";
  subjectTitle: string;
  participantIds: string[];
  result: QaResult;
  mentorApproved: boolean;
  notes: string;
  reviewedAt: string;
}

export interface Escalation {
  title: string;
  detail: string;
  severity: "high" | "medium";
}

export interface PlatformSnapshot {
  members: Member[];
  subsystems: Subsystem[];
  tasks: Task[];
  workLogs: WorkLog[];
  meetings: Meeting[];
  attendanceRecords: AttendanceRecord[];
  manufacturingItems: ManufacturingItem[];
  purchaseItems: PurchaseItem[];
  qaReviews: QaReview[];
  escalations: Escalation[];
}
