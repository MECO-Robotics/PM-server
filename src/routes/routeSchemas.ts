import { z } from "zod";

import { authConfig as runtimeAuthConfig } from "../config/env";

export const memberSchema = z.object({
  name: z.string().trim().min(2),
  email: z.union([z.literal(""), z.string().trim().email()]).default(""),
  role: z.enum(["student", "lead", "mentor", "admin", "external"]),
  elevated: z.boolean().default(false),
  seasonId: z.string().trim().min(1).optional(),
  activeSeasonIds: z.array(z.string().trim().min(1)).optional(),
});

export const seasonSchema = z.object({
  name: z.string().trim().min(2),
  type: z.enum(["season", "offseason", "initiative"]).default("season"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const projectSchema = z.object({
  seasonId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  projectType: z.enum(["robot", "operations", "outreach", "other"]).default("robot"),
  description: z.string().trim().default(""),
  status: z.enum(["planned", "active", "paused", "complete"]).default("active"),
});

export const projectPatchSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  status: z.enum(["planned", "active", "paused", "complete"]).optional(),
});

export const taskSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  workstreamId: z.string().trim().min(1).nullable().optional(),
  workstreamIds: z.array(z.string().trim().min(1)).optional(),
  title: z.string().trim().min(3),
  summary: z.string().trim().min(3),
  subsystemId: z.string().trim().min(1).optional(),
  subsystemIds: z.array(z.string().trim().min(1)).optional(),
  disciplineId: z.string().min(1),
  mechanismId: z.string().trim().min(1).nullable().optional(),
  mechanismIds: z.array(z.string().trim().min(1)).optional(),
  partInstanceId: z.string().trim().min(1).nullable().optional(),
  partInstanceIds: z.array(z.string().trim().min(1)).optional(),
  artifactId: z.string().trim().min(1).nullable().optional(),
  artifactIds: z.array(z.string().trim().min(1)).optional(),
  targetEventId: z.string().trim().min(1).nullable(),
  photoUrl: z.string().trim().default(""),
  ownerId: z.string().trim().min(1).nullable(),
  assigneeIds: z.array(z.string().trim().min(1)).default([]),
  mentorId: z.string().trim().min(1).nullable(),
  startDate: z.string().date().optional(),
  dueDate: z.string().date(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["not-started", "in-progress", "waiting-for-qa", "complete"]),
  estimatedHours: z.coerce.number().min(0),
  actualHours: z.coerce.number().min(0),
  blockers: z.array(z.string().trim().min(1)).default([]),
  dependencyIds: z.array(z.string().trim().min(1)).default([]),
  linkedManufacturingIds: z.array(z.string().trim().min(1)).default([]),
  linkedPurchaseIds: z.array(z.string().trim().min(1)).default([]),
  requiresDocumentation: z.boolean().default(false),
  documentationLinked: z.boolean().default(false),
});

export const taskPatchSchema = taskSchema.partial();

export const eventSchema = z.object({
  title: z.string().trim().min(2),
  type: z.enum([
    "practice",
    "competition",
    "deadline",
    "internal-review",
    "demo",
  ]),
  startDateTime: z.string().trim().min(1),
  endDateTime: z.string().trim().min(1).nullable(),
  isExternal: z.boolean().default(false),
  description: z.string().trim().default(""),
  projectIds: z.array(z.string().trim().min(1)).default([]),
  relatedSubsystemIds: z.array(z.string().trim().min(1)).default([]),
  photoUrl: z.string().trim().default(""),
});

export const eventPatchSchema = z.object({
  title: z.string().trim().min(2).optional(),
  type: z
    .enum(["practice", "competition", "deadline", "internal-review", "demo"])
    .optional(),
  startDateTime: z.string().trim().min(1).optional(),
  endDateTime: z.string().trim().min(1).nullable().optional(),
  isExternal: z.boolean().optional(),
  description: z.string().trim().optional(),
  projectIds: z.array(z.string().trim().min(1)).optional(),
  relatedSubsystemIds: z.array(z.string().trim().min(1)).optional(),
  photoUrl: z.string().trim().optional(),
});

export const qaReportSchema = z.object({
  taskId: z.string().trim().min(1),
  participantIds: z.array(z.string().trim().min(1)).min(1),
  result: z.enum(["pass", "minor-fix", "iteration-worthy"]),
  mentorApproved: z.boolean().default(false),
  notes: z.string().trim().default(""),
  photoUrl: z.string().trim().default(""),
  reviewedAt: z.string().date(),
});

