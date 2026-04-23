import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  createMember,
  getSnapshot,
  removeMember,
  resetStore,
  updateTask,
} from "../src/data/store";

beforeEach(() => {
  resetStore();
});

test("createMember generates unique slugs for repeated names", () => {
  const first = createMember({
    name: "Ava Chen",
    role: "student",
  });
  const second = createMember({
    name: "Ava Chen",
    role: "mentor",
  });

  assert.equal(first.id, "ava-chen");
  assert.equal(second.id, "ava-chen-2");
  assert.equal(getSnapshot().members.slice(-2).map((member) => member.id).join(","), "ava-chen,ava-chen-2");
});

test("updateTask patches an existing task in place", () => {
  const updated = updateTask("intake-guard", {
    status: "complete",
    actualHours: 8,
  });

  assert.ok(updated);
  assert.equal(updated?.status, "complete");
  assert.equal(updated?.actualHours, 8);
  assert.equal(
    getSnapshot().tasks.find((task) => task.id === "intake-guard")?.status,
    "complete",
  );
});

test("removeMember clears linked references across the snapshot", () => {
  const removed = removeMember("jordan");
  const snapshot = getSnapshot();

  assert.equal(removed?.id, "jordan");
  assert.equal(snapshot.members.some((member) => member.id === "jordan"), false);
  assert.deepEqual(
    snapshot.subsystems.find((subsystem) => subsystem.id === "drive")?.mentorIds,
    [],
  );
  assert.deepEqual(
    snapshot.subsystems.find((subsystem) => subsystem.id === "electrical")?.mentorIds,
    [],
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "swerve-sensor-bundle")?.mentorId,
    null,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "pit-checklist")?.mentorId,
    null,
  );
  assert.deepEqual(
    snapshot.workLogs.find((workLog) => workLog.id === "log-1")?.participantIds,
    ["ava"],
  );
  assert.equal(
    snapshot.attendanceRecords.some((record) => record.memberId === "jordan"),
    false,
  );
  assert.deepEqual(
    snapshot.qaReviews.find((review) => review.id === "qa-1")?.participantIds,
    ["priya"],
  );
  assert.deepEqual(
    snapshot.qaReviews.find((review) => review.id === "qa-2")?.participantIds,
    ["ava"],
  );
});
