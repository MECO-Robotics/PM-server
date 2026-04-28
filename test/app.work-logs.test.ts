import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

test("work log endpoints filter by participant and support create update delete flows", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const filteredBootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?personId=priya",
    });

    assert.equal(filteredBootstrapResponse.statusCode, 200);
    const filteredBootstrapBody = filteredBootstrapResponse.json() as {
      workLogs: Array<{
        id: string;
        participantIds: string[];
      }>;
    };
    assert.deepEqual(
      filteredBootstrapBody.workLogs.map((workLog) => workLog.id),
      ["log-3", "log-4"],
    );

    resetLimits();

    const workLogCreateResponse = await app.inject({
      method: "POST",
      url: "/api/work-logs",
      payload: {
        taskId: "swerve-sensor-bundle",
        date: "2026-04-23",
        hours: 1.5,
        participantIds: ["priya", "lucas"],
        notes: "Route test work log",
        photoUrl: "https://cdn.example.test/worklogs/route-test-log.png",
      },
    });

    assert.equal(workLogCreateResponse.statusCode, 201);
    const workLogCreatedBody = workLogCreateResponse.json() as {
      item: {
        date: string;
        hours: number;
        id: string;
        notes: string;
        participantIds: string[];
        taskId: string;
        photoUrl: string;
      };
    };
    assert.equal(workLogCreatedBody.item.taskId, "swerve-sensor-bundle");
    assert.equal(workLogCreatedBody.item.date, "2026-04-23");
    assert.equal(workLogCreatedBody.item.hours, 1.5);
    assert.deepEqual(workLogCreatedBody.item.participantIds, ["priya", "lucas"]);
    assert.equal(workLogCreatedBody.item.notes, "Route test work log");
    assert.equal(
      workLogCreatedBody.item.photoUrl,
      "https://cdn.example.test/worklogs/route-test-log.png",
    );

    resetLimits();

    const filteredBootstrapAfterWorkLogResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap?personId=priya",
    });

    assert.equal(filteredBootstrapAfterWorkLogResponse.statusCode, 200);
    const filteredBootstrapAfterWorkLogBody =
      filteredBootstrapAfterWorkLogResponse.json() as {
        workLogs: Array<{
          notes: string;
          participantIds: string[];
        }>;
      };
    const createdWorkLog = filteredBootstrapAfterWorkLogBody.workLogs.find(
      (workLog) => workLog.notes === "Route test work log",
    );
    assert.ok(createdWorkLog);
    assert.deepEqual(createdWorkLog?.participantIds, ["priya", "lucas"]);

    resetLimits();

    const workLogUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/work-logs/${workLogCreatedBody.item.id}`,
      payload: {
        hours: 2,
        participantIds: ["lucas"],
        notes: "Route test work log updated from mobile",
        photoUrl: "https://cdn.example.test/worklogs/route-test-log-v2.png",
      },
    });

    assert.equal(workLogUpdateResponse.statusCode, 200);
    const workLogUpdatedBody = workLogUpdateResponse.json() as {
      item: {
        hours: number;
        notes: string;
        participantIds: string[];
        photoUrl: string;
      };
    };
    assert.equal(workLogUpdatedBody.item.hours, 2);
    assert.equal(workLogUpdatedBody.item.notes, "Route test work log updated from mobile");
    assert.deepEqual(workLogUpdatedBody.item.participantIds, ["lucas"]);
    assert.equal(
      workLogUpdatedBody.item.photoUrl,
      "https://cdn.example.test/worklogs/route-test-log-v2.png",
    );

    resetLimits();

    const mobileWorkLogDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/work-logs/${workLogCreatedBody.item.id}`,
    });

    assert.equal(mobileWorkLogDeleteResponse.statusCode, 200);
    assert.equal(mobileWorkLogDeleteResponse.json().item.id, workLogCreatedBody.item.id);
  });
});
