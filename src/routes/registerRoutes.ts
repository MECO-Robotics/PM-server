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
  createSeason,
  createSubsystem,
  createPurchaseItem,
  createTask,
  createWorkLog,
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
  removeMaterial,
  removeArtifact,
  removeMember,
  removeMechanism,
  removePartDefinition,
  removePartInstance,
  updateManufacturingItem,
  updateArtifact,
  updateMaterial,
  updateMember,
  updateMechanism,
  updateEvent,
  updatePartDefinition,
  updatePartInstance,
  updateSubsystem,
  updatePurchaseItem,
  updateTask,
} from "../data/store";
import {
  buildDashboard,
  buildMetrics,
  evaluateTaskCompletion,
  formatTaskStatus,
} from "../domain/workflows";

const memberSchema = z.object({
  name: z.string().trim().min(2),
  role: z.enum(["student", "lead", "mentor", "admin"]),
  seasonId: z.string().trim().min(1),
});

const seasonSchema = z.object({
  name: z.string().trim().min(2),
  type: z.enum(["season", "offseason", "initiative"]).default("season"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

const taskSchema = z.object({
  projectId: z.string().trim().min(1),
  workstreamId: z.string().trim().min(1).nullable(),
  title: z.string().trim().min(3),
  summary: z.string().trim().min(3),
  subsystemId: z.string().min(1),
  disciplineId: z.string().min(1),
  mechanismId: z.string().trim().min(1).nullable(),
  partInstanceId: z.string().trim().min(1).nullable(),
  targetEventId: z.string().trim().min(1).nullable(),
  ownerId: z.string().trim().min(1).nullable(),
  mentorId: z.string().trim().min(1).nullable(),
  startDate: z.string().date(),
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
  relatedSubsystemIds: z.array(z.string().trim().min(1)).optional(),
});
const memberPatchSchema = memberSchema.partial();
const subsystemSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(2),
  description: z.string().trim().min(3),
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
});
const mechanismPatchSchema = mechanismSchema.partial();
const partDefinitionSchema = z.object({
  name: z.string().trim().min(2),
  partNumber: z.string().trim().min(1),
  revision: z.string().trim().min(1),
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
  partDefinitionId: z.string().trim().min(1),
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
  quantity: z.coerce.number().min(1),
  status: z.enum(["requested", "approved", "in-progress", "qa", "complete"]),
  mentorReviewed: z.boolean().default(false),
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
const emailCodeLength = runtimeAuthConfig.emailCodeLength;
const emailSignInRequestSchema = z.object({
  email: z.string().trim().email(),
});
const emailSignInVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().length(emailCodeLength),
});

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
    return task.ownerId === personId || task.mentorId === personId;
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

function validateTaskLinks(input: {
  projectId: string;
  workstreamId?: string | null;
  subsystemId: string;
  disciplineId?: string;
  mechanismId?: string | null;
  partInstanceId?: string | null;
  targetEventId?: string | null;
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

  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }
  const subsystem = findSubsystem(input.subsystemId);
  if (subsystem && subsystem.projectId !== project.id) {
    return "The selected subsystem does not belong to the selected project.";
  }

  if (input.disciplineId && !findDiscipline(input.disciplineId)) {
    return "The selected discipline does not exist.";
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

  if (input.partInstanceId) {
    const partInstance = findPartInstance(input.partInstanceId);
    if (!partInstance) {
      return "The selected part instance does not exist.";
    }

    if (partInstance.subsystemId !== input.subsystemId) {
      return "The selected part instance does not belong to the selected subsystem.";
    }

    if (!input.mechanismId) {
      return "The selected part instance must be linked to a mechanism.";
    }

    if (partInstance.mechanismId && partInstance.mechanismId !== input.mechanismId) {
      return "The selected part instance does not belong to the selected mechanism.";
    }
  }

  if (input.targetEventId) {
    const event = getEvents().find((candidate) => candidate.id === input.targetEventId);
    if (!event) {
      return "The selected event does not exist.";
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

  return validatePartDefinitionLink(input.partDefinitionId);
}

function validateManufacturingItemLinks(input: {
  subsystemId: string;
  process: string;
  partDefinitionId?: string | null | undefined;
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (input.process === "fabrication") {
    if (input.partDefinitionId) {
      return validatePartDefinitionLink(input.partDefinitionId);
    }

    return null;
  }

  return validatePartDefinitionLink(input.partDefinitionId);
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
      tasks: filterTasksForPerson(personId),
      workLogs: filterWorkLogsForPerson(personId),
      purchaseItems: filterPurchaseItemsForPerson(personId),
      manufacturingItems: filterManufacturingItemsForPerson(personId),
    };
  });

  app.get("/api/seasons", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getSeasons(),
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

    return {
      items: getProjects(),
    };
  });

  app.get("/api/workstreams", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getWorkstreams(),
    };
  });

  app.get("/api/qa-reports", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getQaReports(),
    };
  });

  app.get("/api/test-results", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getTestResults(),
    };
  });

  app.get("/api/risks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getRisks(),
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

    const taskExists = getTasks().some((task) => task.id === parsed.data.taskId);
    if (!taskExists) {
      return reply.code(400).send({
        message: "The selected task does not exist.",
      });
    }

    const memberIds = new Set(getMembers().map((member) => member.id));
    const missingParticipant = parsed.data.participantIds.find(
      (participantId) => !memberIds.has(participantId),
    );
    if (missingParticipant) {
      return reply.code(400).send({
        message: "One or more selected participants do not exist.",
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

  app.get("/api/tasks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const snapshot = getSnapshot();
    const personId = readPersonFilter(request);

    return {
      items: filterTasksForPerson(personId).map((task) => ({
        id: task.id,
        projectId: task.projectId,
        workstreamId: task.workstreamId,
        title: task.title,
        summary: task.summary,
        subsystemId: task.subsystemId,
        disciplineId: task.disciplineId,
        mechanismId: task.mechanismId,
        partInstanceId: task.partInstanceId,
        targetEventId: task.targetEventId,
        ownerId: task.ownerId,
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
      })),
    };
  });

  app.get("/api/events", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getEvents(),
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

    const validationError = validateEventSubsystemLinks(parsed.data.relatedSubsystemIds);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const event = createEvent({
      ...parsed.data,
      endDateTime: parsed.data.endDateTime ?? null,
      description: parsed.data.description ?? "",
      relatedSubsystemIds: Array.from(new Set(parsed.data.relatedSubsystemIds)),
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

      const validationError = validateEventSubsystemLinks(nextRelatedSubsystemIds);
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
        relatedSubsystemIds: nextRelatedSubsystemIds,
      });

      return {
        item: event,
      };
    },
  );

  app.get("/api/materials", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getMaterials(),
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

    return {
      items: getArtifacts(),
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

    const taskValidationError = validateTaskLinks(parsed.data);
    if (taskValidationError) {
      return reply.code(400).send({
        message: taskValidationError,
      });
    }

    const createdTask = createTask(parsed.data);
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

      const nextTaskShape = {
        projectId: parsed.data.projectId ?? currentTask.projectId,
        workstreamId:
          parsed.data.workstreamId === undefined
            ? currentTask.workstreamId
            : parsed.data.workstreamId,
        subsystemId: parsed.data.subsystemId ?? currentTask.subsystemId,
        disciplineId: parsed.data.disciplineId ?? currentTask.disciplineId,
        mechanismId:
          parsed.data.mechanismId === undefined
            ? currentTask.mechanismId
            : parsed.data.mechanismId,
        partInstanceId:
          parsed.data.partInstanceId === undefined
            ? currentTask.partInstanceId
            : parsed.data.partInstanceId,
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

      const updatedTask = updateTask(request.params.taskId, parsed.data);
      return {
        item: updatedTask,
      };
    },
  );

  app.get("/api/members", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getMembers(),
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
    if (!getSeasons().some((season) => season.id === parsed.data.seasonId)) {
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

    if (!findProject(parsed.data.projectId)) {
      return reply.code(400).send({
        message: "The selected project does not exist.",
      });
    }

    const validationError = validateSubsystemPeople(parsed.data);
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
      if (parentSubsystem.projectId !== parsed.data.projectId) {
        return reply.code(400).send({
          message: "The selected parent subsystem does not belong to the selected project.",
        });
      }
    }

    const subsystem = createSubsystem({
      ...parsed.data,
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

    return {
      items: getPartDefinitions(),
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

    return {
      items: getPartInstances(),
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

    const personId = readPersonFilter(request);

    return {
      items: filterManufacturingItemsForPerson(personId),
      qaReviews: getSnapshot().qaReviews.filter(
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
    if (!partDefinition && parsed.data.process !== "fabrication") {
      return reply.code(400).send({
        message: "Please select a real part from the Parts tab.",
      });
    }

    const item = createManufacturingItem({
      ...parsed.data,
      partDefinitionId: parsed.data.partDefinitionId ?? null,
      title:
        parsed.data.process === "fabrication"
          ? parsed.data.title
          : partDefinition?.name ?? parsed.data.title,
    });
    return reply.code(201).send({
      item,
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
      if (!partDefinition && nextItemShape.process !== "fabrication") {
        return reply.code(400).send({
          message: "Please select a real part from the Parts tab.",
        });
      }

      const item = updateManufacturingItem(request.params.itemId, {
        ...parsed.data,
        title:
          nextItemShape.process === "fabrication"
            ? parsed.data.title ?? currentItem.title
            : partDefinition?.name ?? parsed.data.title ?? currentItem.title,
      });

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

    return {
      items: filterPurchaseItemsForPerson(personId),
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

    const partDefinition = findPartDefinition(parsed.data.partDefinitionId);
    if (!partDefinition) {
      return reply.code(400).send({
        message: "Please select a real part from the Parts tab.",
      });
    }

    const item = createPurchaseItem({
      ...parsed.data,
      title: partDefinition.name,
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

      if (!nextItemShape.partDefinitionId) {
        return reply.code(400).send({
          message: "Please select a real part from the Parts tab.",
        });
      }

      const partDefinition = findPartDefinition(nextItemShape.partDefinitionId);
      if (!partDefinition) {
        return reply.code(400).send({
          message: "Please select a real part from the Parts tab.",
        });
      }

      const item = updatePurchaseItem(request.params.itemId, {
        ...parsed.data,
        title: partDefinition.name,
      });

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
