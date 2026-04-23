import { FastifyInstance } from "fastify";
import { z } from "zod";

import { authConfig as runtimeAuthConfig, requestLimitConfig } from "../config/env";
import { createRequestLimitGuard } from "../security/requestLimits";
import {
  AuthError,
  getPublicAuthConfig,
  isAuthEnabled,
  requireSession,
  requestEmailSignInCode,
  signSessionToken,
  verifyEmailSignInCode,
  verifyGoogleCredential,
} from "../auth/authService";
import {
  createManufacturingItem,
  createMaterial,
  createMember,
  createMechanism,
  createPartDefinition,
  createPartInstance,
  createSubsystem,
  createPurchaseItem,
  createTask,
  findDiscipline,
  findMaterial,
  getEvents,
  findMechanism,
  findPartDefinition,
  findPartInstance,
  findRequirement,
  findSubsystem,
  getDisciplines,
  getMembers,
  getMechanisms,
  getManufacturingItems,
  getMaterials,
  getPartDefinitions,
  getPartInstances,
  getPurchaseItems,
  getRequirements,
  getSnapshot,
  getSubsystems,
  getTasks,
  removeMaterial,
  removeMember,
  removeMechanism,
  removePartDefinition,
  removePartInstance,
  updateManufacturingItem,
  updateMaterial,
  updateMember,
  updateMechanism,
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
});

const taskSchema = z.object({
  title: z.string().trim().min(3),
  summary: z.string().trim().min(3),
  subsystemId: z.string().min(1),
  disciplineId: z.string().min(1),
  requirementId: z.string().trim().min(1).nullable(),
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
const memberPatchSchema = memberSchema.partial();
const subsystemSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().min(3),
  isCore: z.boolean().default(false),
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

function validateTaskLinks(input: {
  subsystemId: string;
  disciplineId?: string;
  requirementId?: string | null;
  mechanismId?: string | null;
  partInstanceId?: string | null;
  targetEventId?: string | null;
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (input.disciplineId && !findDiscipline(input.disciplineId)) {
    return "The selected discipline does not exist.";
  }

  if (input.requirementId) {
    const requirement = findRequirement(input.requirementId);
    if (!requirement) {
      return "The selected requirement does not exist.";
    }

    if (requirement.subsystemId !== input.subsystemId) {
      return "The selected requirement does not belong to the selected subsystem.";
    }
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
  responsibleEngineerId?: string | null;
  mentorIds?: string[];
}) {
  const members = getMembers();

  if (
    input.responsibleEngineerId &&
    !members.some((member) => member.id === input.responsibleEngineerId)
  ) {
    return "The selected responsible engineer does not exist.";
  }

  if (input.mentorIds) {
    const invalidMentor = input.mentorIds.find(
      (mentorId) => !members.some((member) => member.id === mentorId),
    );

    if (invalidMentor) {
      return "One of the selected mentors does not exist.";
    }
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
      members: snapshot.members,
      subsystems: snapshot.subsystems,
      disciplines: snapshot.disciplines,
      mechanisms: snapshot.mechanisms,
      requirements: snapshot.requirements,
      materials: snapshot.materials,
      partDefinitions: snapshot.partDefinitions,
      partInstances: snapshot.partInstances,
      events: snapshot.events,
      tasks: filterTasksForPerson(personId),
      purchaseItems: filterPurchaseItemsForPerson(personId),
      manufacturingItems: filterManufacturingItemsForPerson(personId),
    };
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
        title: task.title,
        summary: task.summary,
        subsystemId: task.subsystemId,
        disciplineId: task.disciplineId,
        requirementId: task.requirementId,
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
        subsystemId: parsed.data.subsystemId ?? currentTask.subsystemId,
        disciplineId: parsed.data.disciplineId ?? currentTask.disciplineId,
        requirementId:
          parsed.data.requirementId === undefined
            ? currentTask.requirementId
            : parsed.data.requirementId,
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

    const validationError = validateSubsystemPeople(parsed.data);
    if (validationError) {
      return reply.code(400).send({
        message: validationError,
      });
    }

    const subsystem = createSubsystem({
      ...parsed.data,
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

      const validationError = validateSubsystemPeople({
        responsibleEngineerId: parsed.data.responsibleEngineerId,
        mentorIds: parsed.data.mentorIds,
      });
      if (validationError) {
        return reply.code(400).send({
          message: validationError,
        });
      }

      const subsystem = updateSubsystem(request.params.subsystemId, {
        ...parsed.data,
        mentorIds: parsed.data.mentorIds ?? currentSubsystem.mentorIds,
        risks: parsed.data.risks ?? currentSubsystem.risks,
        responsibleEngineerId:
          parsed.data.responsibleEngineerId === undefined
            ? currentSubsystem.responsibleEngineerId
            : parsed.data.responsibleEngineerId,
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
