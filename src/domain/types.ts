export type MemberRole = "student" | "lead" | "mentor" | "admin" | "external";
export type EventType =
  | "practice"
  | "competition"
  | "deadline"
  | "internal-review"
  | "demo";
export type DisciplineCode =
  | "design"
  | "manufacturing"
  | "assembly"
  | "electrical"
  | "programming"
  | "testing"
  | "planning"
  | "communications"
  | "finance"
  | "research"
  | "documentation"
  | "engagement"
  | "presentation"
  | "media_production"
  | "partnerships"
  | "game_analysis"
  | "scouting"
  | "data_analysis"
  | "risk_review"
  | "curriculum"
  | "instruction"
  | "practice"
  | "assessment"
  | "photography"
  | "video"
  | "graphics"
  | "writing"
  | "web"
  | "social_media";
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
export type MaterialCategory =
  | "metal"
  | "plastic"
  | "filament"
  | "electronics"
  | "hardware"
  | "consumable"
  | "other";
export type ArtifactKind = "document" | "nontechnical";
export type ArtifactStatus = "draft" | "in-review" | "published";
export type PurchaseStatus =
  | "requested"
  | "approved"
  | "purchased"
  | "shipped"
  | "delivered";
export type PartInstanceStatus =
  | "planned"
  | "needed"
  | "available"
  | "installed"
  | "retired";
export type QaResult = "pass" | "minor-fix" | "iteration-worthy";
export type SeasonType = "season" | "offseason" | "initiative";
export type ProjectType = "robot" | "operations" | "outreach" | "other";
export type ProjectStatus = "planned" | "active" | "paused" | "complete";
export type TestResultStatus = "pass" | "fail" | "blocked";
export type RiskSeverity = "high" | "medium" | "low";
export type RiskAttachmentType = "project" | "workstream" | "mechanism" | "part-instance";
export type FindingStatus = "open" | "in-progress" | "resolved";
export type FindingSourceType = "qa" | "test";
export type IterationStatus = "planned" | "in-progress" | "complete";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  elevated: boolean;
  seasonId: string;
  activeSeasonIds?: string[];
}

export interface Subsystem {
  id: string;
  projectId: string;
  name: string;
  color?: string;
  description: string;
  photoUrl?: string;
  iteration: number;
  isArchived: boolean;
  isCore: boolean;
  parentSubsystemId: string | null;
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
  photoUrl?: string;
  iteration: number;
  isArchived: boolean;
}

export interface PartDefinition {
  id: string;
  seasonId: string;
  activeSeasonIds?: string[];
  name: string;
  partNumber: string;
  revision: string;
  iteration: number;
  isArchived: boolean;
  type: string;
  source: string;
  materialId: string | null;
  description: string;
  photoUrl?: string;
}

