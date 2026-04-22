import { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  AuthError,
  getPublicAuthConfig,
  isAuthEnabled,
  requireSession,
  signSessionToken,
  verifyGoogleCredential,
} from "../auth/authService";
import {
  createMember,
  createTask,
  findSubsystem,
  getMembers,
  getSnapshot,
  getSubsystems,
  getTasks,
  updateMember,
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
  role: z.enum(["student", "mentor", "admin"]),
});

const taskSchema = z.object({
  title: z.string().trim().min(3),
  summary: z.string().trim().min(3),
  subsystemId: z.string().min(1),
  ownerId: z.string().min(1),
  mentorId: z.string().min(1),
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

export async function registerRoutes(app: FastifyInstance) {
  const requireApiSessionIfEnabled = (
    request: Parameters<typeof requireSession>[0],
    reply: Parameters<typeof requireSession>[1],
  ) => {
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

  app.get("/api/auth/config", async () => {
    return getPublicAuthConfig();
  });

  app.post<{
    Body: {
      credential?: string;
    };
  }>("/api/auth/google", async (request, reply) => {
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

  app.get("/api/auth/me", async (request, reply) => {
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

    return {
      members: snapshot.members,
      subsystems: snapshot.subsystems,
      tasks: snapshot.tasks,
    };
  });

  app.get("/api/tasks", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    const snapshot = getSnapshot();

    return {
      items: snapshot.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        summary: task.summary,
        subsystemId: task.subsystemId,
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

    if (!findSubsystem(parsed.data.subsystemId)) {
      return reply.code(400).send({
        message: "The selected subsystem does not exist.",
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

      if (
        parsed.data.subsystemId &&
        !findSubsystem(parsed.data.subsystemId)
      ) {
        return reply.code(400).send({
          message: "The selected subsystem does not exist.",
        });
      }

      const updatedTask = updateTask(request.params.taskId, parsed.data);
      if (!updatedTask) {
        return reply.code(404).send({
          message: "Task not found.",
        });
      }

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

    return {
      items: getSnapshot().manufacturingItems,
      qaReviews: getSnapshot().qaReviews.filter(
        (review) => review.subjectType === "manufacturing",
      ),
    };
  });

  app.get("/api/purchases", async (request, reply) => {
    if (!requireApiSessionIfEnabled(request, reply)) {
      return;
    }

    return {
      items: getSnapshot().purchaseItems,
    };
  });

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
