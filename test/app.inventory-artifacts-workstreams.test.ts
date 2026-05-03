import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("artifact and workstream endpoints preserve seeded, paginated, and CRUD contracts", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      artifacts: Array<{
        id: string;
        kind: string;
        projectId: string;
      }>;
      attendanceRecords: Array<{
        id: string;
      }>;
      escalations: Array<{
        title: string;
      }>;
      projects: Array<{
        id: string;
        seasonId: string;
      }>;
      reportFindings: Array<{
        id: string;
        reportId: string;
      }>;
      reports: Array<{
        id: string;
        projectId: string;
        reportType: string;
      }>;
      manufacturingItems: Array<{
        batchLabel?: string;
        id: string;
        partDefinitionId: string | null;
        process: string;
        qaReviewCount: number;
      }>;
      meetings: Array<{
        id: string;
      }>;
      taskBlockers: Array<{
        blockedTaskId: string;
        id: string;
      }>;
      taskDependencies: Array<{
        taskId: string;
        kind: string;
        refId: string;
        id: string;
      }>;
      qaReviews: Array<{
        id: string;
      }>;
      workLogs: Array<{
        id: string;
      }>;
    };

    const seededFabricationItem = bootstrapBody.manufacturingItems.find(
      (item) => item.id === "frame-weldment",
    );
    assert.ok(seededFabricationItem);
    assert.equal(seededFabricationItem?.process, "fabrication");
    assert.equal(seededFabricationItem?.partDefinitionId, null);
    assert.equal(seededFabricationItem?.batchLabel, "FAB-03");

    const seededManufacturingQaItem = bootstrapBody.manufacturingItems.find(
      (item) => item.id === "sensor-bracket",
    );
    assert.equal(seededManufacturingQaItem?.qaReviewCount, 1);
    assert.ok(bootstrapBody.meetings.some((meeting) => meeting.id === "design-review"));
    assert.ok(bootstrapBody.attendanceRecords.some((record) => record.id === "att-1"));
    assert.ok(bootstrapBody.qaReviews.some((review) => review.id === "qa-1"));
    assert.ok(bootstrapBody.escalations.length > 0);
    assert.ok(
      bootstrapBody.reports.some((report) => report.id === "qareport-intake-guard"),
    );
    assert.ok(
      bootstrapBody.reportFindings.some(
        (finding) => finding.id === "qafinding-intake-guard-cut-quality",
      ),
    );
    assert.ok(
      bootstrapBody.taskDependencies.some(
        (dependency) =>
          dependency.taskId === "vision-calibration-sweep" &&
          dependency.kind === "task" &&
          dependency.refId === "swerve-sensor-bundle",
      ),
    );
    assert.ok(
      bootstrapBody.taskBlockers.some(
        (blocker) => blocker.blockedTaskId === "intake-guard" && blocker.id.length > 0,
      ),
    );

    const seededOperationsArtifact = bootstrapBody.artifacts.find(
      (artifact) => artifact.id === "artifact-sponsor-recap-apr",
    );
    assert.ok(seededOperationsArtifact);
    assert.equal(seededOperationsArtifact?.projectId, "project-operations-2026");
    assert.equal(seededOperationsArtifact?.kind, "nontechnical");
    assert.ok(bootstrapBody.workLogs.some((workLog) => workLog.id === "log-1"));

    const robotProject = bootstrapBody.projects.find(
      (project) => project.id === "project-robot-2026",
    );
    assert.ok(robotProject);

    resetLimits();

    const scopedBootstrapResponse = await app.inject({
      method: "GET",
      url: `/api/bootstrap?seasonId=${encodeURIComponent(robotProject!.seasonId)}&projectId=${encodeURIComponent(robotProject!.id)}`,
    });

    assert.equal(scopedBootstrapResponse.statusCode, 200);
    const scopedBootstrapBody = scopedBootstrapResponse.json() as {
      projects: Array<{
        id: string;
        seasonId: string;
      }>;
      reports: Array<{
        id: string;
        projectId: string;
      }>;
      reportFindings: Array<{
        id: string;
        reportId: string;
      }>;
      taskBlockers: Array<{
        blockedTaskId: string;
        id: string;
      }>;
      taskDependencies: Array<{
        taskId: string;
        kind: string;
        refId: string;
        id: string;
      }>;
      tasks: Array<{
        id: string;
        projectId: string;
      }>;
      workstreams: Array<{
        id: string;
        projectId: string;
      }>;
    };

    assert.ok(
      scopedBootstrapBody.projects.every(
        (project) => project.seasonId === robotProject!.seasonId,
      ),
    );
    assert.ok(
      scopedBootstrapBody.tasks.every((task) => task.projectId === robotProject!.id),
    );
    assert.ok(
      scopedBootstrapBody.workstreams.every(
        (workstream) => workstream.projectId === robotProject!.id,
      ),
    );
    assert.ok(
      scopedBootstrapBody.reports.every((report) => report.projectId === robotProject!.id),
    );
    assert.ok(
      scopedBootstrapBody.reportFindings.every((finding) =>
        scopedBootstrapBody.reports.some((report) => report.id === finding.reportId),
      ),
    );
    assert.ok(
      scopedBootstrapBody.taskBlockers.every((blocker) =>
        scopedBootstrapBody.tasks.some((task) => task.id === blocker.blockedTaskId),
      ),
    );
    assert.ok(
      scopedBootstrapBody.taskDependencies.every((dependency) =>
        scopedBootstrapBody.tasks.some((task) => task.id === dependency.taskId) &&
        scopedBootstrapBody.tasks.some((task) => task.id === dependency.refId),
      ),
    );

    resetLimits();

    const artifactsResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts",
    });

    assert.equal(artifactsResponse.statusCode, 200);
    const artifactsBody = artifactsResponse.json() as {
      items: Array<{
        id: string;
        kind: string;
        projectId: string;
      }>;
    };
    assert.ok(
      artifactsBody.items.some(
        (artifact) =>
          artifact.id === "artifact-milestone-volunteer-guide" &&
          artifact.projectId === "project-operations-2026" &&
          artifact.kind === "document",
      ),
    );

    resetLimits();

    const createWorkstreamResponse = await app.inject({
      method: "POST",
      url: "/api/workstreams",
      payload: {
        projectId: "project-operations-2026",
        name: "Awards",
        description: "Awards submission workflow.",
        color: "#E76F51",
      },
    });

    assert.equal(createWorkstreamResponse.statusCode, 201);
    const createWorkstreamBody = createWorkstreamResponse.json() as {
      item: {
        color?: string;
        id: string;
        isArchived: boolean;
        projectId: string;
      };
    };
    assert.equal(createWorkstreamBody.item.id, "awards");
    assert.equal(createWorkstreamBody.item.color, "#E76F51");
    assert.equal(createWorkstreamBody.item.isArchived, false);
    assert.equal(createWorkstreamBody.item.projectId, "project-operations-2026");

    resetLimits();

    const updateWorkstreamResponse = await app.inject({
      method: "PATCH",
      url: `/api/workstreams/${createWorkstreamBody.item.id}`,
      payload: {
        color: "#2A9D8F",
        isArchived: true,
      },
    });

    assert.equal(updateWorkstreamResponse.statusCode, 200);
    assert.equal(updateWorkstreamResponse.json().item.color, "#2A9D8F");
    assert.equal(updateWorkstreamResponse.json().item.isArchived, true);

    resetLimits();

    const workstreamsResponse = await app.inject({
      method: "GET",
      url: "/api/workstreams?pageSize=60",
    });

    assert.equal(workstreamsResponse.statusCode, 200);
    const workstreamsBody = workstreamsResponse.json() as {
      items: Array<{
        id: string;
      }>;
    };
    assert.ok(
      workstreamsBody.items.some(
        (workstream) => workstream.id === createWorkstreamBody.item.id,
      ),
    );

    resetLimits();

    const paginatedArtifactsResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts?page=2&pageSize=30",
    });

    assert.equal(paginatedArtifactsResponse.statusCode, 200);
    const paginatedArtifactsBody = paginatedArtifactsResponse.json() as {
      items: Array<{ id: string }>;
      pagination: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    };
    assert.equal(paginatedArtifactsBody.pagination.pageSize, 30);
    assert.equal(paginatedArtifactsBody.pagination.page, 1);
    assert.equal(paginatedArtifactsBody.pagination.totalPages >= 1, true);
    assert.equal(
      paginatedArtifactsBody.pagination.totalItems >= paginatedArtifactsBody.items.length,
      true,
    );
    assert.equal(paginatedArtifactsBody.pagination.hasPreviousPage, false);

    resetLimits();

    const invalidPageSizeArtifactsResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts?pageSize=99",
    });

    assert.equal(invalidPageSizeArtifactsResponse.statusCode, 200);
    const invalidPageSizeArtifactsBody = invalidPageSizeArtifactsResponse.json() as {
      pagination: {
        pageSize: number;
      };
    };
    assert.equal(invalidPageSizeArtifactsBody.pagination.pageSize, 15);

    resetLimits();

    const createArtifactResponse = await app.inject({
      method: "POST",
      url: "/api/artifacts",
      payload: {
        projectId: "project-operations-2026",
        workstreamId: "workstream-operations-comms",
        kind: "nontechnical",
        title: "Parent Night Summary",
        summary: "Highlights from mentor and parent orientation night.",
        status: "draft",
        link: "https://example.org/meco/parent-night-summary",
      },
    });

    assert.equal(createArtifactResponse.statusCode, 201);
    const createdArtifactBody = createArtifactResponse.json() as {
      item: {
        id: string;
        isArchived: boolean;
        kind: string;
        projectId: string;
        status: string;
        title: string;
        updatedAt: string;
        workstreamId: string | null;
      };
    };
    assert.equal(createdArtifactBody.item.projectId, "project-operations-2026");
    assert.equal(createdArtifactBody.item.workstreamId, "workstream-operations-comms");
    assert.equal(createdArtifactBody.item.kind, "nontechnical");
    assert.equal(createdArtifactBody.item.status, "draft");
    assert.equal(createdArtifactBody.item.isArchived, false);
    assert.equal(Number.isNaN(Date.parse(createdArtifactBody.item.updatedAt)), false);

    resetLimits();

    const updateArtifactResponse = await app.inject({
      method: "PATCH",
      url: `/api/artifacts/${createdArtifactBody.item.id}`,
      payload: {
        kind: "document",
        isArchived: true,
        status: "published",
        title: "Parent Night Summary Final",
      },
    });

    assert.equal(updateArtifactResponse.statusCode, 200);
    const updatedArtifactBody = updateArtifactResponse.json() as {
      item: {
        isArchived: boolean;
        kind: string;
        status: string;
        title: string;
      };
    };
    assert.equal(updatedArtifactBody.item.kind, "document");
    assert.equal(updatedArtifactBody.item.isArchived, true);
    assert.equal(updatedArtifactBody.item.status, "published");
    assert.equal(updatedArtifactBody.item.title, "Parent Night Summary Final");

    resetLimits();

    const deleteArtifactResponse = await app.inject({
      method: "DELETE",
      url: `/api/artifacts/${createdArtifactBody.item.id}`,
    });

    assert.equal(deleteArtifactResponse.statusCode, 200);

    resetLimits();

    const artifactsAfterDeleteResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts",
    });

    assert.equal(artifactsAfterDeleteResponse.statusCode, 200);
    const artifactsAfterDeleteBody = artifactsAfterDeleteResponse.json() as {
      items: Array<{ id: string }>;
    };
    assert.equal(
      artifactsAfterDeleteBody.items.some(
        (artifact) => artifact.id === createdArtifactBody.item.id,
      ),
      false,
    );
  });
});