export interface PartInstance {
  id: string;
  subsystemId: string;
  mechanismId: string | null;
  partDefinitionId: string;
  name: string;
  quantity: number;
  trackIndividually: boolean;
  status: PartInstanceStatus;
  photoUrl?: string;
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

export interface Artifact {
  id: string;
  projectId: string;
  workstreamId: string | null;
  kind: ArtifactKind;
  title: string;
  summary: string;
  status: ArtifactStatus;
  link: string;
  isArchived: boolean;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  workstreamId: string | null;
  workstreamIds: string[];
  title: string;
  summary: string;
  subsystemId: string;
  subsystemIds: string[];
  disciplineId: string;
  mechanismId: string | null;
  mechanismIds: string[];
  partInstanceId: string | null;
  partInstanceIds: string[];
  artifactId: string | null;
  artifactIds: string[];
  targetEventId: string | null;
  photoUrl?: string;
  ownerId: string | null;
  assigneeIds: string[];
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
  photoUrl?: string;
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
  projectIds: string[];
  relatedSubsystemIds: string[];
  photoUrl?: string;
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
  partInstanceId: string | null;
  partInstanceIds: string[];
  quantity: number;
  status: ManufacturingStatus;
  mentorReviewed: boolean;
  inHouse: boolean;
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

export interface Season {
  id: string;
  name: string;
  type: SeasonType;
  startDate: string;
  endDate: string;
}

export interface Project {
  id: string;
  seasonId: string;
  name: string;
  projectType: ProjectType;
  description: string;
  status: ProjectStatus;
}

export interface Workstream {
  id: string;
  projectId: string;
  name: string;
  color?: string;
  description: string;
  isArchived: boolean;
}

export interface QaReport {
  id: string;
  taskId: string;
  participantIds: string[];
  result: QaResult;
  mentorApproved: boolean;
  notes: string;
  photoUrl?: string;
  reviewedAt: string;
}

export interface TestResult {
  id: string;
  eventId: string;
  title: string;
  status: TestResultStatus;
  findings: string[];
  photoUrl?: string;
}

export interface QaFinding {
  id: string;
  qaReportId: string | null;
  taskId: string | null;
  projectId: string;
  workstreamId: string | null;
  subsystemId: string | null;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactId: string | null;
  title: string;
  detail: string;
  severity: RiskSeverity;
  status: FindingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestFinding {
  id: string;
  testResultId: string | null;
  eventId: string | null;
  taskId: string | null;
  projectId: string;
  workstreamId: string | null;
  subsystemId: string | null;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactId: string | null;
  title: string;
  detail: string;
  severity: RiskSeverity;
  status: FindingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DesignIteration {
  id: string;
  sourceType: FindingSourceType;
  findingId: string;
  projectId: string;
  workstreamId: string | null;
  subsystemId: string | null;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactId: string | null;
  taskId: string | null;
  notes: string;
  status: IterationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Risk {
  id: string;
  title: string;
  detail: string;
  severity: RiskSeverity;
  sourceType: "qa-report" | "test-result";
  sourceId: string;
  attachmentType: RiskAttachmentType;
  attachmentId: string;
  mitigationTaskId: string | null;
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

export type SlackChannelKey =
  | "build"
  | "meetingPlansRecaps"
  | "programming"
  | "scoutingStrategy"
  | "transportationAttendance";

export interface SlackHomeChannel {
  key: SlackChannelKey;
  name: string;
  slackChannelId: string | null;
  visible: boolean;
}

export interface SlackHomeAlert {
  id: string;
  channelKey: SlackChannelKey;
  channelName: string;
  slackMessageTs: string;
  authorName: string;
  text: string;
  mentionedHandles: string[];
  postedAt: string;
  read: boolean;
}

export interface SlackHomeTodo {
  id: string;
  text: string;
  assigneeLabel: string | null;
  complete: boolean;
}

export interface SlackHomeMeetingRecap {
  id: string;
  channelKey: SlackChannelKey;
  channelName: string;
  slackMessageTs: string;
  authorName: string;
  text: string;
  postedAt: string;
  todos: SlackHomeTodo[];
}

export interface SlackHomeSummaryMessage {
  id: string;
  authorName: string;
  text: string;
  postedAt: string;
  replyCount: number;
}

export interface SlackHomeSummary {
  id: string;
  channelKey: SlackChannelKey;
  channelName: string;
  title: string;
  summary: string;
  messageCount: number;
  updatedAt: string;
  sourceMessages: SlackHomeSummaryMessage[];
}

export interface SlackHomeResponse {
  slackEnabled: boolean;
  slackConnected: boolean;
  slackError: string | null;
  userEmail: string | null;
  alertUsergroupHandles: string[];
  channels: SlackHomeChannel[];
  unreadAlerts: SlackHomeAlert[];
  meetingRecap: SlackHomeMeetingRecap | null;
  summaries: SlackHomeSummary[];
}

export interface PlatformSnapshot {
  seasons: Season[];
  projects: Project[];
  workstreams: Workstream[];
  members: Member[];
  subsystems: Subsystem[];
  disciplines: Discipline[];
  mechanisms: Mechanism[];
  materials: Material[];
  artifacts: Artifact[];
  partDefinitions: PartDefinition[];
  partInstances: PartInstance[];
  tasks: Task[];
  events: Event[];
  qaReports: QaReport[];
  testResults: TestResult[];
  qaFindings: QaFinding[];
  testFindings: TestFinding[];
  designIterations: DesignIteration[];
  risks: Risk[];
  workLogs: WorkLog[];
  meetings: Meeting[];
  attendanceRecords: AttendanceRecord[];
  manufacturingItems: ManufacturingItem[];
  purchaseItems: PurchaseItem[];
  qaReviews: QaReview[];
  escalations: Escalation[];
}
