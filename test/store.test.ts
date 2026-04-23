import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  createManufacturingItem,
  createPartDefinition,
  createPartInstance,
  createMember,
  getSnapshot,
  removeMember,
  removePartDefinition,
  resetStore,
  updateManufacturingItem,
  updatePartInstance,
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

test("updatePartInstance keeps the subsystem aligned with the selected mechanism", () => {
  const updated = updatePartInstance("pi-swerve-encoder-bracket-front-left", {
    mechanismId: "intake-roller",
  });

  assert.ok(updated);
  assert.equal(updated?.mechanismId, "intake-roller");
  assert.equal(updated?.subsystemId, "manipulator");
});

test("fabrication manufacturing items stay seeded and update cleanly", () => {
  const seededFabricationItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === "frame-weldment",
  );

  assert.ok(seededFabricationItem);
  assert.equal(seededFabricationItem?.process, "fabrication");
  assert.equal(seededFabricationItem?.partDefinitionId, null);

  const createdFabricationItem = createManufacturingItem({
    title: "Temporary Weldment",
    subsystemId: "drive",
    requestedById: "ava",
    process: "fabrication",
    dueDate: "2026-04-30",
    material: "1/8 aluminum tube",
    partDefinitionId: null,
    quantity: 1,
    status: "requested",
    mentorReviewed: false,
    batchLabel: "FAB-99",
  });

  assert.equal(createdFabricationItem.process, "fabrication");
  assert.equal(createdFabricationItem.partDefinitionId, null);
  assert.equal(createdFabricationItem.batchLabel, "FAB-99");

  const updatedFabricationItem = updateManufacturingItem(createdFabricationItem.id, {
    title: "Temporary Weldment Rev B",
    status: "approved",
  });

  assert.ok(updatedFabricationItem);
  assert.equal(updatedFabricationItem?.process, "fabrication");
  assert.equal(updatedFabricationItem?.title, "Temporary Weldment Rev B");
  assert.equal(updatedFabricationItem?.status, "approved");
  assert.equal(
    getSnapshot().manufacturingItems.find((item) => item.id === createdFabricationItem.id)
      ?.title,
    "Temporary Weldment Rev B",
  );
});

test("removePartDefinition clears linked part instances and task references", () => {
  const createdPartDefinition = createPartDefinition({
    name: "Temporary Test Part",
    partNumber: "TMP-001",
    revision: "A",
    type: "custom",
    source: "Onshape",
    materialId: "mat-onyx-filament",
    description: "Temporary fixture for store coverage.",
  });
  const createdPartInstance = createPartInstance({
    subsystemId: "drive",
    mechanismId: "swerve-module",
    partDefinitionId: createdPartDefinition.id,
    name: "Temporary test part instance",
    quantity: 1,
    trackIndividually: false,
    status: "planned",
  });

  updateTask("swerve-sensor-bundle", {
    partInstanceId: createdPartInstance.id,
  });

  const removed = removePartDefinition(createdPartDefinition.id);
  const snapshot = getSnapshot();

  assert.equal(removed?.id, createdPartDefinition.id);
  assert.equal(
    snapshot.partDefinitions.some((partDefinition) => partDefinition.id === createdPartDefinition.id),
    false,
  );
  assert.equal(
    snapshot.partInstances.some((partInstance) => partInstance.id === createdPartInstance.id),
    false,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "swerve-sensor-bundle")?.partInstanceId,
    null,
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
