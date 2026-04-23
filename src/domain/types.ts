export type MemberRole = "student" | "lead" | "mentor" | "admin";
export type EventType =
  | "drive-practice"
  | "competition"
  | "deadline"
  | "internal-review"
  | "demo";
export type DisciplineCode =
  | "mechanical"
  | "electrical"
  | "software"
  | "integration"
  | "qa-test";
export type TaskStatus =
  | "not-started"
  | "in-progress"
  | "waiting-for-qa"
  | "complete";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type MoscowPriority = "must" | "should" | "could" | "wont";
export type RequirementStatus = "planned" | "in-progress" | "complete";
export type ManufacturingProcess = "3d-print" | "cnc" | "fabrication";
export type ManufacturingStatus =
  | "requested"
  | "approved"
  | "in-progress"
  | "qa"
  | "complete";
export type MaterialCategory =
  | "metal"
  | "plastic"
  | "filament"
  | "electronics"
  | "hardware"
  | "consumable"
  | "other";
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
  description: string;
  isCore: boolean;
  responsibleEngineerId: string | null;
  mentorIds: string[];
  risks: string[];
}

export interface Discipline {
  id: string;
  code: DisciplineCode;
  name: string;
}

export interface Mechanism {
  id: string;
  subsystemId: string;
  name: string;
  description: string;
}

export interface Requirement {
  id: string;
  subsystemId: string;
  title: string;
  description: string;
  moscowPriority: MoscowPriority;
  status: RequirementStatus;
}

export interface PartDefinition {
  id: string;
  name: string;
  partNumber: string;
  revision: string;
  type: string;
  source: string;
}

export interface PartInstance {
  id: string;
  subsystemId: string;
  mechanismId: string | null;
  partDefinitionId: string;
  name: string;
  quantity: number;
  trackIndividually: boolean;
}

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: string;
  onHandQuantity: number;
  reorderPoint: number;
  location: string;
  vendor: string;
  notes: string;
}

export interface Task {
  id: string;
  title: string;
  summary: string;
  subsystemId: string;
  disciplineId: string;
  requirementId: string | null;
  mechanismId: string | null;
  partInstanceId: string | null;
  targetEventId: string | null;
  ownerId: string | null;
  mentorId: string | null;
  startDate: string;
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

export interface Event {
  id: string;
  title: string;
  type: EventType;
  startDateTime: string;
  endDateTime: string | null;
  isExternal: boolean;
  description: string;
  relatedSubsystemIds: string[];
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
  requestedById: string | null;
  process: ManufacturingProcess;
  dueDate: string;
  material: string;
  partDefinitionId: string | null;
  quantity: number;
  status: ManufacturingStatus;
  mentorReviewed: boolean;
  batchLabel?: string;
}

export interface PurchaseItem {
  id: string;
  title: string;
  subsystemId: string;
  requestedById: string | null;
  partDefinitionId: string | null;
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
  disciplines: Discipline[];
  mechanisms: Mechanism[];
  requirements: Requirement[];
  materials: Material[];
  partDefinitions: PartDefinition[];
  partInstances: PartInstance[];
  tasks: Task[];
  events: Event[];
  workLogs: WorkLog[];
  meetings: Meeting[];
  attendanceRecords: AttendanceRecord[];
  manufacturingItems: ManufacturingItem[];
  purchaseItems: PurchaseItem[];
  qaReviews: QaReview[];
  escalations: Escalation[];
}
