import { FastifyInstance } from "fastify";
import { z } from "zod";

import { authConfig as runtimeAuthConfig, env, requestLimitConfig } from "../config/env";
import { createRequestLimitGuard } from "../security/requestLimits";
import {
  AuthError,
  buildDevelopmentSessionUser,
  getPublicAuthConfig,
  isAuthEnabled,
  requireSession,
  requestEmailSignInCode,
  signSessionToken,
  verifyEmailSignInCode,
  verifyGoogleCredential,
} from "../auth/authService";
import {
  createArtifact,
  createEvent,
  createManufacturingItem,
  createMaterial,
  createMember,
  createMechanism,
  createPartDefinition,
  createPartInstance,
  createProject,
  createSeason,
  createSubsystem,
  createPurchaseItem,
  createTask,
  createWorkLog,
  createWorkstream,
  findDiscipline,
  findEvent,
  findArtifact,
  findMaterial,
  findProject,
  getEvents,
  findMechanism,
  findPartDefinition,
  findPartInstance,
  findSubsystem,
  findWorkstream,
  getDisciplines,
  getMembers,
  getMechanisms,
  getManufacturingItems,
  getArtifacts,
  getMaterials,
  getPartDefinitions,
  getPartInstances,
  getProjects,
  getPurchaseItems,
  getQaReports,
  getRisks,
  getSnapshot,
  getSeasons,
  getSubsystems,
  getTasks,
  getTestResults,
  getWorkstreams,
  removeEvent,
  removeArtifact,
  removeMaterial,
  removeMember,
  removeMechanism,
  removeManufacturingItem,
  removePartDefinition,
  removePartInstance,
  removePurchaseItem,
  removeSubsystem,
  removeTask,
  removeWorkLog,
  updateManufacturingItem,
  updateArtifact,
  updateMaterial,
  updateMember,
  updateMechanism,
  updateEvent,
  updatePartDefinition,
  updatePartInstance,
  updateProject,
  updateSubsystem,
  updatePurchaseItem,
  updateTask,
  updateWorkLog,
  updateWorkstream,
} from "../data/store";
import {
  buildDashboard,
  buildMetrics,
  evaluateTaskCompletion,
  formatTaskStatus,
} from "../domain/workflows";

const memberSchema = z.object({
  name: z.string().trim().min(2),
  email: z.union([z.literal(""), z.string().trim().email()]).default(""),
  role: z.enum(["student", "lead", "mentor", "admin", "external"]),
  elevated: z.boolean().default(false),
  seasonId: z.string().trim().min(1).optional(),
});

const seasonSchema = z.object({
  name: z.string().trim().min(2),
  type: z.enum(["season", "offseason", "initiative"]).default("season"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});
const projectSchema = z.object({
  seasonId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  projectType: z.enum(["robot", "operations", "outreach", "other"]).default("robot"),
  description: z.string().trim().default(""),
  status: z.enum(["planned", "active", "paused", "complete"]).default("active"),
});
const projectPatchSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  status: z.enum(["planned", "active", "paused", "complete"]).optional(),
});