export const testResultSchema = z.object({
  eventId: z.string().trim().min(1),
  title: z.string().trim().min(2),
  status: z.enum(["pass", "fail", "blocked"]),
  findings: z.array(z.string().trim().min(1)).default([]),
  photoUrl: z.string().trim().default(""),
});

export const reportSchema = z.object({
  reportType: z.enum(["QA", "EventTest"]),
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1).nullable(),
  eventId: z.string().trim().min(1).nullable(),
  workstreamId: z.string().trim().min(1).nullable(),
  createdByMemberId: z.string().trim().min(1).nullable(),
  result: z.string().trim().min(1),
  summary: z.string().trim().default(""),
  notes: z.string().trim().default(""),
  photoUrl: z.string().trim().default(""),
  createdAt: z.string().trim().min(1),
  participantIds: z.array(z.string().trim().min(1)).optional(),
  mentorApproved: z.boolean().optional(),
  reviewedAt: z.string().date().optional(),
  title: z.string().trim().min(1).optional(),
  status: z.enum(["pass", "fail", "blocked"]).optional(),
  findings: z.array(z.string().trim().min(1)).optional(),
});

export const reportFindingSchema = z.object({
  reportId: z.string().trim().min(1),
  mechanismId: z.string().trim().min(1).nullable(),
  partInstanceId: z.string().trim().min(1).nullable(),
  artifactInstanceId: z.string().trim().min(1).nullable(),
  issueType: z.string().trim().min(1),
  severity: z.enum(["high", "medium", "low"]),
  notes: z.string().trim().default(""),
  spawnedTaskId: z.string().trim().min(1).nullable(),
  spawnedIterationId: z.string().trim().min(1).nullable(),
  spawnedRiskId: z.string().trim().min(1).nullable(),
});

export const taskDependencySchema = z.object({
  upstreamTaskId: z.string().trim().min(1),
  downstreamTaskId: z.string().trim().min(1),
  dependencyType: z.enum(["blocks", "soft", "finish_to_start"]),
});

export const taskDependencyPatchSchema = taskDependencySchema.partial();

export const taskBlockerSchema = z.object({
  blockedTaskId: z.string().trim().min(1),
  blockerType: z.enum([
    "task",
    "event",
    "workstream",
    "mechanism",
    "part_instance",
    "artifact_instance",
    "external",
  ]),
  blockerId: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "resolved"]).default("open"),
  createdByMemberId: z.string().trim().min(1).nullable().optional(),
});

export const taskBlockerPatchSchema = taskBlockerSchema.partial();

export const riskSchema = z.object({
  title: z.string().trim().min(2),
  detail: z.string().trim().min(2),
  severity: z.enum(["high", "medium", "low"]),
  sourceType: z.enum(["qa-report", "test-result"]),
  sourceId: z.string().trim().min(1),
  attachmentType: z.enum(["project", "workstream", "mechanism", "part-instance"]),
  attachmentId: z.string().trim().min(1),
  mitigationTaskId: z.string().trim().min(1).nullable().optional(),
});

export const riskPatchSchema = riskSchema.partial();

export const memberPatchSchema = memberSchema.partial();
export const iterationSchema = z.coerce.number().int().min(1).default(1);

export const workstreamSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().trim().min(3),
  isArchived: z.boolean().default(false),
});

export const workstreamPatchSchema = workstreamSchema.partial();

export const subsystemSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().trim().min(3),
  photoUrl: z.string().trim().default(""),
  iteration: iterationSchema,
  isArchived: z.boolean().default(false),
  parentSubsystemId: z.string().trim().min(1).nullable().optional(),
  responsibleEngineerId: z.string().trim().min(1).nullable(),
  mentorIds: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string().trim().min(1)).default([]),
});

export const subsystemPatchSchema = subsystemSchema.partial();

export const mechanismSchema = z.object({
  subsystemId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  description: z.string().trim().min(3),
  photoUrl: z.string().trim().default(""),
  iteration: iterationSchema,
  isArchived: z.boolean().default(false),
});

export const mechanismPatchSchema = mechanismSchema.partial();

