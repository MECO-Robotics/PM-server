import type {
  ArtifactKind,
  ArtifactStatus,
  Milestone,
  ManufacturingProcess,
  ManufacturingStatus,
  MaterialCategory,
  Member,
  PartInstance,
  Project,
  QaResult,
  ReportType,
  RiskAttachmentType,
  RiskSeverity,
  PurchaseStatus,
  Season,
  TaskBlockerSeverity,
  TaskBlockerStatus,
  TaskBlockerType,
  TaskDependencyType,
  TaskPriority,
  TaskStatus,
  TestResultStatus,
} from "../domain/types";

export interface TaskInput {
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
  targetMilestoneId: string | null;
  photoUrl?: string;
  ownerId: string | null;
  assigneeIds: string[];
  mentorId: string | null;
  startDate: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedHours: number;
  actualHours: number;
  blockers: string[];
  dependencyIds: string[];
  linkedManufacturingIds: string[];
  linkedPurchaseIds: string[];
  requiresDocumentation: boolean;
  documentationLinked: boolean;
}

export interface WorkLogInput {
  taskId: string;
  date: string;
  hours: number;
  participantIds: string[];
  notes: string;
  photoUrl?: string;
}

export interface MemberInput {
  name: string;
  email?: string;
  photoUrl?: string;
  role: Member["role"];
  elevated?: boolean;
  disciplineId?: string | null;
  seasonId?: string;
  activeSeasonIds?: string[];
}

export interface SeasonInput {
  name: string;
  type: Season["type"];
  startDate: string;
  endDate: string;
}

export interface ProjectInput {
  seasonId: string;
  name: string;
  projectType: Project["projectType"];
  description?: string;
  status?: Project["status"];
}

export interface PurchaseItemInput {
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

export interface ManufacturingItemInput {
  title: string;
  subsystemId: string;
  requestedById: string | null;
  process: ManufacturingProcess;
  dueDate: string;
  material: string;
  materialId?: string | null;
  partDefinitionId: string | null;
  partInstanceId?: string | null;
  partInstanceIds?: string[];
  quantity: number;
  status: ManufacturingStatus;
  mentorReviewed: boolean;
  inHouse?: boolean;
  batchLabel?: string;
}

export interface MaterialInput {
  name: string;
  category: MaterialCategory;
  unit: string;
  onHandQuantity: number;
  reorderPoint: number;
  location: string;
  vendor: string;
  notes: string;
}

export interface ArtifactInput {
  projectId: string;
  workstreamId: string | null;
  kind: ArtifactKind;
  title: string;
  summary: string;
  status: ArtifactStatus;
  link: string;
  isArchived?: boolean;
  updatedAt: string;
}

export interface WorkstreamInput {
  projectId: string;
  name: string;
  color?: string;
  description: string;
  isArchived?: boolean;
}

export interface SubsystemInput {
  projectId: string;
  name: string;
  serialAlias?: string;
  color?: string;
  description: string;
  photoUrl?: string;
  iteration?: number;
  isArchived?: boolean;
  parentSubsystemId: string | null;
  responsibleEngineerId: string | null;
  mentorIds: string[];
  risks: string[];
}

export interface MechanismInput {
  subsystemId: string;
  name: string;
  description: string;
  googleSheetsUrl?: string;
  photoUrl?: string;
  iteration?: number;
  isArchived?: boolean;
}

export interface PartDefinitionInput {
  seasonId?: string;
  activeSeasonIds?: string[];
  name: string;
  partNumber: string;
  isHardware?: boolean;
  revision: string;
  iteration?: number;
  isArchived?: boolean;
  type: string;
  source: string;
  materialId: string | null;
  description: string;
  photoUrl?: string;
}

export interface PartInstanceInput {
  subsystemId: string;
  mechanismId: string | null;
  partDefinitionId: string;
  name: string;
  quantity: number;
  trackIndividually: boolean;
  status: PartInstance["status"];
  photoUrl?: string;
}

export interface MilestoneInput {
  title: string;
  type: Milestone["type"];
  status?: Milestone["status"];
  startDateTime: string;
  endDateTime: string | null;
  isExternal: boolean;
  description: string;
  projectIds: string[];
  photoUrl?: string;
}

export interface QaReportInput {
  taskId: string;
  participantIds: string[];
  result: QaResult;
  mentorApproved: boolean;
  notes: string;
  photoUrl?: string;
  reviewedAt: string;
}

export interface QaRequestInput {
  taskId?: string | null;
  subject: string;
  mentorId: string;
  requestedById?: string | null;
}

export interface TestResultInput {
  milestoneId: string;
  title: string;
  status: TestResultStatus;
  findings: string[];
  photoUrl?: string;
}

export interface ReportInput {
  reportType: ReportType;
  projectId: string;
  taskId: string | null;
  milestoneId: string | null;
  workstreamId: string | null;
  createdByMemberId: string | null;
  result: string;
  summary: string;
  notes: string;
  photoUrl?: string;
  createdAt: string;
  participantIds?: string[];
  mentorApproved?: boolean;
  reviewedAt?: string;
  title?: string;
  status?: TestResultStatus;
  findings?: string[];
}

export interface ReportFindingInput {
  reportId: string;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactInstanceId: string | null;
  issueType: string;
  severity: RiskSeverity;
  notes: string;
  spawnedTaskId: string | null;
  spawnedIterationId: string | null;
  spawnedRiskId: string | null;
}

export interface TaskDependencyInput {
  taskId: string;
  kind: "task" | "milestone" | "part_instance";
  refId: string;
  requiredState?: string;
  dependencyType: TaskDependencyType;
}

export interface TaskBlockerInput {
  blockedTaskId: string;
  blockerType: TaskBlockerType;
  blockerId: string | null;
  description: string;
  severity: TaskBlockerSeverity;
  status?: TaskBlockerStatus;
  createdByMemberId?: string | null;
}

export interface RiskInput {
  title: string;
  detail: string;
  severity: RiskSeverity;
  sourceType: "qa-report" | "test-result";
  sourceId: string;
  attachmentType: RiskAttachmentType;
  attachmentId: string;
  mitigationTaskId: string | null;
}