const taskSchema = z.object({
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
  targetEventId: z.string().trim().min(1).nullable(),
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

const taskPatchSchema = taskSchema.partial();
const eventSchema = z.object({
  title: z.string().trim().min(2),
  type: z.enum([
    "drive-practice",
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
});
const eventPatchSchema = z.object({
  title: z.string().trim().min(2).optional(),
  type: z
    .enum(["drive-practice", "competition", "deadline", "internal-review", "demo"])
    .optional(),
  startDateTime: z.string().trim().min(1).optional(),
  endDateTime: z.string().trim().min(1).nullable().optional(),
  isExternal: z.boolean().optional(),
  description: z.string().trim().optional(),
  projectIds: z.array(z.string().trim().min(1)).optional(),
  relatedSubsystemIds: z.array(z.string().trim().min(1)).optional(),
});
const memberPatchSchema = memberSchema.partial();
const iterationSchema = z.coerce.number().int().min(1).default(1);
const workstreamSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  description: z.string().trim().min(3),
  isArchived: z.boolean().default(false),
});
const workstreamPatchSchema = workstreamSchema.partial();
const subsystemSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2),
  description: z.string().trim().min(3),
  iteration: iterationSchema,
  isArchived: z.boolean().default(false),
  parentSubsystemId: z.string().trim().min(1).nullable().optional(),
  responsibleEngineerId: z.string().trim().min(1).nullable(),
  mentorIds: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string().trim().min(1)).default([]),
});
const subsystemPatchSchema = subsystemSchema.partial();
const mechanismSchema = z.object({
  subsystemId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  description: z.string().trim().min(3),
  iteration: iterationSchema,
  isArchived: z.boolean().default(false),
});
const mechanismPatchSchema = mechanismSchema.partial();
const partDefinitionSchema = z.object({
  name: z.string().trim().min(2),
  partNumber: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  iteration: iterationSchema,
  isArchived: z.boolean().default(false),
  type: z.string().trim().min(1),
  source: z.string().trim().min(1),
  materialId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().default(""),
});
const partDefinitionPatchSchema = partDefinitionSchema.partial();
const partInstanceSchema = z.object({
  subsystemId: z.string().trim().min(1),
  mechanismId: z.string().trim().min(1).nullable().optional(),
  partDefinitionId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  quantity: z.coerce.number().min(1),
  trackIndividually: z.boolean().default(false),
  status: z.enum(["planned", "needed", "available", "installed", "retired"]),
});
const partInstancePatchSchema = partInstanceSchema.partial();
const purchaseItemSchema = z.object({
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
const purchaseItemPatchSchema = purchaseItemSchema.partial();
const materialSchema = z.object({
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
const materialPatchSchema = materialSchema.partial();
const artifactSchema = z.object({
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
const artifactPatchSchema = artifactSchema.partial();
const manufacturingItemSchema = z.object({
  title: z.string().trim().min(3),
  subsystemId: z.string().min(1),
  requestedById: z.string().trim().min(1).nullable(),
  process: z.enum(["3d-print", "cnc", "fabrication"]),
  dueDate: z.string().date(),
  material: z.string().trim().min(2),
  partDefinitionId: z.string().trim().min(1).nullable().optional(),
  partInstanceId: z.string().trim().min(1).nullable().optional(),
  partInstanceIds: z.array(z.string().trim().min(1)).optional(),
  quantity: z.coerce.number().min(1),
  status: z.enum(["requested", "approved", "in-progress", "qa", "complete"]),
  mentorReviewed: z.boolean().default(false),
  inHouse: z.boolean().default(true),
  batchLabel: z.string().trim().min(1).optional(),
});
const manufacturingItemPatchSchema = manufacturingItemSchema.partial();
const workLogSchema = z.object({
  taskId: z.string().trim().min(1),
  date: z.string().date(),
  hours: z.coerce.number().min(0.5),
  participantIds: z.array(z.string().trim().min(1)).min(1),
  notes: z.string().trim().default(""),
});
const workLogPatchSchema = workLogSchema.partial();
const emailCodeLength = runtimeAuthConfig.emailCodeLength;
const emailSignInRequestSchema = z.object({
  email: z.string().trim().email(),
});
const emailSignInVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(emailCodeLength),
});

const PAGE_SIZE_OPTIONS = [15, 30, 60] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = PAGE_SIZE_OPTIONS[0];

const paginatedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().optional(),
});

function parsePaginationQuery(query: unknown) {
  const parsed = paginatedQuerySchema.safeParse(query ?? {});
  const requestedPage = parsed.success ? parsed.data.page : undefined;
  const requestedPageSize = parsed.success ? parsed.data.pageSize : undefined;
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize as PageSizeOption)
    ? (requestedPageSize as PageSizeOption)
    : DEFAULT_PAGE_SIZE;

  return {
    page: requestedPage ?? 1,
    pageSize,
  };
}

function paginateItems<T>(items: T[], query: unknown) {
  const { page: requestedPage, pageSize } = parsePaginationQuery(query);
  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

function readPersonFilter(request: { query?: unknown }) {
  const candidate = request.query as { personId?: unknown } | undefined;
  const personId =
    typeof candidate?.personId === "string" && candidate.personId.trim().length > 0
      ? candidate.personId.trim()
      : null;

  return personId;
}

function filterTasksForPerson(personId: string | null) {
  const tasks = getTasks();
  if (!personId) {
    return tasks;
  }

  return tasks.filter((task) => {
    return (
      task.ownerId === personId ||
      (task.assigneeIds ?? []).includes(personId) ||
      task.mentorId === personId
    );
  });
}

function filterPurchaseItemsForPerson(personId: string | null) {
  const items = getPurchaseItems();
  if (!personId) {
    return items;
  }

  return items.filter((item) => item.requestedById === personId);
}

function filterManufacturingItemsForPerson(personId: string | null) {
  const items = getManufacturingItems();
  if (!personId) {
    return items;
  }

  return items.filter((item) => item.requestedById === personId);
}

function filterWorkLogsForPerson(personId: string | null) {
  const workLogs = getSnapshot().workLogs;
  if (!personId) {
    return workLogs;
  }

  return workLogs.filter((workLog) => workLog.participantIds.includes(personId));
}

function getDefaultProjectId() {
  return getProjects()[0]?.id ?? null;
}

function resolveProjectId(input: {
  projectId?: string | null;
  subsystemId?: string | null;
}) {
  if (input.projectId) {
    return input.projectId;
  }

  if (input.subsystemId) {
    const subsystem = findSubsystem(input.subsystemId);
    if (subsystem) {
      return subsystem.projectId;
    }
  }

  return getDefaultProjectId();
}

function resolveWorkstreamId(input: {
  projectId: string;
  requestedWorkstreamId?: string | null;
  subsystemId?: string | null;
}) {
  if (input.requestedWorkstreamId !== undefined) {
    return input.requestedWorkstreamId;
  }

  if (!input.subsystemId) {
    return null;
  }

  const subsystem = findSubsystem(input.subsystemId);
  if (!subsystem) {
    return null;
  }

  return (
    getWorkstreams().find(
      (workstream) =>
        workstream.projectId === input.projectId &&
        workstream.name.toLowerCase() === subsystem.name.toLowerCase(),
    )?.id ?? null
  );
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function readTargetIds(input: {
  id?: string | null;
  ids?: string[];
  fallbackId?: string | null;
  fallbackIds?: string[];
}) {
  if (input.ids !== undefined) {
    return uniqueIds(input.ids);
  }

  if (input.id !== undefined) {
    return uniqueIds([input.id]);
  }

  return uniqueIds(input.fallbackIds ?? [input.fallbackId]);
}

function normalizeTaskTargets(
  input: {
    workstreamId?: string | null;
    workstreamIds?: string[];
    subsystemId?: string;
    subsystemIds?: string[];
    mechanismId?: string | null;
    mechanismIds?: string[];
    partInstanceId?: string | null;
    partInstanceIds?: string[];
  },
  fallback?: {
    workstreamId: string | null;
    workstreamIds: string[];
    subsystemId: string;
    subsystemIds: string[];
    mechanismId: string | null;
    mechanismIds: string[];
    partInstanceId: string | null;
    partInstanceIds: string[];
  },
) {
  const partInstanceIds = readTargetIds({
    id: input.partInstanceId,
    ids: input.partInstanceIds,
    fallbackId: fallback?.partInstanceId,
    fallbackIds: fallback?.partInstanceIds,
  });
  const partInstances = partInstanceIds
    .map((partInstanceId) => findPartInstance(partInstanceId))
    .filter((partInstance): partInstance is NonNullable<typeof partInstance> =>
      Boolean(partInstance),
    );
  const explicitMechanismIds = readTargetIds({
    id: input.mechanismId,
    ids: input.mechanismIds,
    fallbackId: fallback?.mechanismId,
    fallbackIds: fallback?.mechanismIds,
  });
  const mechanismIds = uniqueIds([
    ...explicitMechanismIds,
    ...partInstances.map((partInstance) => partInstance.mechanismId),
  ]);
  const mechanisms = mechanismIds
    .map((mechanismId) => findMechanism(mechanismId))
    .filter((mechanism): mechanism is NonNullable<typeof mechanism> =>
      Boolean(mechanism),
    );
  const explicitSubsystemIds = readTargetIds({
    id: input.subsystemId,
    ids: input.subsystemIds,
    fallbackId: fallback?.subsystemId,
    fallbackIds: fallback?.subsystemIds,
  });
  const subsystemIds = uniqueIds([
    ...explicitSubsystemIds,
    ...mechanisms.map((mechanism) => mechanism.subsystemId),
    ...partInstances.map((partInstance) => partInstance.subsystemId),
  ]);
  const workstreamIds = readTargetIds({
    id: input.workstreamId,
    ids: input.workstreamIds,
    fallbackId: fallback?.workstreamId,
    fallbackIds: fallback?.workstreamIds,
  });

  return {
    workstreamId: workstreamIds[0] ?? null,
    workstreamIds,
    subsystemId: subsystemIds[0] ?? "",
    subsystemIds,
    mechanismId: mechanismIds[0] ?? null,
    mechanismIds,
    partInstanceId: partInstanceIds[0] ?? null,
    partInstanceIds,
  };
}

function withManufacturingQaReviewCounts(
  items: ReturnType<typeof getManufacturingItems>,
  snapshot = getSnapshot(),
) {
  const counts = new Map<string, number>();
  for (const review of snapshot.qaReviews) {
    if (review.subjectType !== "manufacturing") {
      continue;
    }

    counts.set(review.subjectId, (counts.get(review.subjectId) ?? 0) + 1);
  }

  return items.map((item) => ({
    ...item,
    qaReviewCount: counts.get(item.id) ?? 0,
  }));
}

function validateWorkLogLinks(input: {
  taskId: string;
  participantIds: string[];
}) {
  const taskExists = getTasks().some((task) => task.id === input.taskId);
  if (!taskExists) {
    return "The selected task does not exist.";
  }

  const memberIds = new Set(getMembers().map((member) => member.id));
  const missingParticipant = input.participantIds.find(
    (participantId) => !memberIds.has(participantId),
  );
  if (missingParticipant) {
    return "One or more selected participants do not exist.";
  }

  return null;
}

function validateTaskLinks(input: {
  projectId: string;
  workstreamId?: string | null;
  workstreamIds?: string[];
  subsystemId?: string | null;
  subsystemIds: string[];
  disciplineId?: string;
  mechanismId?: string | null;
  mechanismIds?: string[];
  partInstanceId?: string | null;
  partInstanceIds?: string[];
  targetEventId?: string | null;
  assigneeIds?: string[];
}) {
  const project = findProject(input.projectId);
  if (!project) {
    return "The selected project does not exist.";
  }

  const workstreamIds = uniqueIds([
    ...(input.workstreamIds ?? []),
    input.workstreamId,
  ]);
  for (const workstreamId of workstreamIds) {
    const workstream = findWorkstream(workstreamId);
    if (!workstream) {
      return "The selected workstream does not exist.";
    }

    if (workstream.projectId !== project.id) {
      return "The selected workstream does not belong to the selected project.";
    }
  }

  const subsystemIds = uniqueIds([
    ...input.subsystemIds,
    input.subsystemId,
  ]);
  if (subsystemIds.length === 0) {
    return "Select at least one subsystem, mechanism, or part instance target.";
  }
  for (const subsystemId of subsystemIds) {
    const subsystem = findSubsystem(subsystemId);
    if (!subsystem) {
      return "The selected subsystem does not exist.";
    }
    if (subsystem.projectId !== project.id) {
      return "The selected subsystem does not belong to the selected project.";
    }
  }

  if (input.disciplineId && !findDiscipline(input.disciplineId)) {
    return "The selected discipline does not exist.";
  }

  const mechanismIds = uniqueIds([
    ...(input.mechanismIds ?? []),
    input.mechanismId,
  ]);
  for (const mechanismId of mechanismIds) {
    const mechanism = findMechanism(mechanismId);
    if (!mechanism) {
      return "The selected mechanism does not exist.";
    }

    if (!subsystemIds.includes(mechanism.subsystemId)) {
      return "One or more selected mechanisms do not belong to a selected subsystem.";
    }
  }

  const partInstanceIds = uniqueIds([
    ...(input.partInstanceIds ?? []),
    input.partInstanceId,
  ]);
  for (const partInstanceId of partInstanceIds) {
    const partInstance = findPartInstance(partInstanceId);
    if (!partInstance) {
      return "The selected part instance does not exist.";
    }

    if (!subsystemIds.includes(partInstance.subsystemId)) {
      return "One or more selected part instances do not belong to a selected subsystem.";
    }

    if (!partInstance.mechanismId) {
      return "The selected part instance must be linked to a mechanism.";
    }

    if (!mechanismIds.includes(partInstance.mechanismId)) {
      return "One or more selected part instances do not belong to a selected mechanism.";
    }
  }

  if (input.targetEventId) {
    const event = getEvents().find((candidate) => candidate.id === input.targetEventId);
    if (!event) {
      return "The selected event does not exist.";
    }
  }

  if (input.assigneeIds && input.assigneeIds.length > 0) {
    const membersById = new Map(getMembers().map((member) => [member.id, member]));
    for (const assigneeId of input.assigneeIds) {
      const assignee = membersById.get(assigneeId);
      if (!assignee) {
        return "One or more assigned students do not exist.";
      }

      if (assignee.role !== "student" && assignee.role !== "lead") {
        return "Assigned task members must be students or leads.";
      }
    }
  }

  return null;
}

function validateArtifactLinks(input: {
  projectId: string;
  workstreamId?: string | null | undefined;
}) {
  const project = findProject(input.projectId);
  if (!project) {
    return "The selected project does not exist.";
  }

  if (input.workstreamId) {
    const workstream = findWorkstream(input.workstreamId);
    if (!workstream) {
      return "The selected workstream does not exist.";
    }

    if (workstream.projectId !== project.id) {
      return "The selected workstream does not belong to the selected project.";
    }
  }

  return null;
}

function validatePartDefinitionLink(partDefinitionId: string | null | undefined) {
  if (!partDefinitionId) {
    return "Please select a real part from the Parts tab.";
  }

  if (!findPartDefinition(partDefinitionId)) {
    return "Please select a real part from the Parts tab.";
  }

  return null;
}

function validatePartDefinitionMaterialId(materialId: string | null | undefined) {
  if (materialId === undefined || materialId === null) {
    return null;
  }

  if (!findMaterial(materialId)) {
    return "The selected material does not exist.";
  }

  return null;
}

function validatePartInstanceLinks(input: {
  subsystemId: string;
  mechanismId?: string | null | undefined;
  partDefinitionId: string;
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (input.mechanismId) {
    const mechanism = findMechanism(input.mechanismId);
    if (!mechanism) {
      return "The selected mechanism does not exist.";
    }

    if (mechanism.subsystemId !== input.subsystemId) {
      return "The selected mechanism does not belong to the selected subsystem.";
    }
  }

  return validatePartDefinitionLink(input.partDefinitionId);
}

function validatePurchaseItemLinks(input: {
  subsystemId: string;
  partDefinitionId?: string | null | undefined;
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (!input.partDefinitionId) {
    return null;
  }

  return validatePartDefinitionLink(input.partDefinitionId);
}

function validateManufacturingItemLinks(input: {
  subsystemId: string;
  process: string;
  partDefinitionId?: string | null | undefined;
  partInstanceId?: string | null | undefined;
  partInstanceIds?: string[];
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (input.partDefinitionId) {
    const partDefinitionError = validatePartDefinitionLink(input.partDefinitionId);
    if (partDefinitionError) {
      return partDefinitionError;
    }
  }

  const partInstanceIds = uniqueIds([
    ...(input.partInstanceIds ?? []),
    input.partInstanceId,
  ]);
  for (const partInstanceId of partInstanceIds) {
    const partInstance = findPartInstance(partInstanceId);
    if (!partInstance) {
      return "The selected part instance does not exist.";
    }

    if (
      input.partDefinitionId &&
      partInstance.partDefinitionId !== input.partDefinitionId
    ) {
      return "The selected part instance does not match the selected part definition.";
    }
  }

  return null;
}

function validateSubsystemPeople(input: {
  projectId: string;
  responsibleEngineerId?: string | null;
  mentorIds?: string[];
}) {
  const members = getMembers();
  const project = findProject(input.projectId);
  const seasonId = project?.seasonId ?? null;

  if (
    input.responsibleEngineerId &&
    !members.some((member) => member.id === input.responsibleEngineerId)
  ) {
    return "The selected responsible engineer does not exist.";
  }
  if (
    seasonId &&
    input.responsibleEngineerId &&
    !members.some(
      (member) =>
        member.id === input.responsibleEngineerId &&
        member.seasonId === seasonId,
    )
  ) {
    return "The responsible engineer must belong to the project's season.";
  }

  if (input.mentorIds) {
    const invalidMentor = input.mentorIds.find(
      (mentorId) => !members.some((member) => member.id === mentorId),
    );

    if (invalidMentor) {
      return "One of the selected mentors does not exist.";
    }
    if (
      seasonId &&
      input.mentorIds.some(
        (mentorId) =>
          !members.some(
            (member) => member.id === mentorId && member.seasonId === seasonId,
          ),
      )
    ) {
      return "Mentors must belong to the project's season.";
    }
  }

  return null;
}

function wouldCreateSubsystemCycle(
  subsystemId: string,
  parentSubsystemId: string | null,
) {
  const visitedSubsystemIds = new Set<string>();
  let nextParentSubsystemId = parentSubsystemId;

  while (nextParentSubsystemId) {
    if (nextParentSubsystemId === subsystemId) {
      return true;
    }

    if (visitedSubsystemIds.has(nextParentSubsystemId)) {
      return true;
    }

    visitedSubsystemIds.add(nextParentSubsystemId);
    nextParentSubsystemId =
      findSubsystem(nextParentSubsystemId)?.parentSubsystemId ?? null;
  }

  return false;
}

function validateEventSubsystemLinks(relatedSubsystemIds: string[]) {
  const unknownSubsystemId = relatedSubsystemIds.find(
    (subsystemId) => !findSubsystem(subsystemId),
  );

  if (unknownSubsystemId) {
    return "One or more related subsystems do not exist.";
  }

  return null;
}

function validateEventProjectLinks(projectIds: string[], relatedSubsystemIds: string[]) {
  const unknownProjectId = projectIds.find((projectId) => !findProject(projectId));

  if (unknownProjectId) {
    return "One or more related projects do not exist.";
  }

  if (projectIds.length === 0) {
    return null;
  }

  const selectedProjectIds = new Set(projectIds);
  const mismatchedSubsystemId = relatedSubsystemIds.find((subsystemId) => {
    const subsystem = findSubsystem(subsystemId);
    return subsystem ? !selectedProjectIds.has(subsystem.projectId) : false;
  });

  if (mismatchedSubsystemId) {
    return "Related subsystems must belong to the selected projects.";
  }

  return null;
}

const allowApiRouteRequest = createRequestLimitGuard({
  scope: "api",
  ...requestLimitConfig.api,
});
const allowAuthRouteRequest = createRequestLimitGuard({
  scope: "auth",
  ...requestLimitConfig.auth,
});
const allowAuthEmailRouteRequest = createRequestLimitGuard({
  scope: "auth-email",
  ...requestLimitConfig.authEmail,
});

export async function registerRoutes(app: FastifyInstance) {
  const requireApiSessionIfEnabled = (
    request: Parameters<typeof requireSession>[0],
    reply: Parameters<typeof requireSession>[1],
  ) => {
    if (!allowApiRouteRequest(request, reply)) {
      return false;
    }

    if (!isAuthEnabled()) {
      return true;
    }

    return Boolean(requireSession(request, reply));
  };

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "meco-platform",
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/api/auth/config", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) {
      return;
    }

    return getPublicAuthConfig();
  });

  app.post<{
    Body: {
      credential?: string;
    };
  }>("/api/auth/google", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) {
      return;
    }

    const credential = request.body?.credential;
    if (!credential) {
      return reply.code(400).send({
        message: "Google did not provide a credential to exchange.",
      });
    }

    try {
      const user = await verifyGoogleCredential(credential);
      const token = signSessionToken(user);

      return {
        token,
        user,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({
          message: error.message,
        });
      }

      request.log.error({ err: error }, "Google authentication failed");
      return reply.code(500).send({
        message: "Google authentication failed unexpectedly.",
      });
    }
  });

  if (env.NODE_ENV !== "production") {
    app.post("/api/auth/dev-bypass", async (request, reply) => {
      if (!allowAuthRouteRequest(request, reply)) {
        return;
      }

      if (!runtimeAuthConfig.enabled) {
        return reply.code(503).send({
          message: "Development sign-in is not available until auth is configured.",
        });
      }

      const user = buildDevelopmentSessionUser();
      const token = signSessionToken(user);

      return {
        token,
        user,
      };
    });
  }

  app.post<{ Body: unknown }>("/api/auth/email/start", async (request, reply) => {
    if (!allowAuthEmailRouteRequest(request, reply)) {
      return;
    }

    const parsed = emailSignInRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Email sign-in payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      return await requestEmailSignInCode(parsed.data.email);
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({
          message: error.message,
        });
      }

      request.log.error({ err: error }, "Email sign-in code request failed");
      return reply.code(500).send({
        message: "Email sign-in failed unexpectedly.",
      });
    }
  });

  app.post<{ Body: unknown }>("/api/auth/email/verify", async (request, reply) => {
    if (!allowAuthEmailRouteRequest(request, reply)) {
      return;
    }

    const parsed = emailSignInVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Email verification payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const user = verifyEmailSignInCode(parsed.data.email, parsed.data.code);
      const token = signSessionToken(user);

      return {
        token,
        user,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({
          message: error.message,
        });
      }

      request.log.error({ err: error }, "Email authentication failed");
      return reply.code(500).send({
        message: "Email authentication failed unexpectedly.",
      });
    }
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!allowAuthRouteRequest(request, reply)) {
      return;
    }

    if (!isAuthEnabled()) {
      return {
        enabled: false,
        user: null,
      };
    }

    const session = requireSession(request, reply);
    if (!session) {
      return;
    }

    return {
      enabled: true,
      user: session,
    };
  });

  app.get("/api/dashboard", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return buildDashboard(getSnapshot());
  });

  app.get("/api/bootstrap", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const snapshot = getSnapshot();
    const personId = readPersonFilter(request);

    return {
      seasons: snapshot.seasons,
      projects: snapshot.projects,
      workstreams: snapshot.workstreams,
      members: snapshot.members,
      subsystems: snapshot.subsystems,
      disciplines: snapshot.disciplines,
      mechanisms: snapshot.mechanisms,
      materials: snapshot.materials,
      artifacts: snapshot.artifacts,
      partDefinitions: snapshot.partDefinitions,
      partInstances: snapshot.partInstances,
      events: snapshot.events,
      qaReports: snapshot.qaReports,
      testResults: snapshot.testResults,
      risks: snapshot.risks,
      meetings: snapshot.meetings,
      attendanceRecords: snapshot.attendanceRecords,
      qaReviews: snapshot.qaReviews,
      escalations: snapshot.escalations,
      tasks: filterTasksForPerson(personId),
      workLogs: filterWorkLogsForPerson(personId),
      purchaseItems: filterPurchaseItemsForPerson(personId),
      manufacturingItems: withManufacturingQaReviewCounts(
        filterManufacturingItemsForPerson(personId),
        snapshot,
      ),
    };
  });

  app.get("/api/seasons", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getSeasons(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/seasons", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = seasonSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Season payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const currentYear = new Date().toISOString().slice(0, 4);
    const startDate = parsed.data.startDate ?? `${currentYear}-01-01`;
    const endDate = parsed.data.endDate ?? `${currentYear}-12-31`;

    if (startDate > endDate) {
      return reply.code(400).send({
        message: "Season start date must be on or before the end date.",
      });
    }

    const season = createSeason({
      name: parsed.data.name,
      type: parsed.data.type,
      startDate,
      endDate,
    });

    return reply.code(201).send({
      item: season,
    });
  });

  app.get("/api/projects", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getProjects(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/projects", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = projectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Project payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (!getSeasons().some((season) => season.id === parsed.data.seasonId)) {
      return reply.code(400).send({
        message: "The selected season does not exist.",
      });
    }

    const project = createProject(parsed.data);

    return reply.code(201).send({
      item: project,
    });
  });

  app.patch<{ Body: unknown; Params: { projectId: string } }>(
    "/api/projects/:projectId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = projectPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Project update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      if (!findProject(request.params.projectId)) {
        return reply.code(404).send({
          message: "Project not found.",
        });
      }

      const project = updateProject(request.params.projectId, parsed.data);

      return {
        item: project,
      };
    },
  );

  app.get("/api/workstreams", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getWorkstreams(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/workstreams", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = workstreamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Workstream payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (!findProject(parsed.data.projectId)) {
      return reply.code(400).send({
        message: "The selected project does not exist.",
      });
    }

    const workstream = createWorkstream(parsed.data);

    return reply.code(201).send({
      item: workstream,
    });
  });

  app.patch<{ Body: unknown; Params: { workstreamId: string } }>(
    "/api/workstreams/:workstreamId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = workstreamPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Workstream update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentWorkstream = findWorkstream(request.params.workstreamId);
      if (!currentWorkstream) {
        return reply.code(404).send({
          message: "Workstream not found.",
        });
      }

      const nextProjectId = parsed.data.projectId ?? currentWorkstream.projectId;
      if (!findProject(nextProjectId)) {
        return reply.code(400).send({
          message: "The selected project does not exist.",
        });
      }

      const workstream = updateWorkstream(request.params.workstreamId, {
        ...parsed.data,
        projectId: nextProjectId,
      });

      return {
        item: workstream,
      };
    },
  );

  app.get("/api/qa-reports", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getQaReports(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get("/api/test-results", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getTestResults(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get("/api/risks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getRisks(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/work-logs", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = workLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Work log payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateWorkLogLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const workLog = createWorkLog({
      ...parsed.data,
      notes: parsed.data.notes.trim(),
      participantIds: Array.from(new Set(parsed.data.participantIds)),
    });

    return reply.code(201).send({
      item: workLog,
    });
  });

  app.patch<{ Body: unknown; Params: { workLogId: string } }>(
    "/api/work-logs/:workLogId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = workLogPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Work log update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentWorkLog = getSnapshot().workLogs.find(
        (workLog) => workLog.id === request.params.workLogId,
      );
      if (!currentWorkLog) {
        return reply.code(404).send({
          message: "Work log not found.",
        });
      }

      const nextWorkLogShape = {
        taskId: parsed.data.taskId ?? currentWorkLog.taskId,
        participantIds: parsed.data.participantIds ?? currentWorkLog.participantIds,
      };
      const validationError = validateWorkLogLinks(nextWorkLogShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const workLog = updateWorkLog(request.params.workLogId, {
        ...parsed.data,
        notes:
          parsed.data.notes === undefined
            ? undefined
            : parsed.data.notes.trim(),
        participantIds:
          parsed.data.participantIds === undefined
            ? undefined
            : Array.from(new Set(parsed.data.participantIds)),
      });

      return {
        item: workLog,
      };
    },
  );

  app.delete<{ Params: { workLogId: string } }>(
    "/api/work-logs/:workLogId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const workLog = removeWorkLog(request.params.workLogId);
      if (!workLog) {
        return reply.code(404).send({
          message: "Work log not found.",
        });
      }

      return {
        item: workLog,
      };
    },
  );

  app.get("/api/tasks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const snapshot = getSnapshot();
    const personId = readPersonFilter(request);
    const items = filterTasksForPerson(personId).map((task) => ({
      id: task.id,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      workstreamIds: task.workstreamIds,
      title: task.title,
      summary: task.summary,
      subsystemId: task.subsystemId,
      subsystemIds: task.subsystemIds,
      disciplineId: task.disciplineId,
      mechanismId: task.mechanismId,
      mechanismIds: task.mechanismIds,
      partInstanceId: task.partInstanceId,
      partInstanceIds: task.partInstanceIds,
      targetEventId: task.targetEventId,
      ownerId: task.ownerId,
      assigneeIds: task.assigneeIds ?? [],
      mentorId: task.mentorId,
      startDate: task.startDate,
      dueDate: task.dueDate,
      status: formatTaskStatus(task.status),
      rawStatus: task.status,
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      dependencyIds: task.dependencyIds,
      gate: evaluateTaskCompletion(task, snapshot),
      blockers: task.blockers,
      linkedManufacturingIds: task.linkedManufacturingIds,
      linkedPurchaseIds: task.linkedPurchaseIds,
      requiresDocumentation: task.requiresDocumentation,
      documentationLinked: task.documentationLinked,
    }));
    const paginated = paginateItems(items, request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.get("/api/events", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getEvents(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/events", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Event payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const projectIds = Array.from(new Set(parsed.data.projectIds));
    const relatedSubsystemIds = Array.from(new Set(parsed.data.relatedSubsystemIds));
    const validationError =
      validateEventSubsystemLinks(relatedSubsystemIds) ??
      validateEventProjectLinks(projectIds, relatedSubsystemIds);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const event = createEvent({
      ...parsed.data,
      endDateTime: parsed.data.endDateTime ?? null,
      description: parsed.data.description ?? "",
      projectIds,
      relatedSubsystemIds,
    });

    return reply.code(201).send({
      item: event,
    });
  });

  app.patch<{ Body: unknown; Params: { eventId: string } }>(
    "/api/events/:eventId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = eventPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Event update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentEvent = findEvent(request.params.eventId);
      if (!currentEvent) {
        return reply.code(404).send({
          message: "Event not found.",
        });
      }

      const nextRelatedSubsystemIds =
        parsed.data.relatedSubsystemIds === undefined
          ? currentEvent.relatedSubsystemIds
          : Array.from(new Set(parsed.data.relatedSubsystemIds));
      const nextProjectIds =
        parsed.data.projectIds === undefined
          ? currentEvent.projectIds ?? []
          : Array.from(new Set(parsed.data.projectIds));

      const validationError =
        validateEventSubsystemLinks(nextRelatedSubsystemIds) ??
        validateEventProjectLinks(nextProjectIds, nextRelatedSubsystemIds);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const event = updateEvent(request.params.eventId, {
        ...parsed.data,
        endDateTime:
          parsed.data.endDateTime === undefined
            ? currentEvent.endDateTime
            : parsed.data.endDateTime,
        description:
          parsed.data.description === undefined
            ? currentEvent.description
            : parsed.data.description,
        projectIds: nextProjectIds,
        relatedSubsystemIds: nextRelatedSubsystemIds,
      });

      return {
        item: event,
      };
    },
  );

  app.delete<{ Params: { eventId: string } }>(
    "/api/events/:eventId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const event = removeEvent(request.params.eventId);
      if (!event) {
        return reply.code(404).send({
          message: "Event not found.",
        });
      }

      return {
        item: event,
      };
    },
  );

  app.get("/api/materials", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getMaterials(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/materials", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = materialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Material payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const material = createMaterial({
      ...parsed.data,
      notes: parsed.data.notes ?? "",
    });

    return reply.code(201).send({
      item: material,
    });
  });

  app.patch<{ Body: unknown; Params: { materialId: string } }>(
    "/api/materials/:materialId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = materialPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Material update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentMaterial = findMaterial(request.params.materialId);
      if (!currentMaterial) {
        return reply.code(404).send({
          message: "Material not found.",
        });
      }

      const material = updateMaterial(request.params.materialId, parsed.data);
      return {
        item: material,
      };
    },
  );

  app.delete<{ Params: { materialId: string } }>(
    "/api/materials/:materialId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const material = removeMaterial(request.params.materialId);
      if (!material) {
        return reply.code(404).send({
          message: "Material not found.",
        });
      }

      return {
        item: material,
      };
    },
  );

  app.get("/api/artifacts", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getArtifacts(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/artifacts", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = artifactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Artifact payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateArtifactLinks({
      projectId: parsed.data.projectId,
      workstreamId: parsed.data.workstreamId ?? null,
    });
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const artifact = createArtifact({
      ...parsed.data,
      workstreamId: parsed.data.workstreamId ?? null,
      summary: parsed.data.summary ?? "",
      status: parsed.data.status ?? "draft",
      link: parsed.data.link ?? "",
      isArchived: parsed.data.isArchived ?? false,
      updatedAt: parsed.data.updatedAt ?? new Date().toISOString(),
    });

    return reply.code(201).send({
      item: artifact,
    });
  });

  app.patch<{ Body: unknown; Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = artifactPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Artifact update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentArtifact = findArtifact(request.params.artifactId);
      if (!currentArtifact) {
        return reply.code(404).send({
          message: "Artifact not found.",
        });
      }

      const nextProjectId = parsed.data.projectId ?? currentArtifact.projectId;
      const nextWorkstreamId =
        parsed.data.workstreamId === undefined
          ? currentArtifact.workstreamId
          : parsed.data.workstreamId;
      const validationError = validateArtifactLinks({
        projectId: nextProjectId,
        workstreamId: nextWorkstreamId,
      });
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const artifact = updateArtifact(request.params.artifactId, {
        ...parsed.data,
        projectId: nextProjectId,
        workstreamId: nextWorkstreamId ?? null,
        updatedAt: parsed.data.updatedAt ?? new Date().toISOString(),
      });

      return {
        item: artifact,
      };
    },
  );

  app.delete<{ Params: { artifactId: string } }>(
    "/api/artifacts/:artifactId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const artifact = removeArtifact(request.params.artifactId);
      if (!artifact) {
        return reply.code(404).send({
          message: "Artifact not found.",
        });
      }

      return {
        item: artifact,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/tasks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = taskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Task payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const targetIds = normalizeTaskTargets(parsed.data);
    const projectId = resolveProjectId({
      projectId: parsed.data.projectId,
      subsystemId: targetIds.subsystemId,
    });
    if (!projectId) {
      return reply.code(400).send({
        message: "Task payload references an unknown project.",
      });
    }

    const defaultWorkstreamId = resolveWorkstreamId({
      projectId,
      requestedWorkstreamId: parsed.data.workstreamId,
      subsystemId: targetIds.subsystemId,
    });
    const workstreamIds =
      targetIds.workstreamIds.length > 0
        ? targetIds.workstreamIds
        : uniqueIds([defaultWorkstreamId]);
    const taskInput = {
      ...parsed.data,
      projectId,
      ...targetIds,
      workstreamId: workstreamIds[0] ?? null,
      workstreamIds,
      assigneeIds: uniqueIds(parsed.data.assigneeIds ?? []),
      startDate: parsed.data.startDate ?? parsed.data.dueDate,
      requiresDocumentation: parsed.data.requiresDocumentation ?? false,
      documentationLinked: parsed.data.documentationLinked ?? false,
    };

    const taskValidationError = validateTaskLinks(taskInput);
    if (taskValidationError) {
      return reply.code(400).send({
        message: taskValidationError,
      });
    }

    const createdTask = createTask(taskInput);
    return reply.code(201).send({
      item: createdTask,
    });
  });

  app.patch<{ Body: unknown; Params: { taskId: string } }>(
    "/api/tasks/:taskId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = taskPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Task update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentTask = getTasks().find((task) => task.id === request.params.taskId);
      if (!currentTask) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

      const targetIds = normalizeTaskTargets(parsed.data, currentTask);
      const nextProjectId = resolveProjectId({
        projectId: parsed.data.projectId,
        subsystemId: targetIds.subsystemId,
      }) ?? currentTask.projectId;
      const workstreamWasProvided =
        parsed.data.workstreamId !== undefined || parsed.data.workstreamIds !== undefined;
      const subsystemWasProvided =
        parsed.data.subsystemId !== undefined || parsed.data.subsystemIds !== undefined;
      const defaultWorkstreamId =
        !workstreamWasProvided && subsystemWasProvided
          ? resolveWorkstreamId({
              projectId: nextProjectId,
              subsystemId: targetIds.subsystemId,
            })
          : targetIds.workstreamId;
      const workstreamIds =
        workstreamWasProvided || !subsystemWasProvided
          ? targetIds.workstreamIds
          : uniqueIds([defaultWorkstreamId]);
      const nextTaskShape = {
        projectId: nextProjectId,
        ...targetIds,
        workstreamId: workstreamIds[0] ?? null,
        workstreamIds,
        assigneeIds:
          parsed.data.assigneeIds === undefined
            ? currentTask.assigneeIds ?? []
            : uniqueIds(parsed.data.assigneeIds),
        disciplineId: parsed.data.disciplineId ?? currentTask.disciplineId,
        targetEventId:
          parsed.data.targetEventId === undefined
            ? currentTask.targetEventId
            : parsed.data.targetEventId,
      };

      const taskValidationError = validateTaskLinks(nextTaskShape);
      if (taskValidationError) {
        return reply.code(400).send({
          message: taskValidationError,
        });
      }

      const updatedTask = updateTask(request.params.taskId, {
        ...parsed.data,
        projectId: nextTaskShape.projectId,
        workstreamId: nextTaskShape.workstreamId,
        workstreamIds: nextTaskShape.workstreamIds,
        subsystemId: nextTaskShape.subsystemId,
        subsystemIds: nextTaskShape.subsystemIds,
        mechanismId: nextTaskShape.mechanismId,
        mechanismIds: nextTaskShape.mechanismIds,
        partInstanceId: nextTaskShape.partInstanceId,
        partInstanceIds: nextTaskShape.partInstanceIds,
      });
      return {
        item: updatedTask,
      };
    },
  );

  app.delete<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const task = removeTask(request.params.taskId);
      if (!task) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

      return {
        item: task,
      };
    },
  );

  app.get("/api/members", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getMembers(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/members", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = memberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Roster payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }
    if (
      parsed.data.seasonId !== undefined &&
      !getSeasons().some((season) => season.id === parsed.data.seasonId)
    ) {
      return reply.code(400).send({
        message: "Roster payload references an unknown season.",
      });
    }

    const member = createMember(parsed.data);
    return reply.code(201).send({
      item: member,
    });
  });

  app.patch<{ Body: unknown; Params: { memberId: string } }>(
    "/api/members/:memberId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = memberPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Roster update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }
      if (
        parsed.data.seasonId !== undefined &&
        !getSeasons().some((season) => season.id === parsed.data.seasonId)
      ) {
        return reply.code(400).send({
          message: "Roster update payload references an unknown season.",
        });
      }

      const member = updateMember(request.params.memberId, parsed.data);
      if (!member) {
        return reply.code(404).send({
          message: "Member not found.",
        });
      }

      return {
        item: member,
      };
    },
  );

  app.delete<{ Params: { memberId: string } }>(
    "/api/members/:memberId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const member = removeMember(request.params.memberId);
      if (!member) {
        return reply.code(404).send({
          message: "Member not found.",
        });
      }

      return {
        item: member,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/subsystems", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = subsystemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Subsystem payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const projectId = parsed.data.projectId ?? getDefaultProjectId();
    if (!projectId || !findProject(projectId)) {
      return reply.code(400).send({
        message: "The selected project does not exist.",
      });
    }

    const validationError = validateSubsystemPeople({
      ...parsed.data,
      projectId,
    });
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    if (parsed.data.parentSubsystemId) {
      const parentSubsystem = findSubsystem(parsed.data.parentSubsystemId);
      if (!parentSubsystem) {
        return reply.code(400).send({
          message: "The selected parent subsystem does not exist.",
        });
      }
      if (parentSubsystem.projectId !== projectId) {
        return reply.code(400).send({
          message: "The selected parent subsystem does not belong to the selected project.",
        });
      }
    }

    const subsystem = createSubsystem({
      ...parsed.data,
      projectId,
      parentSubsystemId: parsed.data.parentSubsystemId ?? null,
      mentorIds: parsed.data.mentorIds ?? [],
      risks: parsed.data.risks ?? [],
      responsibleEngineerId: parsed.data.responsibleEngineerId ?? null,
    });

    return reply.code(201).send({
      item: subsystem,
    });
  });

  app.patch<{ Body: unknown; Params: { subsystemId: string } }>(
    "/api/subsystems/:subsystemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = subsystemPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Subsystem update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentSubsystem = findSubsystem(request.params.subsystemId);
      if (!currentSubsystem) {
        return reply.code(404).send({
          message: "Subsystem not found.",
        });
      }
      const nextProjectId = parsed.data.projectId ?? currentSubsystem.projectId;
      const nextParentSubsystemId =
        parsed.data.parentSubsystemId === undefined
          ? currentSubsystem.parentSubsystemId
          : parsed.data.parentSubsystemId;
      const nextResponsibleEngineerId =
        parsed.data.responsibleEngineerId === undefined
          ? currentSubsystem.responsibleEngineerId
          : parsed.data.responsibleEngineerId;
      const nextMentorIds = parsed.data.mentorIds ?? currentSubsystem.mentorIds;
      if (!findProject(nextProjectId)) {
        return reply.code(400).send({
          message: "The selected project does not exist.",
        });
      }

      if (currentSubsystem.isCore && nextParentSubsystemId !== null) {
        return reply.code(400).send({
          message: "Drivetrain cannot have a parent subsystem.",
        });
      }

      const validationError = validateSubsystemPeople({
        projectId: nextProjectId,
        responsibleEngineerId: nextResponsibleEngineerId,
        mentorIds: nextMentorIds,
      });
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      if (nextParentSubsystemId && nextParentSubsystemId === currentSubsystem.id) {
        return reply.code(400).send({
          message: "A subsystem cannot be its own parent.",
        });
      }

      if (nextParentSubsystemId && !findSubsystem(nextParentSubsystemId)) {
        return reply.code(400).send({
          message: "The selected parent subsystem does not exist.",
        });
      }
      if (nextParentSubsystemId) {
        const parentSubsystem = findSubsystem(nextParentSubsystemId);
        if (parentSubsystem && parentSubsystem.projectId !== nextProjectId) {
          return reply.code(400).send({
            message: "The selected parent subsystem does not belong to the selected project.",
          });
        }
      }
      if (
        wouldCreateSubsystemCycle(currentSubsystem.id, nextParentSubsystemId)
      ) {
        return reply.code(400).send({
          message: "A subsystem cannot use one of its descendants as its parent.",
        });
      }

      const subsystem = updateSubsystem(request.params.subsystemId, {
        ...parsed.data,
        projectId: nextProjectId,
        mentorIds: nextMentorIds,
        risks: parsed.data.risks ?? currentSubsystem.risks,
        parentSubsystemId: nextParentSubsystemId,
        responsibleEngineerId: nextResponsibleEngineerId,
      });

      return {
        item: subsystem,
      };
    },
  );

  app.delete<{ Params: { subsystemId: string } }>(
    "/api/subsystems/:subsystemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const currentSubsystem = findSubsystem(request.params.subsystemId);
      if (!currentSubsystem) {
        return reply.code(404).send({
          message: "Subsystem not found.",
        });
      }

      if (currentSubsystem.isCore) {
        return reply.code(400).send({
          message: "Core subsystems cannot be deleted.",
        });
      }

      const subsystem = removeSubsystem(request.params.subsystemId);
      return {
        item: subsystem,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/mechanisms", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = mechanismSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Mechanism payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    if (!findSubsystem(parsed.data.subsystemId)) {
      return reply.code(400).send({
        message: "The selected subsystem does not exist.",
      });
    }

    const mechanism = createMechanism(parsed.data);
    return reply.code(201).send({
      item: mechanism,
    });
  });

  app.patch<{ Body: unknown; Params: { mechanismId: string } }>(
    "/api/mechanisms/:mechanismId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = mechanismPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Mechanism update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentMechanism = findMechanism(request.params.mechanismId);
      if (!currentMechanism) {
        return reply.code(404).send({
          message: "Mechanism not found.",
        });
      }

      const nextSubsystemId = parsed.data.subsystemId ?? currentMechanism.subsystemId;
      if (!findSubsystem(nextSubsystemId)) {
        return reply.code(400).send({
          message: "The selected subsystem does not exist.",
        });
      }

      const mechanism = updateMechanism(request.params.mechanismId, parsed.data);
      return {
        item: mechanism,
      };
    },
  );

  app.delete<{ Params: { mechanismId: string } }>(
    "/api/mechanisms/:mechanismId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const mechanism = removeMechanism(request.params.mechanismId);
      if (!mechanism) {
        return reply.code(404).send({
          message: "Mechanism not found.",
        });
      }

      return {
        item: mechanism,
      };
    },
  );

  app.get("/api/part-definitions", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getPartDefinitions(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/part-definitions", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = partDefinitionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Part definition payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const materialError = validatePartDefinitionMaterialId(parsed.data.materialId ?? null);
    if (materialError) {
      return reply.code(400).send({
        message: materialError,
      });
    }

    const partDefinition = createPartDefinition({
      ...parsed.data,
      materialId: parsed.data.materialId ?? null,
      description: parsed.data.description ?? "",
    });

    return reply.code(201).send({
      item: partDefinition,
    });
  });

  app.patch<{ Body: unknown; Params: { partDefinitionId: string } }>(
    "/api/part-definitions/:partDefinitionId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = partDefinitionPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Part definition update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentPartDefinition = findPartDefinition(request.params.partDefinitionId);
      if (!currentPartDefinition) {
        return reply.code(404).send({
          message: "Part definition not found.",
        });
      }

      const nextMaterialId =
        parsed.data.materialId === undefined
          ? currentPartDefinition.materialId
          : parsed.data.materialId;
      const materialError = validatePartDefinitionMaterialId(nextMaterialId);
      if (materialError) {
        return reply.code(400).send({
          message: materialError,
        });
      }

      const partDefinition = updatePartDefinition(request.params.partDefinitionId, {
        ...parsed.data,
        materialId: nextMaterialId ?? null,
        description: parsed.data.description ?? currentPartDefinition.description,
      });

      return {
        item: partDefinition,
      };
    },
  );

  app.delete<{ Params: { partDefinitionId: string } }>(
    "/api/part-definitions/:partDefinitionId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const partDefinition = removePartDefinition(request.params.partDefinitionId);
      if (!partDefinition) {
        return reply.code(404).send({
          message: "Part definition not found.",
        });
      }

      return {
        item: partDefinition,
      };
    },
  );

  app.get("/api/part-instances", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const paginated = paginateItems(getPartInstances(), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/part-instances", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = partInstanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Part instance payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validatePartInstanceLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const partInstance = createPartInstance({
      ...parsed.data,
      mechanismId: parsed.data.mechanismId ?? null,
    });

    return reply.code(201).send({
      item: partInstance,
    });
  });

  app.patch<{ Body: unknown; Params: { partInstanceId: string } }>(
    "/api/part-instances/:partInstanceId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = partInstancePatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Part instance update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentPartInstance = findPartInstance(request.params.partInstanceId);
      if (!currentPartInstance) {
        return reply.code(404).send({
          message: "Part instance not found.",
        });
      }

      const nextPartInstanceShape = {
        subsystemId: parsed.data.subsystemId ?? currentPartInstance.subsystemId,
        mechanismId:
          parsed.data.mechanismId === undefined
            ? currentPartInstance.mechanismId
            : parsed.data.mechanismId,
        partDefinitionId:
          parsed.data.partDefinitionId === undefined
            ? currentPartInstance.partDefinitionId
            : parsed.data.partDefinitionId,
      };

      const validationError = validatePartInstanceLinks(nextPartInstanceShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const partInstance = updatePartInstance(request.params.partInstanceId, {
        ...parsed.data,
        subsystemId: nextPartInstanceShape.subsystemId,
        mechanismId: nextPartInstanceShape.mechanismId ?? null,
        partDefinitionId: nextPartInstanceShape.partDefinitionId,
      });

      return {
        item: partInstance,
      };
    },
  );

  app.delete<{ Params: { partInstanceId: string } }>(
    "/api/part-instances/:partInstanceId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const partInstance = removePartInstance(request.params.partInstanceId);
      if (!partInstance) {
        return reply.code(404).send({
          message: "Part instance not found.",
        });
      }

      return {
        item: partInstance,
      };
    },
  );

  app.get("/api/meetings", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      meetings: getSnapshot().meetings,
      attendance: getSnapshot().attendanceRecords,
      workLogs: getSnapshot().workLogs,
    };
  });

  app.get("/api/manufacturing", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const snapshot = getSnapshot();
    const personId = readPersonFilter(request);
    const paginated = paginateItems(
      filterManufacturingItemsForPerson(personId),
      request.query,
    );

    return {
      items: withManufacturingQaReviewCounts(paginated.items, snapshot),
      pagination: paginated.pagination,
      qaReviews: snapshot.qaReviews.filter(
        (review) => review.subjectType === "manufacturing",
      ),
    };
  });

  app.post<{ Body: unknown }>("/api/manufacturing", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = manufacturingItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Manufacturing payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validateManufacturingItemLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const partDefinition = parsed.data.partDefinitionId
      ? findPartDefinition(parsed.data.partDefinitionId)
      : null;
    if (parsed.data.partDefinitionId && !partDefinition) {
      return reply.code(400).send({
        message: "Please select a real part from the Parts tab.",
      });
    }

    const partInstanceIds = uniqueIds([
      ...(parsed.data.partInstanceIds ?? []),
      parsed.data.partInstanceId,
    ]);
    const item = createManufacturingItem({
      ...parsed.data,
      partDefinitionId: parsed.data.partDefinitionId ?? null,
      partInstanceId: partInstanceIds[0] ?? null,
      partInstanceIds,
      title:
        parsed.data.process === "fabrication" || !partDefinition
          ? parsed.data.title
          : partDefinition.name,
    });
    return reply.code(201).send({
      item: withManufacturingQaReviewCounts([item])[0],
    });
  });

  app.patch<{ Body: unknown; Params: { itemId: string } }>(
    "/api/manufacturing/:itemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = manufacturingItemPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Manufacturing update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentItem = getManufacturingItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({
          message: "Manufacturing item not found.",
        });
      }

      const nextItemShape = {
        subsystemId: parsed.data.subsystemId ?? currentItem.subsystemId,
        process: parsed.data.process ?? currentItem.process,
        partDefinitionId:
          parsed.data.partDefinitionId === undefined
            ? currentItem.partDefinitionId
            : parsed.data.partDefinitionId,
        partInstanceId:
          parsed.data.partInstanceId === undefined
            ? currentItem.partInstanceId
            : parsed.data.partInstanceId,
        partInstanceIds:
          parsed.data.partInstanceIds === undefined &&
          parsed.data.partInstanceId === undefined
            ? currentItem.partInstanceIds ?? uniqueIds([currentItem.partInstanceId])
            : uniqueIds([
                ...(parsed.data.partInstanceIds ?? []),
                parsed.data.partInstanceId,
              ]),
      };

      const validationError = validateManufacturingItemLinks(nextItemShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const partDefinition = nextItemShape.partDefinitionId
        ? findPartDefinition(nextItemShape.partDefinitionId)
        : null;
      if (nextItemShape.partDefinitionId && !partDefinition) {
        return reply.code(400).send({
          message: "Please select a real part from the Parts tab.",
        });
      }

      const item = updateManufacturingItem(request.params.itemId, {
        ...parsed.data,
        partDefinitionId: nextItemShape.partDefinitionId ?? null,
        partInstanceId: nextItemShape.partInstanceIds[0] ?? null,
        partInstanceIds: nextItemShape.partInstanceIds,
        title:
          nextItemShape.process === "fabrication" || !partDefinition
            ? parsed.data.title ?? currentItem.title
            : partDefinition.name,
      });

      return {
        item: item ? withManufacturingQaReviewCounts([item])[0] : item,
      };
    },
  );

  app.delete<{ Params: { itemId: string } }>(
    "/api/manufacturing/:itemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const item = removeManufacturingItem(request.params.itemId);
      if (!item) {
        return reply.code(404).send({
          message: "Manufacturing item not found.",
        });
      }

      return {
        item,
      };
    },
  );

  app.get("/api/purchases", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const personId = readPersonFilter(request);
    const paginated = paginateItems(filterPurchaseItemsForPerson(personId), request.query);

    return {
      items: paginated.items,
      pagination: paginated.pagination,
    };
  });

  app.post<{ Body: unknown }>("/api/purchases", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const parsed = purchaseItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Purchase payload is invalid.",
        issues: parsed.error.flatten(),
      });
    }

    const validationError = validatePurchaseItemLinks(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const partDefinition = parsed.data.partDefinitionId
      ? findPartDefinition(parsed.data.partDefinitionId)
      : null;
    if (parsed.data.partDefinitionId && !partDefinition) {
      return reply.code(400).send({
        message: "Please select a real part from the Parts tab.",
      });
    }

    const item = createPurchaseItem({
      ...parsed.data,
      partDefinitionId: parsed.data.partDefinitionId ?? null,
      title: partDefinition?.name ?? parsed.data.title,
    });
    return reply.code(201).send({
      item,
    });
  });

  app.patch<{ Body: unknown; Params: { itemId: string } }>(
    "/api/purchases/:itemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const parsed = purchaseItemPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Purchase update payload is invalid.",
          issues: parsed.error.flatten(),
        });
      }

      const currentItem = getPurchaseItems().find((item) => item.id === request.params.itemId);
      if (!currentItem) {
        return reply.code(404).send({
          message: "Purchase item not found.",
        });
      }

      const nextItemShape = {
        subsystemId: parsed.data.subsystemId ?? currentItem.subsystemId,
        partDefinitionId:
          parsed.data.partDefinitionId === undefined
            ? currentItem.partDefinitionId
            : parsed.data.partDefinitionId,
      };

      const validationError = validatePurchaseItemLinks(nextItemShape);
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const partDefinition = nextItemShape.partDefinitionId
        ? findPartDefinition(nextItemShape.partDefinitionId)
        : null;
      if (nextItemShape.partDefinitionId && !partDefinition) {
        return reply.code(400).send({
          message: "Please select a real part from the Parts tab.",
        });
      }

      const item = updatePurchaseItem(request.params.itemId, {
        ...parsed.data,
        partDefinitionId: nextItemShape.partDefinitionId ?? null,
        title: partDefinition?.name ?? parsed.data.title ?? currentItem.title,
      });

      return {
        item,
      };
    },
  );

  app.delete<{ Params: { itemId: string } }>(
    "/api/purchases/:itemId",
    async (request, reply) => {
      if (!requireApiSessionIfEnabled(request, reply)) {
        return;
      }

      const item = removePurchaseItem(request.params.itemId);
      if (!item) {
        return reply.code(404).send({
          message: "Purchase item not found.",
        });
      }

      return {
        item,
      };
    },
  );

  app.get("/api/qa", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      reviews: getSnapshot().qaReviews,
      mentorBackedPasses: getSnapshot().qaReviews.filter((review) => {
        return review.result === "pass" && review.mentorApproved;
      }).length,
    };
  });

  app.get("/api/metrics", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return buildMetrics(getSnapshot());
  });
}