export const partDefinitionSchema = z.object({
  seasonId: z.string().trim().min(1).optional(),
  activeSeasonIds: z.array(z.string().trim().min(1)).optional(),
  name: z.string().trim().min(2),
  partNumber: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  iteration: iterationSchema,
  isArchived: z.boolean().default(false),
  type: z.string().trim().min(1),
  source: z.string().trim().min(1),
  materialId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().default(""),
  photoUrl: z.string().trim().default(""),
});

export const partDefinitionPatchSchema = partDefinitionSchema.partial();

export const partInstanceSchema = z.object({
  subsystemId: z.string().trim().min(1),
  mechanismId: z.string().trim().min(1).nullable().optional(),
  partDefinitionId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  quantity: z.coerce.number().min(1),
  trackIndividually: z.boolean().default(false),
  status: z.enum(["planned", "needed", "available", "installed", "retired"]),
  photoUrl: z.string().trim().default(""),
});

export const partInstancePatchSchema = partInstanceSchema.partial();

export const purchaseItemSchema = z.object({
  title: z.string().trim().min(3),
  subsystemId: z.string().min(1),
  requestedById: z.string().trim().min(1).nullable(),
  partDefinitionId: z.string().trim().min(1).nullable().optional(),
  quantity: z.coerce.number().min(1),
  vendor: z.string().trim().min(2),
  linkLabel: z.string().trim().min(2),
  estimatedCost: z.coerce.number().min(0),
  finalCost: z.coerce.number().min(0).optional(),
  approvedByMentor: z.boolean().default(false),
  status: z.enum(["requested", "approved", "purchased", "shipped", "delivered"]),
});

export const purchaseItemPatchSchema = purchaseItemSchema.partial();

export const materialSchema = z.object({
  name: z.string().trim().min(2),
  category: z.enum([
    "metal",
    "plastic",
    "filament",
    "electronics",
    "hardware",
    "consumable",
    "other",
  ]),
  unit: z.string().trim().min(1),
  onHandQuantity: z.coerce.number().min(0),
  reorderPoint: z.coerce.number().min(0),
  location: z.string().trim().min(1),
  vendor: z.string().trim().min(1),
  notes: z.string().trim().default(""),
});

export const materialPatchSchema = materialSchema.partial();

export const artifactSchema = z.object({
  projectId: z.string().trim().min(1),
  workstreamId: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(["document", "nontechnical"]),
  title: z.string().trim().min(2),
  summary: z.string().trim().default(""),
  status: z.enum(["draft", "in-review", "published"]).default("draft"),
  link: z.string().trim().default(""),
  isArchived: z.boolean().default(false),
  updatedAt: z.string().trim().min(1).optional(),
});

export const artifactPatchSchema = artifactSchema.partial();

export const mediaUploadRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
});

export const manufacturingItemSchema = z.object({
  title: z.string().trim().min(3),
  subsystemId: z.string().min(1),
  requestedById: z.string().trim().min(1).nullable(),
  process: z.enum(["3d-print", "cnc", "fabrication"]),
  dueDate: z.string().date(),
  material: z.string().trim().min(2),
  materialId: z.string().trim().min(1).nullable().optional(),
  partDefinitionId: z.string().trim().min(1).nullable().optional(),
  partInstanceId: z.string().trim().min(1).nullable().optional(),
  partInstanceIds: z.array(z.string().trim().min(1)).optional(),
  quantity: z.coerce.number().min(1),
  status: z.enum(["requested", "approved", "in-progress", "qa", "complete"]),
  mentorReviewed: z.boolean().default(false),
  inHouse: z.boolean().default(true),
  batchLabel: z.string().trim().min(1).optional(),
});

export const manufacturingItemPatchSchema = manufacturingItemSchema.partial();

export const workLogSchema = z.object({
  taskId: z.string().trim().min(1),
  date: z.string().date(),
  hours: z.coerce.number().min(0.5),
  participantIds: z.array(z.string().trim().min(1)).min(1),
  notes: z.string().trim().default(""),
  photoUrl: z.string().trim().default(""),
});

export const workLogPatchSchema = workLogSchema.partial();

const emailCodeLength = runtimeAuthConfig.emailCodeLength;

export const emailSignInRequestSchema = z.object({
  email: z.string().trim().email(),
});

export const emailSignInVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(emailCodeLength),
});

export const tutorialSessionResetSchema = z.object({
  mode: z.enum(["session", "baseline"]).default("session"),
});

export const paginatedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().optional(),
});
