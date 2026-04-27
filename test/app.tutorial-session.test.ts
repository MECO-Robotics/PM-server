import assert from "node:assert/strict";
import { test } from "node:test";

import { withIntegrationApp } from "./helpers/appIntegrationHarness";

interface TutorialResetResponse {
  ok: boolean;
  mode: "session" | "baseline";
  restored: boolean;
  tutorial: {
    seasonId: string | null;
    seasonName: string | null;
    expectedProjectNames: string[];
    projectIdsByName: Record<string, string>;
    missingProjectNames: string[];
  };
}

test("tutorial baseline reset restores canonical season/projects and is idempotent", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const createMemberResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Tutorial Temp Student",
        role: "student",
      },
    });

    assert.equal(createMemberResponse.statusCode, 201);
    const createdMemberBody = createMemberResponse.json() as {
      item: { id: string };
    };
    assert.ok(createdMemberBody.item.id);

    resetLimits();

    const firstResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "baseline",
      },
    });

    assert.equal(firstResetResponse.statusCode, 200);
    const firstResetBody = firstResetResponse.json() as TutorialResetResponse;
    assert.equal(firstResetBody.ok, true);
    assert.equal(firstResetBody.mode, "baseline");
    assert.equal(firstResetBody.restored, true);
    assert.equal(firstResetBody.tutorial.seasonId, "default-season");
    assert.equal(firstResetBody.tutorial.seasonName, "Tutorial season");
    assert.deepEqual(firstResetBody.tutorial.expectedProjectNames, [
      "Tutorial Robot 2026",
      "Media",
      "Outreach",
      "Operations",
      "Strategy",
      "Training",
    ]);
    assert.equal(firstResetBody.tutorial.projectIdsByName.Outreach, "project-outreach-2026");
    assert.deepEqual(firstResetBody.tutorial.missingProjectNames, []);

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      members: Array<{ id: string }>;
    };
    assert.equal(
      bootstrapBody.members.some((member) => member.id === createdMemberBody.item.id),
      false,
    );

    resetLimits();

    const secondResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "baseline",
      },
    });

    assert.equal(secondResetResponse.statusCode, 200);
    const secondResetBody = secondResetResponse.json() as TutorialResetResponse;
    assert.deepEqual(secondResetBody, firstResetBody);
  });
});

test("tutorial session reset keeps snapshot restore semantics", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const startResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
    });

    assert.equal(startResponse.statusCode, 200);
    const startBody = startResponse.json() as {
      ok: boolean;
      mode: "session";
      tutorial: TutorialResetResponse["tutorial"];
    };
    assert.equal(startBody.ok, true);
    assert.equal(startBody.mode, "session");
    assert.equal(startBody.tutorial.seasonId, "default-season");

    resetLimits();

    const createMemberResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Tutorial Session Student",
        role: "student",
      },
    });

    assert.equal(createMemberResponse.statusCode, 201);
    const createdMemberBody = createMemberResponse.json() as {
      item: { id: string };
    };
    assert.ok(createdMemberBody.item.id);

    resetLimits();

    const resetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
    });

    assert.equal(resetResponse.statusCode, 200);
    const resetBody = resetResponse.json() as TutorialResetResponse;
    assert.equal(resetBody.ok, true);
    assert.equal(resetBody.mode, "session");
    assert.equal(resetBody.restored, true);

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      members: Array<{ id: string }>;
    };
    assert.equal(
      bootstrapBody.members.some((member) => member.id === createdMemberBody.item.id),
      false,
    );

    resetLimits();

    const secondResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
    });

    assert.equal(secondResetResponse.statusCode, 200);
    const secondResetBody = secondResetResponse.json() as TutorialResetResponse;
    assert.equal(secondResetBody.ok, false);
    assert.equal(secondResetBody.mode, "session");
    assert.equal(secondResetBody.restored, false);
  });
});

test("tutorial baseline reset preserves active session snapshot for restore", async () => {
  await withIntegrationApp(async ({ app, resetLimits }) => {
    const startResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/start",
    });

    assert.equal(startResponse.statusCode, 200);

    resetLimits();

    const baselineResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "baseline",
      },
    });

    assert.equal(baselineResetResponse.statusCode, 200);
    const baselineResetBody = baselineResetResponse.json() as TutorialResetResponse;
    assert.equal(baselineResetBody.ok, true);
    assert.equal(baselineResetBody.mode, "baseline");

    resetLimits();

    const createMemberResponse = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: {
        name: "Tutorial Baseline Session Student",
        role: "student",
      },
    });

    assert.equal(createMemberResponse.statusCode, 201);
    const createdMemberBody = createMemberResponse.json() as {
      item: { id: string };
    };

    resetLimits();

    const sessionResetResponse = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "session",
      },
    });

    assert.equal(sessionResetResponse.statusCode, 200);
    const sessionResetBody = sessionResetResponse.json() as TutorialResetResponse;
    assert.equal(sessionResetBody.ok, true);
    assert.equal(sessionResetBody.mode, "session");
    assert.equal(sessionResetBody.restored, true);

    resetLimits();

    const bootstrapResponse = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
    });

    assert.equal(bootstrapResponse.statusCode, 200);
    const bootstrapBody = bootstrapResponse.json() as {
      members: Array<{ id: string }>;
    };
    assert.equal(
      bootstrapBody.members.some((member) => member.id === createdMemberBody.item.id),
      false,
    );
  });
});

test("tutorial reset rejects invalid payload modes", async () => {
  await withIntegrationApp(async ({ app }) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tutorial/session/reset",
      payload: {
        mode: "chapter",
      },
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as {
      message: string;
    };
    assert.equal(body.message, "Tutorial reset payload is invalid.");
  });
});
