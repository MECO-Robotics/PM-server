import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  createProject,
  createSeason,
  createManufacturingItem,
  createMechanism,
  createSubsystem,
  createWorkstream,
  createPartDefinition,
  createPartInstance,
  createMember,
  getSnapshot,
  removeMember,
  removePartDefinition,
  resetStore,
  updatePartDefinition,
  updateManufacturingItem,
  updateMember,
  updatePartInstance,
  updateTask,
} from "../src/data/store";

beforeEach(() => {
  resetStore();
});

function nonRobotProjectNamesForSeason(seasonId: string) {
  return getSnapshot()
    .projects.filter(
      (project) => project.seasonId === seasonId && project.projectType !== "robot",
    )
    .map((project) => project.name);
}

test("seed and created seasons only use the canonical non-robot projects", () => {
  assert.deepEqual(nonRobotProjectNamesForSeason("default-season"), [
    "Media",
    "Outreach",
    "Operations",
    "Strategy",
    "Training",
  ]);

  const season = createSeason({
    name: "2027 Season",
    type: "season",
    startDate: "2027-01-01",
    endDate: "2027-04-30",
  });

  assert.deepEqual(nonRobotProjectNamesForSeason(season.id), [
    "Media",
    "Outreach",
    "Operations",
    "Strategy",
    "Training",
  ]);
});

test("createSeason seeds drivetrain defaults for the robot project", () => {
  const season = createSeason({
    name: "2028 Season",
    type: "season",
    startDate: "2028-01-01",
    endDate: "2028-04-30",
  });
  const snapshot = getSnapshot();
  const robotProject = snapshot.projects.find(
    (project) => project.seasonId === season.id && project.projectType === "robot",
  );

  assert.ok(robotProject);

  const drivetrain = snapshot.subsystems.find(
    (subsystem) =>
      subsystem.projectId === robotProject.id && subsystem.name === "Drivetrain",
  );
  assert.ok(drivetrain);

  const mechanismNames = snapshot.mechanisms
    .filter((mechanism) => mechanism.subsystemId === drivetrain.id)
    .map((mechanism) => mechanism.name);

  assert.deepEqual(mechanismNames, [
    "Left Front Module",
    "Right Front Module",
    "Left Back Module",
    "Right Back Module",
    "Chassis",
  ]);
});

test("createProject seeds drivetrain defaults for robot projects", () => {
  const project = createProject({
    seasonId: "default-season",
    name: "Practice Bot",
    projectType: "robot",
  });
  const snapshot = getSnapshot();
  const drivetrain = snapshot.subsystems.find(
    (subsystem) =>
      subsystem.projectId === project.id && subsystem.name === "Drivetrain",
  );

  assert.ok(drivetrain);

  const mechanismNames = snapshot.mechanisms
    .filter((mechanism) => mechanism.subsystemId === drivetrain.id)
    .map((mechanism) => mechanism.name);

  assert.deepEqual(mechanismNames, [
    "Left Front Module",
    "Right Front Module",
    "Left Back Module",
    "Right Back Module",
    "Chassis",
  ]);
});

test("seeded training records belong to the Training project", () => {
  const snapshot = getSnapshot();
  const trainingProject = snapshot.projects.find(
    (project) => project.id === "project-training-2026",
  );

  assert.ok(trainingProject);
  assert.equal(trainingProject.name, "Training");
  assert.equal(
    snapshot.workstreams.find((workstream) => workstream.id === "workstream-scouting-training")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.workstreams.find((workstream) => workstream.id === "workstream-scouting-data")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.subsystems.find((subsystem) => subsystem.id === "scouting")?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.artifacts.find((artifact) => artifact.id === "artifact-scouting-rubric")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.artifacts.find((artifact) => artifact.id === "artifact-scouting-ingest-notes")
      ?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "scouting-rubric-training")?.projectId,
    trainingProject.id,
  );
  assert.equal(
    snapshot.tasks.find((task) => task.id === "scouting-tablet-refresh")?.projectId,
    trainingProject.id,
  );
  assert.deepEqual(
    snapshot.workstreams
      .filter((workstream) => workstream.projectId === "project-strategy-2026")
      .map((workstream) => workstream.id),
    [],
  );
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
  assert.deepEqual(first.activeSeasonIds, [first.seasonId]);
  assert.equal(second.id, "ava-chen-2");
  assert.deepEqual(second.activeSeasonIds, [second.seasonId]);
  assert.equal(getSnapshot().members.slice(-2).map((member) => member.id).join(","), "ava-chen,ava-chen-2");
});

