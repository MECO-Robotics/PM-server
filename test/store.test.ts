import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  createManufacturingItem,
  createMechanism,
  createSubsystem,
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

test("seed data includes an Outreach milestone linked to the outreach subsystem", () => {
  const snapshot = getSnapshot();
  const event = snapshot.events.find((candidate) => candidate.id === "outreach-milestone-may-05");

  assert.ok(event);
  assert.equal(event.title, "Outreach Milestone");
  assert.equal(event.type, "demo");
  assert.equal(event.isExternal, true);
  assert.deepEqual(event.relatedSubsystemIds, ["outreach"]);
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

test("createMechanism auto-generates a wiring task for the new mechanism", () => {
  const mechanism = createMechanism({
    subsystemId: "drive",
    name: "Test Mechanism",
    description: "Temporary mechanism for coverage.",
  });

  const wiringTask = getSnapshot().tasks.find(
    (task) => task.mechanismId === mechanism.id && task.title === "Wire Test Mechanism",
  );

  assert.ok(wiringTask);
  assert.equal(wiringTask?.subsystemId, "drive");
  assert.equal(wiringTask?.disciplineId, "electrical");
});

test("createSubsystem auto-generates an integration task for its parent subsystem", () => {
  const subsystem = createSubsystem({
    name: "Test Subsystem",
    description: "Temporary subsystem for coverage.",
    parentSubsystemId: "drive",
    responsibleEngineerId: "ava",
    mentorIds: ["jordan"],
    risks: ["Temporary integration risk"],
  });

  const integrationTask = getSnapshot().tasks.find(
    (task) => task.title === "Integrate Test Subsystem",
  );

  assert.equal(subsystem.parentSubsystemId, "drive");
  assert.ok(integrationTask);
  assert.equal(integrationTask?.subsystemId, "drive");
  assert.equal(integrationTask?.disciplineId, "integration");
  assert.equal(integrationTask?.mechanismId, null);
  assert.equal(integrationTask?.ownerId, "ava");
  assert.equal(integrationTask?.mentorId, "jordan");
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
  assert.equal(
    snapshot.subsystems.find((subsystem) => subsystem.id === "drive")?.isCore,
    true,
  );
  assert.equal(
    snapshot.subsystems.some((subsystem) => subsystem.id === "electrical"),
    false,
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
