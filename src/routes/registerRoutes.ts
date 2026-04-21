import { FastifyInstance } from "fastify";

import { snapshot } from "../data/mockData";
import {
  buildDashboard,
  buildMetrics,
  evaluateTaskCompletion,
  formatTaskStatus,
} from "../domain/workflows";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "meco-platform",
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/api/dashboard", async () => {
    return buildDashboard(snapshot);
  });

  app.get("/api/tasks", async () => {
    return {
      items: snapshot.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: formatTaskStatus(task.status),
        priority: task.priority,
        gate: evaluateTaskCompletion(task, snapshot),
        blockers: task.blockers,
        linkedManufacturingIds: task.linkedManufacturingIds,
        linkedPurchaseIds: task.linkedPurchaseIds,
      })),
    };
  });

  app.get("/api/meetings", async () => {
    return {
      meetings: snapshot.meetings,
      attendance: snapshot.attendanceRecords,
      workLogs: snapshot.workLogs,
    };
  });

  app.get("/api/manufacturing", async () => {
    return {
      items: snapshot.manufacturingItems,
      qaReviews: snapshot.qaReviews.filter(
        (review) => review.subjectType === "manufacturing",
      ),
    };
  });

  app.get("/api/purchases", async () => {
    return {
      items: snapshot.purchaseItems,
    };
  });

  app.get("/api/qa", async () => {
    return {
      reviews: snapshot.qaReviews,
      mentorBackedPasses: snapshot.qaReviews.filter((review) => {
        return review.result === "pass" && review.mentorApproved;
      }).length,
    };
  });

  app.get("/api/metrics", async () => {
    return buildMetrics(snapshot);
  });
}