test("updateMember can reactivate an existing person for another season", () => {
  const season = createSeason({
    name: "2027 Offseason",
    type: "offseason",
    startDate: "2027-05-01",
    endDate: "2027-08-31",
  });
  const member = createMember({
    name: "Season Hopper",
    role: "student",
    seasonId: "default-season",
  });

  const updatedMember = updateMember(member.id, {
    activeSeasonIds: [...(member.activeSeasonIds ?? []), season.id],
  });

  assert.ok(updatedMember);
  const refreshedMember = getSnapshot().members.find((candidate) => candidate.id === member.id);
  assert.ok(refreshedMember);
  assert.deepEqual(refreshedMember?.activeSeasonIds?.sort(), ["default-season", season.id].sort());
});

test("createPartDefinition defaults active season membership and can be reactivated for another season", () => {
  const season = createSeason({
    name: "2027 Offseason",
    type: "offseason",
    startDate: "2027-05-01",
    endDate: "2027-08-31",
  });

  const created = createPartDefinition({
    name: "Seasoned Plate",
    partNumber: "SEA-001",
    revision: "A",
    type: "custom",
    source: "Onshape",
    materialId: "mat-onyx-filament",
    description: "Season-scoped part definition.",
    seasonId: "default-season",
  });

  assert.deepEqual(created.activeSeasonIds, ["default-season"]);

  const updatedPartDefinition = updatePartDefinition(created.id, {
    activeSeasonIds: [...(created.activeSeasonIds ?? []), season.id],
  });

  assert.ok(updatedPartDefinition);
  const refreshedPartDefinition = getSnapshot().partDefinitions.find(
    (candidate) => candidate.id === created.id,
  );
  assert.ok(refreshedPartDefinition);
  assert.deepEqual(
    refreshedPartDefinition?.activeSeasonIds?.sort(),
    ["default-season", season.id].sort(),
  );
});

test("createWorkstream adds a project-scoped workflow", () => {
  const workstream = createWorkstream({
    projectId: "project-operations-2026",
    name: "Awards",
    description: "Awards submission workflow.",
  });

  assert.equal(workstream.id, "awards");
  assert.equal(workstream.isArchived, false);
  assert.equal(workstream.projectId, "project-operations-2026");
  assert.equal(
    getSnapshot().workstreams.some((candidate) => candidate.id === workstream.id),
    true,
  );
});

test("createMechanism auto-generates a wiring task for the new mechanism", () => {
  const mechanism = createMechanism({
    subsystemId: "drive",
    name: "Test Mechanism",
    description: "Temporary mechanism for coverage.",
  });

  assert.equal(mechanism.isArchived, false);

  const wiringTask = getSnapshot().tasks.find(
    (task) => task.mechanismId === mechanism.id && task.title === "Wire Test Mechanism",
  );

  assert.ok(wiringTask);
  assert.equal(wiringTask?.subsystemId, "drive");
  assert.equal(wiringTask?.disciplineId, "electrical");
});