test("media upload endpoint returns a presigned image upload contract", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const presignResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "Robot Reveal Photo.png",
        contentType: "image/png",
      },
    });

    assert.equal(presignResponse.statusCode, 200);
    const presignBody = presignResponse.json() as {
      expiresInSeconds: number;
      headers: {
        "Content-Type": string;
      };
      key: string;
      method: string;
      publicUrl: string;
      uploadUrl: string;
    };

    assert.equal(presignBody.method, "PUT");
    assert.equal(presignBody.expiresInSeconds, 300);
    assert.equal(presignBody.headers["Content-Type"], "image/png");
    assert.match(
      presignBody.key,
      /^projects\/project-media-2026\/images\/\d{4}\/\d{2}\/\d+-[a-f0-9]{12}-robot-reveal-photo\.png$/,
    );
    assert.ok(
      presignBody.publicUrl.startsWith("https://cdn.example.test/meco-pm/projects/project-media-2026/images/"),
    );

    const uploadUrl = new URL(presignBody.uploadUrl);
    assert.equal(uploadUrl.origin, "https://s3.example.test");
    assert.ok(uploadUrl.pathname.startsWith("/meco-pm/projects/project-media-2026/images/"));
    assert.equal(uploadUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");

    resetLimits();

    const invalidTypeResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "not-an-image.pdf",
        contentType: "application/pdf",
      },
    });

    assert.equal(invalidTypeResponse.statusCode, 400);
    assert.equal(
      invalidTypeResponse.json().message,
      "Only image uploads are supported by the media bucket.",
    );
  });
});