test("createSubsystem auto-generates an integration task for its parent subsystem", () => {
  const subsystem = createSubsystem({
    projectId: "default-season-robot",
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
  updateTask("intake-guard", {
    status: "complete",
    actualHours: 8,
    assigneeIds: ["ava", "ethan"],
  });

  const updatedTask = getSnapshot().tasks.find((task) => task.id === "intake-guard");
  assert.ok(updatedTask);
  assert.equal(updatedTask.status, "complete");
  assert.equal(updatedTask.actualHours, 8);
  assert.deepEqual(updatedTask.assigneeIds, ["ava", "ethan"]);
});

test("updatePartInstance keeps the subsystem aligned with the selected mechanism", () => {
  updatePartInstance("pi-swerve-encoder-bracket-front-left", {
    mechanismId: "intake-roller",
  });

  const updatedPartInstance = getSnapshot().partInstances.find(
    (item) => item.id === "pi-swerve-encoder-bracket-front-left",
  );
  assert.ok(updatedPartInstance);
  assert.equal(updatedPartInstance.mechanismId, "intake-roller");
  assert.equal(updatedPartInstance.subsystemId, "manipulator");
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

  updateManufacturingItem(createdFabricationItem.id, {
    title: "Temporary Weldment Rev B",
    status: "approved",
  });

  const updatedFabricationItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === createdFabricationItem.id,
  );
  assert.ok(updatedFabricationItem);
  assert.equal(updatedFabricationItem.process, "fabrication");
  assert.equal(updatedFabricationItem.title, "Temporary Weldment Rev B");
  assert.equal(updatedFabricationItem.status, "approved");
});

test("cnc manufacturing items keep the in-house flag through create and update", () => {
  const createdCncItem = createManufacturingItem({
    title: "Temporary CNC Plate",
    subsystemId: "drive",
    requestedById: "ava",
    process: "cnc",
    dueDate: "2026-05-01",
    material: "6061 aluminum",
    partDefinitionId: "pd-swerve-encoder-bracket",
    quantity: 2,
    status: "requested",
    mentorReviewed: false,
    batchLabel: "CNC-99",
    inHouse: false,
  });

  assert.equal(createdCncItem.inHouse, false);

  updateManufacturingItem(createdCncItem.id, {
    inHouse: true,
  });

  const updatedCncItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === createdCncItem.id,
  );
  assert.ok(updatedCncItem);
  assert.equal(updatedCncItem.inHouse, true);
});

test("manufacturing items keep linked part instances through create and update", () => {
  const createdCncItem = createManufacturingItem({
    title: "Temporary Encoder Bracket",
    subsystemId: "drive",
    requestedById: "ava",
    process: "cnc",
    dueDate: "2026-05-01",
    material: "6061 aluminum",
    partDefinitionId: "pd-swerve-encoder-bracket",
    partInstanceId: "pi-swerve-encoder-bracket-front-left",
    partInstanceIds: ["pi-swerve-encoder-bracket-front-left"],
    quantity: 2,
    status: "requested",
    mentorReviewed: false,
    batchLabel: "CNC-100",
    inHouse: true,
  });

  assert.equal(createdCncItem.partInstanceId, "pi-swerve-encoder-bracket-front-left");
  assert.deepEqual(createdCncItem.partInstanceIds, ["pi-swerve-encoder-bracket-front-left"]);

  updateManufacturingItem(createdCncItem.id, {
    subsystemId: "manipulator",
    partDefinitionId: "pd-intake-guard",
    partInstanceId: "pi-intake-guard-set",
    partInstanceIds: ["pi-intake-guard-set"],
  });

  const updatedCncItem = getSnapshot().manufacturingItems.find(
    (item) => item.id === createdCncItem.id,
  );
  assert.ok(updatedCncItem);
  assert.equal(updatedCncItem.partInstanceId, "pi-intake-guard-set");
  assert.deepEqual(updatedCncItem.partInstanceIds, ["pi-intake-guard-set"]);
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
  assert.equal(createdPartDefinition.isArchived, false);
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
  updateTask("swerve-sensor-bundle", {
    assigneeIds: ["ava", "jordan"],
  });

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
    snapshot.tasks.find((task) => task.id === "swerve-sensor-bundle")?.assigneeIds,
    ["ava"],
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