test("video upload endpoint returns a presigned video upload contract", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const presignResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-video-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "QA review clip.mp4",
        contentType: "video/mp4",
      },
    });

    assert.equal(presignResponse.statusCode, 200);
    const presignBody = presignResponse.json() as {
      expiresInSeconds: number;
      headers: {
        "Content-Type": string;
      };
      key: string;
      method: string;
      publicUrl: string;
      uploadUrl: string;
    };

    assert.equal(presignBody.method, "PUT");
    assert.equal(presignBody.headers["Content-Type"], "video/mp4");
    assert.match(
      presignBody.key,
      /^projects\/project-media-2026\/videos\/\d{4}\/\d{2}\/\d+-[a-f0-9]{12}-qa-review-clip\.mp4$/,
    );
    assert.ok(
      presignBody.publicUrl.startsWith("https://cdn.example.test/meco-pm/projects/project-media-2026/videos/"),
    );

    resetLimits();

    const invalidTypeResponse = await app.inject({
      method: "POST",
      url: "/api/media/presign-video-upload",
      payload: {
        projectId: "project-media-2026",
        fileName: "not-a-video.png",
        contentType: "image/png",
      },
    });

    assert.equal(invalidTypeResponse.statusCode, 400);
    assert.equal(
      invalidTypeResponse.json().message,
      "Only video uploads are supported by the media bucket.",
    );
  });
});
