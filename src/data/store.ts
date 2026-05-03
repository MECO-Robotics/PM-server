import { snapshot as initialSnapshot } from "./mockData";
import type {
  Artifact,
  DesignIteration,
  Discipline,
  MilestoneRequirement,
  Milestone,
  MilestoneStatus,
  ManufacturingItem,
  Material,
  Mechanism,
  Member,
  PartDefinition,
  PartInstance,
  PlatformSnapshot,
  Project,
  PurchaseItem,
  Report,
  ReportFinding,
  Risk,
  QaReport,
  QaFinding,
  Season,
  Subsystem,
  Task,
  TaskBlocker,
  TaskDependency,
  TestResult,
  TestFinding,
  Workstream,
  WorkLog,
} from "../domain/types";
import {
  getDefaultTaskDisciplineIdForProject,
  isTaskDisciplineAllowedForProject,
} from "../domain/taskDisciplines";
import type {
  ArtifactInput,
  MilestoneInput,
  ManufacturingItemInput,
  MaterialInput,
  MechanismInput,
  MemberInput,
  PartDefinitionInput,
  PartInstanceInput,
  ProjectInput,
  QaReportInput,
  ReportFindingInput,
  ReportInput,
  RiskInput,
  PurchaseItemInput,
  SeasonInput,
  SubsystemInput,
  TaskBlockerInput,
  TaskDependencyInput,
  TaskInput,
  TestResultInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

export type {
  ArtifactInput,
  MilestoneInput,
  ManufacturingItemInput,
  MaterialInput,
  MechanismInput,
  MemberInput,
  PartDefinitionInput,
  PartInstanceInput,
  ProjectInput,
  QaReportInput,
  ReportFindingInput,
  ReportInput,
  RiskInput,
  PurchaseItemInput,
  SeasonInput,
  SubsystemInput,
  TaskBlockerInput,
  TaskDependencyInput,
  TaskInput,
  TestResultInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

export interface MilestoneMatch {
  milestoneId: string;
  matchedRequirementIds: string[];
  isLegacyLink: boolean;
}

export interface TaskMilestoneMatch {
  taskId: string;
  matchedRequirementIds: string[];
  isLegacyLink: boolean;
}

function parseIterationCondition(conditionValue: string) {
  const normalized = conditionValue.trim().toLowerCase();
  const match = normalized.match(/^iteration\s*([<>]=?|==)\s*(\d+)$/);
  if (!match) {
    return null;
  }

  const [, operator, iterationText] = match;
  const parsedIteration = Number.parseInt(iterationText, 10);
  if (!Number.isFinite(parsedIteration)) {
    return null;
  }

  return {
    operator: operator === "==" ? "=" : operator,
    iteration: Math.max(1, Math.trunc(parsedIteration)),
  };
}

function normalizeStateValue(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function extractComparableState(targetType: MilestoneRequirement["targetType"], targetId: string) {
  if (targetType === "artifact") {
    const artifact = currentSnapshot.artifacts.find((candidate) => candidate.id === targetId);
    if (!artifact) {
      return null;
    }

    return normalizeStateValue(artifact.status);
  }

  if (targetType === "part-instance") {
    const partInstance = currentSnapshot.partInstances.find(
      (candidate) => candidate.id === targetId,
    );
    if (!partInstance) {
      return null;
    }

    return normalizeStateValue(partInstance.status);
  }

  return null;
}

function extractComparableIteration(targetType: MilestoneRequirement["targetType"], targetId: string) {
  if (targetType === "subsystem") {
    const subsystem = currentSnapshot.subsystems.find((candidate) => candidate.id === targetId);
    return subsystem?.iteration;
  }

  if (targetType === "mechanism") {
    const mechanism = currentSnapshot.mechanisms.find((candidate) => candidate.id === targetId);
    return mechanism?.iteration;
  }

  return undefined;
}

function isConditionSatisfied({
  targetType,
  targetId,
  conditionType,
  conditionValue,
}: Pick<MilestoneRequirement, "targetType" | "targetId" | "conditionType" | "conditionValue">) {
  if (conditionType === "custom") {
    return conditionValue.trim().toLowerCase() === "in_scope";
  }

  if (conditionType === "iteration") {
    const parsed = parseIterationCondition(conditionValue);
    if (!parsed) {
      return false;
    }

    const actualIteration = extractComparableIteration(targetType, targetId);
    if (typeof actualIteration !== "number") {
      return false;
    }

    if (parsed.operator === "=") {
      return actualIteration === parsed.iteration;
    }
    if (parsed.operator === ">=") {
      return actualIteration >= parsed.iteration;
    }
    if (parsed.operator === ">") {
      return actualIteration > parsed.iteration;
    }
    if (parsed.operator === "<=") {
      return actualIteration <= parsed.iteration;
    }
    if (parsed.operator === "<") {
      return actualIteration < parsed.iteration;
    }

    return false;
  }

  const parsedState = normalizeStateValue(conditionValue.replace(/^state\s*=\s*/i, ""));
  if (!parsedState.length || parsedState === "STATE") {
    return false;
  }

  const actualState = extractComparableState(targetType, targetId);
  if (!actualState) {
    return false;
  }

  const stateAliases: Record<string, string[]> = {
    COMPLETE: ["COMPLETE", "DONE", "PASS", "PASSED", "OK", "PUBLISHED", "INSTALLED"],
    IN_REVIEW: ["IN_REVIEW", "REVIEW", "UNDER_REVIEW", "REVIEWING"],
    QA_PASSED: ["QA_PASSED", "PASSED", "APPROVED", "COMPLETE", "PUBLISHED"],
  };

  return (
    actualState === parsedState ||
    (stateAliases[parsedState] ?? []).includes(actualState)
  );
}

function matchesMilestoneRequirement({
  milestoneRequirement,
  targetType,
  targetId,
}: {
  milestoneRequirement: MilestoneRequirement;
  targetType: string;
  targetId: string;
}) {
  if (milestoneRequirement.targetType !== targetType || milestoneRequirement.targetId !== targetId) {
    return false;
  }

  if (milestoneRequirement.conditionType === "custom") {
    return true;
  }

  return isConditionSatisfied(milestoneRequirement);
}

function normalizeMemberSeasonMembership(
  member: Member,
  fallbackSeasonId: string,
): Member {
  const seasonId = member.seasonId || fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(member.activeSeasonIds ?? []), seasonId]);
  return {
    ...member,
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
  };
}

function normalizePartDefinitionSeasonMembership(
  partDefinition: PartDefinition,
  fallbackSeasonId: string,
): PartDefinition {
  const seasonId = partDefinition.seasonId || fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(partDefinition.activeSeasonIds ?? []), seasonId]);
  return {
    ...partDefinition,
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
  };
}

function normalizeSubsystemSerialAlias(value: string | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length > 0 ? normalized.slice(0, 8) : undefined;
}

function deriveSubsystemSerialAlias(name: string) {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return "SYS";
  }

  const words = trimmedName
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const initials = words.map((word) => word[0] ?? "").join("").toUpperCase();
  if (initials.length >= 2) {
    return initials.slice(0, 8);
  }

  const lettersOnly = trimmedName.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (lettersOnly.slice(0, 2) || "SY").slice(0, 8);
}

function normalizeTaskCreatedAt(task: Task) {
  if (typeof task.createdAt === "string" && task.createdAt.trim()) {
    return task.createdAt;
  }

  const candidateDate = task.startDate || task.dueDate;
  if (typeof candidateDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidateDate)) {
    return new Date(`${candidateDate}T00:00:00.000Z`).toISOString();
  }

  return new Date().toISOString();
}

function formatTaskSerial(task: Task, subsystem: Subsystem | undefined) {
  const serialNumber = typeof task.serialNumber === "number" ? task.serialNumber : 0;
  const alias = subsystem?.serialAlias ?? deriveSubsystemSerialAlias(subsystem?.name ?? "");
  return `T-${alias}${serialNumber}`;
}

function normalizeSnapshotTaskSerials(snapshot: PlatformSnapshot): PlatformSnapshot {
  const normalizedSubsystems = snapshot.subsystems.map((subsystem) => ({
    ...subsystem,
    serialAlias: normalizeSubsystemSerialAlias(subsystem.serialAlias),
  }));
  const subsystemsById = new Map(
    normalizedSubsystems.map((subsystem) => [subsystem.id, subsystem] as const),
  );

  const tasksWithCreatedAt = snapshot.tasks.map((task) => ({
    ...task,
    createdAt: normalizeTaskCreatedAt(task),
  }));

  const tasksBySubsystemId = new Map<string, Task[]>();
  for (const task of tasksWithCreatedAt) {
    const bucket = tasksBySubsystemId.get(task.subsystemId);
    if (bucket) {
      bucket.push(task);
    } else {
      tasksBySubsystemId.set(task.subsystemId, [task]);
    }
  }

  const normalizedTasks = tasksWithCreatedAt.map((task) => task);
  const taskIndexById = new Map(normalizedTasks.map((task, index) => [task.id, index] as const));

  for (const [subsystemId, tasks] of tasksBySubsystemId) {
    const subsystem = subsystemsById.get(subsystemId);
    const usedNumbers = new Set<number>();
    let maxSerialNumber = 0;
    const missingSerialTasks: Task[] = [];

    for (const task of tasks) {
      if (typeof task.serialNumber !== "number" || !Number.isFinite(task.serialNumber)) {
        missingSerialTasks.push(task);
        continue;
      }

      const serialNumber = Math.trunc(task.serialNumber);
      if (serialNumber < 1 || usedNumbers.has(serialNumber)) {
        missingSerialTasks.push({ ...task, serialNumber: undefined });
        continue;
      }

      usedNumbers.add(serialNumber);
      maxSerialNumber = Math.max(maxSerialNumber, serialNumber);
    }

    const nextMissingSerialTasks = missingSerialTasks
      .map((task) => ({
        ...task,
        createdAt: normalizeTaskCreatedAt(task),
      }))
      .sort((a, b) => {
        const diff = a.createdAt!.localeCompare(b.createdAt!);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });

    let nextSerialNumber = maxSerialNumber;
    for (const task of nextMissingSerialTasks) {
      nextSerialNumber += 1;
      usedNumbers.add(nextSerialNumber);

      const index = taskIndexById.get(task.id);
      if (index === undefined) {
        continue;
      }

      normalizedTasks[index] = {
        ...normalizedTasks[index],
        createdAt: task.createdAt,
        serialNumber: nextSerialNumber,
      };
    }

    for (const task of tasks) {
      const index = taskIndexById.get(task.id);
      if (index === undefined) {
        continue;
      }

      const updated = normalizedTasks[index];
      const serialNumber = typeof updated.serialNumber === "number" ? updated.serialNumber : 0;
      normalizedTasks[index] = {
        ...updated,
        serialNumber,
        serial: formatTaskSerial({ ...updated, serialNumber }, subsystem),
      };
    }
  }

  return {
    ...snapshot,
    subsystems: normalizedSubsystems,
    tasks: normalizedTasks,
  };
}

function cloneSnapshot(snapshot: PlatformSnapshot): PlatformSnapshot {
  const clonedSnapshot = structuredClone(snapshot);
  const fallbackSeasonId = clonedSnapshot.seasons[0]?.id ?? "default-season";
  const projectsById = new Map(clonedSnapshot.projects.map((project) => [project.id, project] as const));

  const normalizeMilestoneSeasonId = (milestone: Milestone) => {
    if (milestone.seasonId) {
      return milestone.seasonId;
    }

    const projectSeasonId =
      (milestone.projectIds ?? [])
        .map((projectId) => projectsById.get(projectId)?.seasonId ?? null)
        .find((seasonId): seasonId is string => Boolean(seasonId)) ?? null;

    return projectSeasonId ?? fallbackSeasonId;
  };

  const normalizedMilestones = clonedSnapshot.milestones.map((milestone) => ({
    ...milestone,
    seasonId: normalizeMilestoneSeasonId(milestone),
    status: normalizeMilestoneStatus(milestone.status),
    isBlocked: milestone.isBlocked ?? false,
    blockedReason: milestone.blockedReason ?? null,
    blockedByType: milestone.blockedByType ?? null,
    blockedById: milestone.blockedById ?? null,
    photoUrl: typeof milestone.photoUrl === "string" ? milestone.photoUrl : "",
  }));

  const normalizedPartInstances = clonedSnapshot.partInstances.map((partInstance) => ({
    ...partInstance,
    status: normalizePartInstanceStatus(partInstance.status),
    photoUrl: typeof partInstance.photoUrl === "string" ? partInstance.photoUrl : "",
  }));

  const buildLegacyScopeRequirements = (milestones: Milestone[]): MilestoneRequirement[] => {
    const requirements: MilestoneRequirement[] = [];
    const seen = new Set<string>();

    for (const milestone of milestones) {
      let sortOrder = 1;
      for (const projectId of uniqueIds(milestone.projectIds ?? [])) {
        const id = `${milestone.id}:scope:project:${projectId}`;
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        requirements.push({
          id,
          milestoneId: milestone.id,
          targetType: "project",
          targetId: projectId,
          conditionType: "custom",
          conditionValue: "in_scope",
          required: true,
          sortOrder: sortOrder++,
          notes: "",
        });
      }

      for (const subsystemId of uniqueIds(milestone.relatedSubsystemIds ?? [])) {
        const id = `${milestone.id}:scope:subsystem:${subsystemId}`;
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        requirements.push({
          id,
          milestoneId: milestone.id,
          targetType: "subsystem",
          targetId: subsystemId,
          conditionType: "custom",
          conditionValue: "in_scope",
          required: true,
          sortOrder: sortOrder++,
          notes: "",
        });
      }
    }

    return requirements;
  };

  const normalizedMilestoneRequirements =
    clonedSnapshot.milestoneRequirements && Array.isArray(clonedSnapshot.milestoneRequirements)
      ? clonedSnapshot.milestoneRequirements
      : buildLegacyScopeRequirements(normalizedMilestones);

  return normalizeSnapshotTaskSerials({
    ...clonedSnapshot,
    members: clonedSnapshot.members.map((member) =>
      normalizeMemberSeasonMembership(member, fallbackSeasonId),
    ),
    partDefinitions: clonedSnapshot.partDefinitions.map((partDefinition) =>
      normalizePartDefinitionSeasonMembership(partDefinition, fallbackSeasonId),
    ),
    milestones: normalizedMilestones,
    partInstances: normalizedPartInstances,
    milestoneRequirements: normalizedMilestoneRequirements,
  });
}

let currentSnapshot = cloneSnapshot(initialSnapshot);
let interactiveTutorialSnapshot: PlatformSnapshot | null = null;

function isElevatedMemberRole(role: Member["role"]): boolean {
  return role === "lead" || role === "admin";
}

function normalizeIteration(iteration: number | undefined) {
  return Number.isFinite(iteration) && iteration && iteration >= 1
    ? Math.trunc(iteration)
    : 1;
}

function normalizeWorkspaceColor(color: string | undefined) {
  if (typeof color !== "string") {
    return undefined;
  }

  const trimmedColor = color.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmedColor) ? trimmedColor : undefined;
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function uniqueId(base: string, existingIds: Set<string>) {
  if (!existingIds.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }

  return `${base}-${counter}`;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function normalizeMilestoneStatus(
  status: MilestoneStatus | "not-started" | "in-progress" | "waiting-for-qa" | "complete" | undefined,
): MilestoneStatus {
  if (status === "not ready" || status === "blocked" || status === "qa" || status === "ready") {
    return status;
  }

  if (status === "not-started") {
    return "not ready";
  }

  if (status === "in-progress") {
    return "blocked";
  }

  if (status === "waiting-for-qa") {
    return "qa";
  }

  if (status === "complete") {
    return "ready";
  }

  return "not ready";
}

function normalizePartInstanceStatus(
  status: PartInstance["status"] | "planned" | "needed" | "available" | "installed" | "retired" | undefined,
): PartInstance["status"] {
  if (status === "not ready" || status === "blocked" || status === "qa" || status === "ready") {
    return status;
  }

  if (status === "planned" || status === "retired") {
    return "not ready";
  }

  if (status === "needed") {
    return "blocked";
  }

  if (status === "available" || status === "installed") {
    return "ready";
  }

  return "not ready";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getNextPartNumberForPrefix(prefixInput: string) {
  const prefix = prefixInput.trim().toUpperCase();
  if (!prefix) {
    return "P-001";
  }

  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, "i");
  let maxSerial = 0;
  for (const partDefinition of currentSnapshot.partDefinitions) {
    const match = pattern.exec(partDefinition.partNumber.trim());
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    maxSerial = Math.max(maxSerial, parsed);
  }

  const nextSerial = maxSerial + 1;
  return `${prefix}-${String(nextSerial).padStart(3, "0")}`;
}

function resolvePartNumberForNewPartDefinition(
  requestedPartNumber: string | undefined,
  isHardware: boolean,
) {
  const trimmed = (requestedPartNumber ?? "").trim();
  if (!trimmed) {
    return getNextPartNumberForPrefix(isHardware ? "H" : "P");
  }

  const normalized = trimmed.toUpperCase();
  const prefixMatch = /^([A-Z0-9]{2,10})-?$/.exec(normalized);
  const hasDigits = /\d/.test(normalized);
  if (prefixMatch && !hasDigits) {
    return getNextPartNumberForPrefix(prefixMatch[1]);
  }

  return trimmed;
}

function normalizeTaskTargets(task: Task): Task {
  const workstreamIds = uniqueIds(
    task.workstreamIds.length > 0 ? task.workstreamIds : [task.workstreamId],
  );
  const subsystemIds = uniqueIds(
    task.subsystemIds.length > 0 ? task.subsystemIds : [task.subsystemId],
  );
  const mechanismIds = uniqueIds(
    task.mechanismIds.length > 0 ? task.mechanismIds : [task.mechanismId],
  );
  const partInstanceIds = uniqueIds(
    task.partInstanceIds.length > 0 ? task.partInstanceIds : [task.partInstanceId],
  );
  const artifactIds = uniqueIds(
    task.artifactIds.length > 0 ? task.artifactIds : [task.artifactId],
  );
  const taskAssigneeIds = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
  const assigneeIds = uniqueIds(
    taskAssigneeIds.length > 0 ? taskAssigneeIds : [task.ownerId],
  );

  return {
    ...task,
    workstreamId: workstreamIds[0] ?? null,
    workstreamIds,
    subsystemId: subsystemIds[0] ?? task.subsystemId,
    subsystemIds,
    mechanismId: mechanismIds[0] ?? null,
    mechanismIds,
    partInstanceId: partInstanceIds[0] ?? null,
    partInstanceIds,
    artifactId: artifactIds[0] ?? null,
    artifactIds,
    assigneeIds,
  };
}

export interface FindingListItem {
  id: string;
  sourceType: "qa" | "test";
  sourceId: string | null;
  title: string;
  detail: string;
  severity: QaFinding["severity"] | TestFinding["severity"];
  status: QaFinding["status"] | TestFinding["status"];
  projectId: string;
  workstreamId: string | null;
  subsystemId: string | null;
  mechanismId: string | null;
  partInstanceId: string | null;
  artifactId: string | null;
  taskId: string | null;
  milestoneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskTargetType =
  | "project"
  | "workstream"
  | "subsystem"
  | "mechanism"
  | "part-instance"
  | "artifact"
  | "milestone";

export interface TaskTargetLink {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  workstreamId: string | null;
  subsystemId: string;
  targetType: TaskTargetType;
  targetId: string;
}

function flattenTaskTargets(task: Task): TaskTargetLink[] {
  const links: TaskTargetLink[] = [];

  links.push({
    id: `${task.id}:project:${task.projectId}`,
    taskId: task.id,
    taskTitle: task.title,
    projectId: task.projectId,
    workstreamId: task.workstreamId,
    subsystemId: task.subsystemId,
    targetType: "project",
    targetId: task.projectId,
  });

  const workstreamIds = uniqueIds([...task.workstreamIds, task.workstreamId]);
  for (const workstreamId of workstreamIds) {
    links.push({
      id: `${task.id}:workstream:${workstreamId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "workstream",
      targetId: workstreamId,
    });
  }

  const subsystemIds = uniqueIds([...task.subsystemIds, task.subsystemId]);
  for (const subsystemId of subsystemIds) {
    links.push({
      id: `${task.id}:subsystem:${subsystemId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "subsystem",
      targetId: subsystemId,
    });
  }

  const mechanismIds = uniqueIds([...task.mechanismIds, task.mechanismId]);
  for (const mechanismId of mechanismIds) {
    links.push({
      id: `${task.id}:mechanism:${mechanismId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "mechanism",
      targetId: mechanismId,
    });
  }

  const partInstanceIds = uniqueIds([...task.partInstanceIds, task.partInstanceId]);
  for (const partInstanceId of partInstanceIds) {
    links.push({
      id: `${task.id}:part-instance:${partInstanceId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "part-instance",
      targetId: partInstanceId,
    });
  }

  const artifactIds = uniqueIds([...task.artifactIds, task.artifactId]);
  for (const artifactId of artifactIds) {
    links.push({
      id: `${task.id}:artifact:${artifactId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "artifact",
      targetId: artifactId,
    });
  }

  if (task.targetMilestoneId) {
    links.push({
      id: `${task.id}:milestone:${task.targetMilestoneId}`,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      workstreamId: task.workstreamId,
      subsystemId: task.subsystemId,
      targetType: "milestone",
      targetId: task.targetMilestoneId,
    });
  }

  return links;
}

const DEFAULT_SEASON_PROJECTS: Array<{
  key: string;
  name: string;
  projectType: Project["projectType"];
}> = [
  { key: "robot", name: "Robot", projectType: "robot" },
  { key: "media", name: "Media", projectType: "other" },
  { key: "outreach", name: "Outreach", projectType: "outreach" },
  { key: "operations", name: "Operations", projectType: "operations" },
  { key: "strategy", name: "Strategy", projectType: "other" },
  { key: "training", name: "Training", projectType: "other" },
];

const TUTORIAL_SEASON_ID = "default-season";
const TUTORIAL_SEASON_NAME = "Tutorial Season";
const EXPECTED_TUTORIAL_PROJECT_NAMES = [
  "Tutorial Robot 2026",
  "Media",
  "Outreach",
  "Operations",
  "Strategy",
  "Training",
] as const;

const ROBOT_DEFAULT_MECHANISM_TEMPLATES: Array<{
  key: string;
  name: string;
  description: string;
}> = [
  {
    key: "left-front-module",
    name: "Left Front Module",
    description: "Swerve drive and steering assembly for the front-left corner.",
  },
  {
    key: "right-front-module",
    name: "Right Front Module",
    description: "Swerve drive and steering assembly for the front-right corner.",
  },
  {
    key: "left-back-module",
    name: "Left Back Module",
    description: "Swerve drive and steering assembly for the rear-left corner.",
  },
  {
    key: "right-back-module",
    name: "Right Back Module",
    description: "Swerve drive and steering assembly for the rear-right corner.",
  },
  {
    key: "chassis",
    name: "Chassis",
    description: "Primary frame rails and structural mounting interfaces.",
  },
];

function buildRobotProjectDefaults(
  projectId: string,
  subsystemIds: Set<string>,
  mechanismIds: Set<string>,
) {
  const subsystemId =
    uniqueId(toSlug(`${projectId}-drivetrain`) || "drivetrain", subsystemIds);
  subsystemIds.add(subsystemId);

  const subsystem: Subsystem = {
    id: subsystemId,
    projectId,
    name: "Drivetrain",
    description:
      "Core drivetrain with four swerve modules and chassis integration.",
    iteration: 1,
    isArchived: false,
    isCore: true,
    parentSubsystemId: null,
    responsibleEngineerId: null,
    mentorIds: [],
    risks: [],
  };

  const mechanisms: Mechanism[] = ROBOT_DEFAULT_MECHANISM_TEMPLATES.map(
    (template) => {
      const mechanismId =
        uniqueId(
          toSlug(`${projectId}-${template.key}`) || template.key,
          mechanismIds,
        );
      mechanismIds.add(mechanismId);

      return {
        id: mechanismId,
        subsystemId,
        name: template.name,
        description: template.description,
        iteration: 1,
        isArchived: false,
      };
    },
  );

  return {
    subsystems: [subsystem],
    mechanisms,
  };
}

function resolveTaskOwnershipForSubsystem(subsystemId: string) {
  const subsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === subsystemId,
  );
  if (!subsystem) {
    return null;
  }

  const projectId = currentSnapshot.projects.some(
    (project) => project.id === subsystem.projectId,
  )
    ? subsystem.projectId
    : currentSnapshot.projects[0]?.id;
  if (!projectId) {
    return null;
  }

  const matchingWorkstream = subsystem
    ? currentSnapshot.workstreams.find(
        (workstream) =>
          workstream.projectId === projectId &&
          workstream.name.toLowerCase() === subsystem.name.toLowerCase(),
      ) ?? null
    : null;

  return {
    projectId,
    workstreamId: matchingWorkstream?.id ?? null,
  };
}

function createMechanismWiringTask(mechanism: Mechanism): Task | null {
  const subsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === mechanism.subsystemId,
  );
  if (!subsystem) {
    return null;
  }

  const ownership = resolveTaskOwnershipForSubsystem(subsystem.id);
  if (!ownership) {
    return null;
  }

  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const task: Task = {
    id: uniqueId(toSlug(`Wire ${mechanism.name}`) || "wire-task", taskIds),
    createdAt: new Date().toISOString(),
    projectId: ownership.projectId,
    workstreamId: ownership.workstreamId,
    workstreamIds: uniqueIds([ownership.workstreamId]),
    title: `Wire ${mechanism.name}`,
    summary: `Complete wiring and harness verification for ${mechanism.name}.`,
    subsystemId: subsystem.id,
    subsystemIds: [subsystem.id],
    disciplineId: "electrical",
    mechanismId: mechanism.id,
    mechanismIds: [mechanism.id],
    partInstanceId: null,
    partInstanceIds: [],
    artifactId: null,
    artifactIds: [],
    targetMilestoneId: null,
    ownerId: subsystem.responsibleEngineerId,
    assigneeIds: uniqueIds([subsystem.responsibleEngineerId]),
    mentorId: subsystem.mentorIds[0] ?? null,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "medium",
    status: "not-started",
    estimatedHours: 4,
    actualHours: 0,
    blockers: [],
    dependencyIds: [],
    linkedManufacturingIds: [],
    linkedPurchaseIds: [],
    requiresDocumentation: true,
    documentationLinked: false,
  };

  return task;
}

function normalizeDisciplineIdForProject(projectId: string, disciplineId: string) {
  const project = currentSnapshot.projects.find((candidate) => candidate.id === projectId);
  return isTaskDisciplineAllowedForProject(project, disciplineId)
    ? disciplineId
    : getDefaultTaskDisciplineIdForProject(project);
}

function createSubsystemIntegrationTask(subsystem: Subsystem): Task | null {
  if (!subsystem.parentSubsystemId) {
    return null;
  }

  const parentSubsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === subsystem.parentSubsystemId,
  );
  if (!parentSubsystem) {
    return null;
  }

  const ownership = resolveTaskOwnershipForSubsystem(parentSubsystem.id);
  if (!ownership) {
    return null;
  }

  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const task: Task = {
    id: uniqueId(toSlug(`Integrate ${subsystem.name}`) || "integration-task", taskIds),
    createdAt: new Date().toISOString(),
    projectId: ownership.projectId,
    workstreamId: null,
    workstreamIds: [],
    title: `Integrate ${subsystem.name}`,
    summary: `Complete integration and interface verification for ${subsystem.name}.`,
    subsystemId: parentSubsystem.id,
    subsystemIds: [parentSubsystem.id],
    disciplineId: "testing",
    mechanismId: null,
    mechanismIds: [],
    partInstanceId: null,
    partInstanceIds: [],
    artifactId: null,
    artifactIds: [],
    targetMilestoneId: null,
    ownerId: parentSubsystem.responsibleEngineerId,
    assigneeIds: uniqueIds([parentSubsystem.responsibleEngineerId]),
    mentorId: parentSubsystem.mentorIds[0] ?? null,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "medium",
    status: "not-started",
    estimatedHours: 4,
    actualHours: 0,
    blockers: [],
    dependencyIds: [],
    linkedManufacturingIds: [],
    linkedPurchaseIds: [],
    requiresDocumentation: true,
    documentationLinked: false,
  };

  return task;
}

function nextWorkLogId() {
  const highestSequence = currentSnapshot.workLogs.reduce((max, workLog) => {
    const match = /^log-(\d+)$/.exec(workLog.id);
    if (!match) {
      return max;
    }

    return Math.max(max, Number(match[1]));
  }, 0);

  return `log-${highestSequence + 1}`;
}

export function getSnapshot() {
  return currentSnapshot;
}

export interface TutorialBaselineState {
  seasonId: string | null;
  seasonName: string | null;
  expectedProjectNames: string[];
  projectIdsByName: Record<string, string>;
  missingProjectNames: string[];
}

function buildTutorialBaselineState(snapshot: PlatformSnapshot): TutorialBaselineState {
  const tutorialSeason =
    snapshot.seasons.find((season) => season.id === TUTORIAL_SEASON_ID) ??
    snapshot.seasons.find((season) => season.name === TUTORIAL_SEASON_NAME) ??
    null;
  const tutorialSeasonId = tutorialSeason?.id ?? null;
  const tutorialSeasonName = tutorialSeason?.name ?? null;
  const seasonProjects =
    tutorialSeasonId === null
      ? []
      : snapshot.projects.filter((project) => project.seasonId === tutorialSeasonId);
  const projectIdsByName: Record<string, string> = {};

  for (const expectedProjectName of EXPECTED_TUTORIAL_PROJECT_NAMES) {
    const project = seasonProjects.find(
      (candidate) => candidate.name === expectedProjectName,
    );

    if (project) {
      projectIdsByName[expectedProjectName] = project.id;
    }
  }

  const missingProjectNames = EXPECTED_TUTORIAL_PROJECT_NAMES.filter(
    (name) => projectIdsByName[name] === undefined,
  );

  return {
    seasonId: tutorialSeasonId,
    seasonName: tutorialSeasonName,
    expectedProjectNames: [...EXPECTED_TUTORIAL_PROJECT_NAMES],
    projectIdsByName,
    missingProjectNames,
  };
}

export function getTutorialBaselineState() {
  return buildTutorialBaselineState(currentSnapshot);
}

export function resetStore() {
  currentSnapshot = cloneSnapshot(initialSnapshot);
  interactiveTutorialSnapshot = null;
}

export function resetTutorialBaseline() {
  const tutorialSnapshot = interactiveTutorialSnapshot;
  currentSnapshot = cloneSnapshot(initialSnapshot);
  interactiveTutorialSnapshot = tutorialSnapshot;
  return getTutorialBaselineState();
}

export function startInteractiveTutorialSession() {
  interactiveTutorialSnapshot = cloneSnapshot(currentSnapshot);
}

export function resetInteractiveTutorialSession() {
  if (!interactiveTutorialSnapshot) {
    return false;
  }

  currentSnapshot = cloneSnapshot(interactiveTutorialSnapshot);
  interactiveTutorialSnapshot = null;
  return true;
}

export function getSeasons() {
  return currentSnapshot.seasons;
}

export function createSeason(input: SeasonInput) {
  const seasonIds = new Set(currentSnapshot.seasons.map((season) => season.id));
  const seasonId = uniqueId(toSlug(input.name) || "season", seasonIds);
  const season: Season = {
    id: seasonId,
    name: input.name,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
  };

  const projectIds = new Set(currentSnapshot.projects.map((project) => project.id));
  const projects: Project[] = DEFAULT_SEASON_PROJECTS.map((template) => {
    const projectId = uniqueId(`${seasonId}-${template.key}`, projectIds);
    projectIds.add(projectId);

    return {
      id: projectId,
      seasonId: season.id,
      name: template.name,
      projectType: template.projectType,
      description: `${template.name} scope for ${season.name}.`,
      status: "active",
    };
  });

  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const mechanismIds = new Set(currentSnapshot.mechanisms.map((mechanism) => mechanism.id));
  const subsystems: Subsystem[] = [];
  const mechanisms: Mechanism[] = [];

  projects.forEach((project) => {
    if (project.projectType !== "robot") {
      return;
    }

    const defaults = buildRobotProjectDefaults(project.id, subsystemIds, mechanismIds);
    subsystems.push(...defaults.subsystems);
    mechanisms.push(...defaults.mechanisms);
  });

  currentSnapshot = {
    ...currentSnapshot,
    seasons: [...currentSnapshot.seasons, season],
    projects: [...currentSnapshot.projects, ...projects],
    subsystems: [...currentSnapshot.subsystems, ...subsystems],
    mechanisms: [...currentSnapshot.mechanisms, ...mechanisms],
  };

  return season;
}

export function getProjects() {
  return currentSnapshot.projects;
}

export function createProject(input: ProjectInput) {
  const projectIds = new Set(currentSnapshot.projects.map((project) => project.id));
  const season = currentSnapshot.seasons.find((candidate) => candidate.id === input.seasonId);
  const project: Project = {
    id: uniqueId(toSlug(`${input.seasonId}-${input.name}`) || "project", projectIds),
    seasonId: input.seasonId,
    name: input.name,
    projectType: input.projectType,
    description: input.description ?? `${input.name} scope${season ? ` for ${season.name}` : ""}.`,
    status: input.status ?? "active",
  };

  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const mechanismIds = new Set(currentSnapshot.mechanisms.map((mechanism) => mechanism.id));
  const defaults =
    project.projectType === "robot"
      ? buildRobotProjectDefaults(project.id, subsystemIds, mechanismIds)
      : { subsystems: [] as Subsystem[], mechanisms: [] as Mechanism[] };

  currentSnapshot = {
    ...currentSnapshot,
    projects: [...currentSnapshot.projects, project],
    subsystems: [...currentSnapshot.subsystems, ...defaults.subsystems],
    mechanisms: [...currentSnapshot.mechanisms, ...defaults.mechanisms],
  };

  return project;
}

export function updateProject(
  projectId: string,
  input: Partial<Pick<ProjectInput, "description" | "name" | "status">>,
) {
  let updatedProject: Project | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    projects: currentSnapshot.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      updatedProject = {
        ...project,
        ...input,
      };

      return updatedProject;
    }),
  };

  return updatedProject;
}

export function getWorkstreams() {
  return currentSnapshot.workstreams;
}

export function createWorkstream(input: WorkstreamInput) {
  const workstreamIds = new Set(
    currentSnapshot.workstreams.map((workstream) => workstream.id),
  );
  const workstream: Workstream = {
    id: uniqueId(toSlug(input.name) || "workstream", workstreamIds),
    projectId: input.projectId,
    name: input.name,
    color: normalizeWorkspaceColor(input.color),
    description: input.description,
    isArchived: input.isArchived ?? false,
  };

  currentSnapshot = {
    ...currentSnapshot,
    workstreams: [...currentSnapshot.workstreams, workstream],
  };

  return workstream;
}

export function updateWorkstream(workstreamId: string, input: Partial<WorkstreamInput>) {
  let updatedWorkstream: Workstream | null = null;
  const nextColor =
    input.color === undefined ? undefined : normalizeWorkspaceColor(input.color);

  currentSnapshot = {
    ...currentSnapshot,
    workstreams: currentSnapshot.workstreams.map((workstream) => {
      if (workstream.id !== workstreamId) {
        return workstream;
      }

      updatedWorkstream = {
        ...workstream,
        ...input,
        color: input.color === undefined ? workstream.color : nextColor,
      };

      return updatedWorkstream;
    }),
  };

  return updatedWorkstream;
}

export function getMembers() {
  return currentSnapshot.members;
}

export function getSubsystems() {
  return currentSnapshot.subsystems;
}

export function getDisciplines() {
  return currentSnapshot.disciplines;
}

export function getMechanisms() {
  return currentSnapshot.mechanisms;
}

export function getMaterials() {
  return currentSnapshot.materials;
}

export function getArtifacts() {
  return currentSnapshot.artifacts;
}

export function getPartDefinitions() {
  return currentSnapshot.partDefinitions;
}

export function getPartInstances() {
  return currentSnapshot.partInstances;
}

export function getTasks() {
  return currentSnapshot.tasks;
}

export function getMilestones() {
  return currentSnapshot.milestones;
}

export function getMilestoneRequirements() {
  return currentSnapshot.milestoneRequirements ?? [];
}

export function getTaskDependencies() {
  return currentSnapshot.taskDependencies;
}

export function getTaskBlockers() {
  return currentSnapshot.taskBlockers;
}

export function getQaReports() {
  return currentSnapshot.qaReports;
}

export function getTestResults() {
  return currentSnapshot.testResults;
}

export function getQaFindings() {
  return currentSnapshot.qaFindings;
}

export function getTestFindings() {
  return currentSnapshot.testFindings;
}

export function getDesignIterations(): DesignIteration[] {
  return currentSnapshot.designIterations;
}

function reportFromQaReport(report: QaReport): Report | null {
  const task = currentSnapshot.tasks.find((candidate) => candidate.id === report.taskId);
  if (!task) {
    return null;
  }

  return {
    id: report.id,
    reportType: "QA",
    projectId: task.projectId,
    taskId: report.taskId,
    milestoneId: null,
    workstreamId: task.workstreamId,
    createdByMemberId: null,
    result: report.result,
    summary: report.notes,
    notes: report.notes,
    photoUrl: report.photoUrl,
    createdAt: report.reviewedAt,
    participantIds: report.participantIds,
    mentorApproved: report.mentorApproved,
    reviewedAt: report.reviewedAt,
    title: task.title,
  };
}

function reportFromTestResult(result: TestResult): Report | null {
  const milestone = currentSnapshot.milestones.find((candidate) => candidate.id === result.milestoneId);
  const projectId = milestone?.projectIds[0] ?? currentSnapshot.projects[0]?.id ?? null;
  if (!projectId) {
    return null;
  }

  return {
    id: result.id,
    reportType: "MilestoneTest",
    projectId,
    taskId: null,
    milestoneId: result.milestoneId,
    workstreamId: null,
    createdByMemberId: null,
    result: result.status,
    summary: result.title,
    notes: result.findings.join("\n"),
    photoUrl: result.photoUrl,
    createdAt: milestone?.startDateTime.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    title: result.title,
    status: result.status,
    findings: result.findings,
  };
}

export function getReports(): Report[] {
  return [
    ...currentSnapshot.qaReports.map(reportFromQaReport),
    ...currentSnapshot.testResults.map(reportFromTestResult),
  ].filter((report): report is Report => report !== null);
}

function reportFindingFromQaFinding(finding: QaFinding): ReportFinding | null {
  if (!finding.qaReportId) {
    return null;
  }

  return {
    id: finding.id,
    reportId: finding.qaReportId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactInstanceId: finding.artifactId,
    issueType: finding.title,
    severity: finding.severity,
    notes: finding.detail,
    spawnedTaskId: finding.taskId,
    spawnedIterationId: null,
    spawnedRiskId: null,
    title: finding.title,
    detail: finding.detail,
    status: finding.status === "resolved" ? "resolved" : "open",
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    taskId: finding.taskId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

function reportFindingFromTestFinding(finding: TestFinding): ReportFinding | null {
  if (!finding.testResultId) {
    return null;
  }

  return {
    id: finding.id,
    reportId: finding.testResultId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactInstanceId: finding.artifactId,
    issueType: finding.title,
    severity: finding.severity,
    notes: finding.detail,
    spawnedTaskId: finding.taskId,
    spawnedIterationId: null,
    spawnedRiskId: null,
    title: finding.title,
    detail: finding.detail,
    status: finding.status === "resolved" ? "resolved" : "open",
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    taskId: finding.taskId,
    milestoneId: finding.milestoneId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  };
}

export function getReportFindings(): ReportFinding[] {
  return [
    ...currentSnapshot.qaFindings.map(reportFindingFromQaFinding),
    ...currentSnapshot.testFindings.map(reportFindingFromTestFinding),
  ].filter((finding): finding is ReportFinding => finding !== null);
}

export function getFindings(): FindingListItem[] {
  const qaItems: FindingListItem[] = currentSnapshot.qaFindings.map((finding) => ({
    id: finding.id,
    sourceType: "qa",
    sourceId: finding.qaReportId,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    status: finding.status,
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactId: finding.artifactId,
    taskId: finding.taskId,
    milestoneId: null,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  }));

  const testItems: FindingListItem[] = currentSnapshot.testFindings.map((finding) => ({
    id: finding.id,
    sourceType: "test",
    sourceId: finding.testResultId,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    status: finding.status,
    projectId: finding.projectId,
    workstreamId: finding.workstreamId,
    subsystemId: finding.subsystemId,
    mechanismId: finding.mechanismId,
    partInstanceId: finding.partInstanceId,
    artifactId: finding.artifactId,
    taskId: finding.taskId,
    milestoneId: finding.milestoneId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
  }));

  return [...qaItems, ...testItems];
}

export function getTaskTargets() {
  return currentSnapshot.tasks.flatMap((task) => flattenTaskTargets(task));
}

export function getMilestonesForTask(taskId: string): MilestoneMatch[] {
  const task = currentSnapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return [];
  }

  const taskTargets = flattenTaskTargets(task);
  const matchedMilestoneIds = new Map<string, Set<string>>();
  const hasLegacyMilestoneTarget = new Set(
    taskTargets
      .filter((target) => target.targetType === "milestone")
      .map((target) => target.targetId),
  );
  const requirements = getMilestoneRequirements();

  for (const target of taskTargets) {
    for (const requirement of requirements) {
      if (
        !matchesMilestoneRequirement({
          milestoneRequirement: requirement,
          targetType: target.targetType,
          targetId: target.targetId,
        })
      ) {
        continue;
      }

      const previous = matchedMilestoneIds.get(requirement.milestoneId) ?? new Set<string>();
      previous.add(requirement.id);
      matchedMilestoneIds.set(requirement.milestoneId, previous);
    }
  }

  for (const milestoneId of hasLegacyMilestoneTarget) {
    if (!matchedMilestoneIds.has(milestoneId)) {
      matchedMilestoneIds.set(milestoneId, new Set<string>());
    }
  }

  const milestoneOrder = new Map(
    currentSnapshot.milestones.map((milestone, index) => [milestone.id, index] as const),
  );

  return Array.from(matchedMilestoneIds.entries())
    .sort(([left], [right]) => {
      return (milestoneOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (milestoneOrder.get(right) ?? Number.MAX_SAFE_INTEGER);
    })
    .map(([milestoneId, requirementIds]) => ({
      milestoneId,
      matchedRequirementIds: Array.from(requirementIds),
      isLegacyLink: hasLegacyMilestoneTarget.has(milestoneId),
    }));
}

export function getTasksForMilestone(milestoneId: string): TaskMilestoneMatch[] {
  const requirements = getMilestoneRequirements().filter((requirement) => requirement.milestoneId === milestoneId);
  if (requirements.length === 0) {
    return currentSnapshot.tasks
      .filter((task) =>
        flattenTaskTargets(task).some(
          (target) => target.targetType === "milestone" && target.targetId === milestoneId,
        ),
      )
      .map((task) => ({
        taskId: task.id,
        matchedRequirementIds: [],
        isLegacyLink: true,
      }));
  }

  const matches = currentSnapshot.tasks
    .map((task) => {
      const taskTargets = flattenTaskTargets(task);
      const matchedRequirementIds = new Set<string>();
      let isLegacyLink = false;

      for (const target of taskTargets) {
        if (target.targetType === "milestone" && target.targetId === milestoneId) {
          isLegacyLink = true;
        }

        for (const requirement of requirements) {
          if (
            matchesMilestoneRequirement({
              milestoneRequirement: requirement,
              targetType: target.targetType,
              targetId: target.targetId,
            })
          ) {
            matchedRequirementIds.add(requirement.id);
          }
        }
      }

      if (matchedRequirementIds.size > 0 || isLegacyLink) {
        return {
          taskId: task.id,
          matchedRequirementIds: Array.from(matchedRequirementIds),
          isLegacyLink,
        };
      }

      return null;
    })
    .filter((match): match is TaskMilestoneMatch => match !== null);

  return matches;
}

export function getRisks() {
  return currentSnapshot.risks;
}

export function createRisk(input: RiskInput) {
  const riskIds = new Set(currentSnapshot.risks.map((risk) => risk.id));
  const risk: Risk = {
    id: uniqueId(toSlug(input.title) || "risk", riskIds),
    title: input.title,
    detail: input.detail,
    severity: input.severity,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    attachmentType: input.attachmentType,
    attachmentId: input.attachmentId,
    mitigationTaskId: input.mitigationTaskId,
  };

  currentSnapshot = {
    ...currentSnapshot,
    risks: [...currentSnapshot.risks, risk],
  };

  return risk;
}

export function updateRisk(riskId: string, input: Partial<RiskInput>) {
  let updatedRisk: Risk | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    risks: currentSnapshot.risks.map((risk) => {
      if (risk.id !== riskId) {
        return risk;
      }

      updatedRisk = {
        ...risk,
        ...input,
        mitigationTaskId:
          input.mitigationTaskId === undefined
            ? risk.mitigationTaskId
            : input.mitigationTaskId,
      };

      return updatedRisk;
    }),
  };

  return updatedRisk;
}

export function removeRisk(riskId: string) {
  const risk = currentSnapshot.risks.find((candidate) => candidate.id === riskId);
  if (!risk) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    risks: currentSnapshot.risks.filter((candidate) => candidate.id !== riskId),
  };

  return risk;
}

export function getPurchaseItems() {
  return currentSnapshot.purchaseItems;
}

export function getManufacturingItems() {
  return currentSnapshot.manufacturingItems;
}

export function createMaterial(input: MaterialInput) {
  const materialIds = new Set(currentSnapshot.materials.map((material) => material.id));
  const material: Material = {
    id: uniqueId(toSlug(input.name) || "material", materialIds),
    name: input.name,
    category: input.category,
    unit: input.unit,
    onHandQuantity: input.onHandQuantity,
    reorderPoint: input.reorderPoint,
    location: input.location,
    vendor: input.vendor,
    notes: input.notes,
  };

  currentSnapshot = {
    ...currentSnapshot,
    materials: [...currentSnapshot.materials, material],
  };

  return material;
}

export function updateMaterial(materialId: string, input: Partial<MaterialInput>) {
  let updatedMaterial: Material | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    materials: currentSnapshot.materials.map((material) => {
      if (material.id !== materialId) {
        return material;
      }

      updatedMaterial = {
        ...material,
        ...input,
      };

      return updatedMaterial;
    }),
  };

  return updatedMaterial;
}

export function removeMaterial(materialId: string) {
  const material = currentSnapshot.materials.find(
    (candidate) => candidate.id === materialId,
  );
  if (!material) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    materials: currentSnapshot.materials.filter(
      (candidate) => candidate.id !== materialId,
    ),
  };

  return material;
}

export function createArtifact(input: ArtifactInput) {
  const artifactIds = new Set(currentSnapshot.artifacts.map((artifact) => artifact.id));
  const artifact: Artifact = {
    id: uniqueId(toSlug(input.title) || "artifact", artifactIds),
    projectId: input.projectId,
    workstreamId: input.workstreamId,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    status: input.status,
    link: input.link,
    isArchived: input.isArchived ?? false,
    updatedAt: input.updatedAt,
  };

  currentSnapshot = {
    ...currentSnapshot,
    artifacts: [...currentSnapshot.artifacts, artifact],
  };

  return artifact;
}

export function updateArtifact(artifactId: string, input: Partial<ArtifactInput>) {
  let updatedArtifact: Artifact | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    artifacts: currentSnapshot.artifacts.map((artifact) => {
      if (artifact.id !== artifactId) {
        return artifact;
      }

      updatedArtifact = {
        ...artifact,
        ...input,
      };

      return updatedArtifact;
    }),
  };

  return updatedArtifact;
}

export function removeArtifact(artifactId: string) {
  const artifact = currentSnapshot.artifacts.find(
    (candidate) => candidate.id === artifactId,
  );
  if (!artifact) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    artifacts: currentSnapshot.artifacts.filter(
      (candidate) => candidate.id !== artifactId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.artifactId !== artifactId && !task.artifactIds.includes(artifactId)) {
        return task;
      }

      const artifactIds = task.artifactIds.filter(
        (candidateArtifactId) => candidateArtifactId !== artifactId,
      );
      return normalizeTaskTargets({
        ...task,
        artifactId: artifactIds[0] ?? null,
        artifactIds,
      });
    }),
    designIterations: currentSnapshot.designIterations.map((iteration) =>
      iteration.artifactId === artifactId
        ? {
            ...iteration,
            artifactId: null,
          }
        : iteration,
    ),
  };

  return artifact;
}

export function createSubsystem(input: SubsystemInput) {
  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const subsystem: Subsystem = {
    id: uniqueId(toSlug(input.name) || "subsystem", subsystemIds),
    projectId: input.projectId,
    name: input.name,
    serialAlias: normalizeSubsystemSerialAlias(input.serialAlias),
    color: normalizeWorkspaceColor(input.color),
    description: input.description,
    photoUrl: input.photoUrl ?? "",
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
    isCore: false,
    parentSubsystemId: input.parentSubsystemId,
    responsibleEngineerId: input.responsibleEngineerId,
    mentorIds: input.mentorIds,
    risks: input.risks,
  };

  const integrationTask = createSubsystemIntegrationTask(subsystem);

  currentSnapshot = normalizeSnapshotTaskSerials({
    ...currentSnapshot,
    subsystems: [...currentSnapshot.subsystems, subsystem],
    tasks: integrationTask ? [...currentSnapshot.tasks, integrationTask] : currentSnapshot.tasks,
  });

  return subsystem;
}

export function updateSubsystem(subsystemId: string, input: Partial<SubsystemInput>) {
  let updatedSubsystem: Subsystem | null = null;
  const currentSubsystem = currentSnapshot.subsystems.find(
    (subsystem) => subsystem.id === subsystemId,
  );
  if (!currentSubsystem) {
    return null;
  }

  const nextParentSubsystemId = currentSubsystem.isCore
    ? null
    : input.parentSubsystemId === undefined
      ? currentSubsystem.parentSubsystemId
      : input.parentSubsystemId;
  const nextColor =
    input.color === undefined ? currentSubsystem.color : normalizeWorkspaceColor(input.color);
  const nextSerialAlias =
    input.serialAlias === undefined
      ? currentSubsystem.serialAlias
      : normalizeSubsystemSerialAlias(input.serialAlias);

  currentSnapshot = {
    ...currentSnapshot,
    subsystems: currentSnapshot.subsystems.map((subsystem) => {
      if (subsystem.id !== subsystemId) {
        return subsystem;
      }

      updatedSubsystem = {
        ...subsystem,
        ...input,
        serialAlias: nextSerialAlias,
        color: nextColor,
        iteration:
          input.iteration === undefined
            ? subsystem.iteration
            : normalizeIteration(input.iteration),
        parentSubsystemId: nextParentSubsystemId,
      };

      return updatedSubsystem;
    }),
  };

  currentSnapshot = normalizeSnapshotTaskSerials(currentSnapshot);

  return updatedSubsystem;
}

export function removeSubsystem(subsystemId: string) {
  const subsystem = currentSnapshot.subsystems.find(
    (candidate) => candidate.id === subsystemId,
  );
  if (!subsystem) {
    return null;
  }

  const subsystemIdsToRemove = new Set([subsystemId]);
  let foundDescendant = true;
  while (foundDescendant) {
    foundDescendant = false;
    for (const candidate of currentSnapshot.subsystems) {
      if (
        candidate.parentSubsystemId &&
        subsystemIdsToRemove.has(candidate.parentSubsystemId) &&
        !subsystemIdsToRemove.has(candidate.id)
      ) {
        subsystemIdsToRemove.add(candidate.id);
        foundDescendant = true;
      }
    }
  }

  const mechanismIdsToRemove = new Set(
    currentSnapshot.mechanisms
      .filter((mechanism) => subsystemIdsToRemove.has(mechanism.subsystemId))
      .map((mechanism) => mechanism.id),
  );
  const partInstanceIdsToRemove = new Set(
    currentSnapshot.partInstances
      .filter(
        (partInstance) =>
          subsystemIdsToRemove.has(partInstance.subsystemId) ||
          mechanismIdsToRemove.has(partInstance.mechanismId ?? ""),
      )
      .map((partInstance) => partInstance.id),
  );
  const manufacturingItemIdsToRemove = new Set(
    currentSnapshot.manufacturingItems
      .filter((item) => subsystemIdsToRemove.has(item.subsystemId))
      .map((item) => item.id),
  );
  const purchaseItemIdsToRemove = new Set(
    currentSnapshot.purchaseItems
      .filter((item) => subsystemIdsToRemove.has(item.subsystemId))
      .map((item) => item.id),
  );
  const taskIdsToRemove = new Set(
    currentSnapshot.tasks
      .filter(
        (task) =>
          subsystemIdsToRemove.has(task.subsystemId) ||
          task.subsystemIds.some((candidate) => subsystemIdsToRemove.has(candidate)) ||
          mechanismIdsToRemove.has(task.mechanismId ?? "") ||
          task.mechanismIds.some((candidate) => mechanismIdsToRemove.has(candidate)) ||
          partInstanceIdsToRemove.has(task.partInstanceId ?? "") ||
          task.partInstanceIds.some((candidate) => partInstanceIdsToRemove.has(candidate)),
      )
      .map((task) => task.id),
  );

  currentSnapshot = {
    ...currentSnapshot,
    subsystems: currentSnapshot.subsystems.filter(
      (candidate) => !subsystemIdsToRemove.has(candidate.id),
    ),
    mechanisms: currentSnapshot.mechanisms.filter(
      (mechanism) => !mechanismIdsToRemove.has(mechanism.id),
    ),
    partInstances: currentSnapshot.partInstances.filter(
      (partInstance) => !partInstanceIdsToRemove.has(partInstance.id),
    ),
    tasks: currentSnapshot.tasks
      .filter((task) => !taskIdsToRemove.has(task.id))
      .map((task) => ({
        ...task,
        dependencyIds: task.dependencyIds.filter(
          (dependencyId) => !taskIdsToRemove.has(dependencyId),
        ),
        linkedManufacturingIds: task.linkedManufacturingIds.filter(
          (itemId) => !manufacturingItemIdsToRemove.has(itemId),
        ),
        linkedPurchaseIds: task.linkedPurchaseIds.filter(
          (itemId) => !purchaseItemIdsToRemove.has(itemId),
        ),
      })),
    workLogs: currentSnapshot.workLogs.filter(
      (workLog) => !taskIdsToRemove.has(workLog.taskId),
    ),
    milestones: currentSnapshot.milestones.map((milestone) => ({
      ...milestone,
      relatedSubsystemIds: milestone.relatedSubsystemIds.filter(
        (relatedSubsystemId) => !subsystemIdsToRemove.has(relatedSubsystemId),
      ),
    })),
    qaReports: currentSnapshot.qaReports.filter(
      (report) => !taskIdsToRemove.has(report.taskId),
    ),
    risks: currentSnapshot.risks.filter((risk) => {
      if (risk.mitigationTaskId && taskIdsToRemove.has(risk.mitigationTaskId)) {
        return false;
      }

      if (
        risk.attachmentType === "mechanism" &&
        mechanismIdsToRemove.has(risk.attachmentId)
      ) {
        return false;
      }

      if (
        risk.attachmentType === "part-instance" &&
        partInstanceIdsToRemove.has(risk.attachmentId)
      ) {
        return false;
      }

      return true;
    }),
    manufacturingItems: currentSnapshot.manufacturingItems.filter(
      (item) => !manufacturingItemIdsToRemove.has(item.id),
    ),
    purchaseItems: currentSnapshot.purchaseItems.filter(
      (item) => !purchaseItemIdsToRemove.has(item.id),
    ),
    qaReviews: currentSnapshot.qaReviews.filter((review) => {
      if (review.subjectType === "task" && taskIdsToRemove.has(review.subjectId)) {
        return false;
      }

      if (
        review.subjectType === "manufacturing" &&
        manufacturingItemIdsToRemove.has(review.subjectId)
      ) {
        return false;
      }

      return true;
    }),
  };

  return subsystem;
}

export function createPartDefinition(input: PartDefinitionInput) {
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId = input.seasonId ?? fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
  const partDefinitionIds = new Set(
    currentSnapshot.partDefinitions.map((partDefinition) => partDefinition.id),
  );
  const partNumber = resolvePartNumberForNewPartDefinition(
    input.partNumber,
    input.isHardware ?? false,
  );
  const partDefinition: PartDefinition = {
    id: uniqueId(toSlug(input.name) || "part-definition", partDefinitionIds),
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
    name: input.name,
    partNumber,
    isHardware: input.isHardware ?? false,
    revision: input.revision,
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
    type: input.type,
    source: input.source,
    materialId: input.materialId,
    description: input.description,
    photoUrl: input.photoUrl ?? "",
  };

  currentSnapshot = {
    ...currentSnapshot,
    partDefinitions: [...currentSnapshot.partDefinitions, partDefinition],
  };

  return partDefinition;
}

export function updatePartDefinition(
  partDefinitionId: string,
  input: Partial<PartDefinitionInput>,
) {
  let updatedPartDefinition: PartDefinition | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    partDefinitions: currentSnapshot.partDefinitions.map((partDefinition) => {
      if (partDefinition.id !== partDefinitionId) {
        return partDefinition;
      }

      const seasonId = input.seasonId ?? partDefinition.seasonId;
      const activeSeasonIds =
        input.activeSeasonIds === undefined
          ? uniqueIds([...(partDefinition.activeSeasonIds ?? []), seasonId])
          : uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
      updatedPartDefinition = {
        ...partDefinition,
        ...input,
        seasonId,
        activeSeasonIds,
        iteration:
          input.iteration === undefined
            ? partDefinition.iteration
            : normalizeIteration(input.iteration),
      };

      return updatedPartDefinition;
    }),
  };

  return updatedPartDefinition;
}

export function removePartDefinition(partDefinitionId: string) {
  const partDefinition = currentSnapshot.partDefinitions.find(
    (candidate) => candidate.id === partDefinitionId,
  );
  if (!partDefinition) {
    return null;
  }

  const removedPartInstanceIds = new Set(
    currentSnapshot.partInstances
      .filter((partInstance) => partInstance.partDefinitionId === partDefinitionId)
      .map((partInstance) => partInstance.id),
  );

  currentSnapshot = {
    ...currentSnapshot,
    partDefinitions: currentSnapshot.partDefinitions.filter(
      (candidate) => candidate.id !== partDefinitionId,
    ),
    partInstances: currentSnapshot.partInstances.filter(
      (partInstance) => partInstance.partDefinitionId !== partDefinitionId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      const partInstanceIds = task.partInstanceIds.filter(
        (partInstanceId) => !removedPartInstanceIds.has(partInstanceId),
      );
      if (
        partInstanceIds.length === task.partInstanceIds.length &&
        !removedPartInstanceIds.has(task.partInstanceId ?? "")
      ) {
        return task;
      }

      return normalizeTaskTargets({
        ...task,
        partInstanceId: partInstanceIds[0] ?? null,
        partInstanceIds,
      });
    }),
    manufacturingItems: currentSnapshot.manufacturingItems.map((item) =>
      item.partDefinitionId === partDefinitionId
        ? {
            ...item,
            partDefinitionId: null,
          }
        : item,
    ),
    purchaseItems: currentSnapshot.purchaseItems.map((item) =>
      item.partDefinitionId === partDefinitionId
        ? {
            ...item,
            partDefinitionId: null,
          }
        : item,
    ),
  };

  return partDefinition;
}

export function createMechanism(input: MechanismInput) {
  const mechanismIds = new Set(currentSnapshot.mechanisms.map((mechanism) => mechanism.id));
  const mechanism: Mechanism = {
    id: uniqueId(toSlug(input.name) || "mechanism", mechanismIds),
    subsystemId: input.subsystemId,
    name: input.name,
    description: input.description,
    photoUrl: input.photoUrl ?? "",
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
  };

  const wiringTask = createMechanismWiringTask(mechanism);

  currentSnapshot = normalizeSnapshotTaskSerials({
    ...currentSnapshot,
    mechanisms: [...currentSnapshot.mechanisms, mechanism],
    tasks: wiringTask ? [...currentSnapshot.tasks, wiringTask] : currentSnapshot.tasks,
  });

  return mechanism;
}

export function createPartInstance(input: PartInstanceInput) {
  const partInstanceIds = new Set(
    currentSnapshot.partInstances.map((partInstance) => partInstance.id),
  );
  const partInstance: PartInstance = {
    id: uniqueId(toSlug(input.name) || "part-instance", partInstanceIds),
    subsystemId: input.subsystemId,
    mechanismId: input.mechanismId,
    partDefinitionId: input.partDefinitionId,
    name: input.name,
    quantity: input.quantity,
    trackIndividually: input.trackIndividually,
    status: normalizePartInstanceStatus(input.status),
    photoUrl: input.photoUrl ?? "",
  };

  currentSnapshot = {
    ...currentSnapshot,
    partInstances: [...currentSnapshot.partInstances, partInstance],
  };

  return partInstance;
}

export function updatePartInstance(
  partInstanceId: string,
  input: Partial<PartInstanceInput>,
) {
  let updatedPartInstance: PartInstance | null = null;

  const currentPartInstance = currentSnapshot.partInstances.find(
    (partInstance) => partInstance.id === partInstanceId,
  );
  if (!currentPartInstance) {
    return null;
  }

  const nextMechanismId =
    input.mechanismId === undefined ? currentPartInstance.mechanismId : input.mechanismId;
  const nextSubsystemId =
    input.subsystemId ??
    (nextMechanismId
      ? findMechanism(nextMechanismId)?.subsystemId ?? currentPartInstance.subsystemId
      : currentPartInstance.subsystemId);

  currentSnapshot = {
    ...currentSnapshot,
    partInstances: currentSnapshot.partInstances.map((partInstance) => {
      if (partInstance.id !== partInstanceId) {
        return partInstance;
      }

      updatedPartInstance = {
        ...partInstance,
        ...input,
        subsystemId: nextSubsystemId,
        mechanismId: nextMechanismId,
        status:
          input.status === undefined
            ? partInstance.status
            : normalizePartInstanceStatus(input.status),
      };

      return updatedPartInstance;
    }),
  };

  return updatedPartInstance;
}

export function removePartInstance(partInstanceId: string) {
  const partInstance = currentSnapshot.partInstances.find(
    (candidate) => candidate.id === partInstanceId,
  );
  if (!partInstance) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    partInstances: currentSnapshot.partInstances.filter(
      (candidate) => candidate.id !== partInstanceId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      if (
        task.partInstanceId !== partInstanceId &&
        !task.partInstanceIds.includes(partInstanceId)
      ) {
        return task;
      }

      const partInstanceIds = task.partInstanceIds.filter(
        (candidate) => candidate !== partInstanceId,
      );
      return normalizeTaskTargets({
        ...task,
        partInstanceId: partInstanceIds[0] ?? null,
        partInstanceIds,
      });
    }),
  };

  return partInstance;
}

export function updateMechanism(mechanismId: string, input: Partial<MechanismInput>) {
  let updatedMechanism: Mechanism | null = null;

  const currentMechanism = currentSnapshot.mechanisms.find(
    (mechanism) => mechanism.id === mechanismId,
  );
  if (!currentMechanism) {
    return null;
  }

  const nextSubsystemId = input.subsystemId ?? currentMechanism.subsystemId;

  currentSnapshot = {
    ...currentSnapshot,
    mechanisms: currentSnapshot.mechanisms.map((mechanism) => {
      if (mechanism.id !== mechanismId) {
        return mechanism;
      }

      updatedMechanism = {
        ...mechanism,
        ...input,
        iteration:
          input.iteration === undefined
            ? mechanism.iteration
            : normalizeIteration(input.iteration),
      };

      return updatedMechanism;
    }),
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.mechanismId !== mechanismId && !task.mechanismIds.includes(mechanismId)) {
        return task;
      }

      return normalizeTaskTargets({
        ...task,
        subsystemId: nextSubsystemId,
        subsystemIds: uniqueIds([
          nextSubsystemId,
          ...task.subsystemIds.filter(
            (subsystemId) => subsystemId !== currentMechanism.subsystemId,
          ),
        ]),
      });
    }),
    partInstances: currentSnapshot.partInstances.map((partInstance) =>
      partInstance.mechanismId === mechanismId
        ? {
            ...partInstance,
            subsystemId: nextSubsystemId,
          }
        : partInstance,
    ),
  };

  return updatedMechanism;
}

export function removeMechanism(mechanismId: string) {
  const mechanism = currentSnapshot.mechanisms.find(
    (candidate) => candidate.id === mechanismId,
  );
  if (!mechanism) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    mechanisms: currentSnapshot.mechanisms.filter(
      (candidate) => candidate.id !== mechanismId,
    ),
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.mechanismId !== mechanismId && !task.mechanismIds.includes(mechanismId)) {
        return task;
      }

      const mechanismIds = task.mechanismIds.filter(
        (candidate) => candidate !== mechanismId,
      );
      return normalizeTaskTargets({
        ...task,
        mechanismId: mechanismIds[0] ?? null,
        mechanismIds,
      });
    }),
    partInstances: currentSnapshot.partInstances.map((partInstance) =>
      partInstance.mechanismId === mechanismId
        ? {
            ...partInstance,
            mechanismId: null,
          }
        : partInstance,
    ),
  };

  return mechanism;
}

export function createTask(input: TaskInput) {
  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const nextSerialNumber =
    currentSnapshot.tasks.reduce((max, task) => {
      if (task.subsystemId !== input.subsystemId) {
        return max;
      }

      const serialNumber = typeof task.serialNumber === "number" ? Math.trunc(task.serialNumber) : 0;
      return Number.isFinite(serialNumber) ? Math.max(max, serialNumber) : max;
    }, 0) + 1;
  const task: Task = {
    id: uniqueId(toSlug(input.title) || "task", taskIds),
    createdAt: new Date().toISOString(),
    serialNumber: nextSerialNumber,
    projectId: input.projectId,
    workstreamId: input.workstreamId,
    workstreamIds: input.workstreamIds,
    title: input.title,
    summary: input.summary,
    subsystemId: input.subsystemId,
    subsystemIds: input.subsystemIds,
    disciplineId: normalizeDisciplineIdForProject(input.projectId, input.disciplineId),
    mechanismId: input.mechanismId,
    mechanismIds: input.mechanismIds,
    partInstanceId: input.partInstanceId,
    partInstanceIds: input.partInstanceIds,
    artifactId: input.artifactId,
    artifactIds: input.artifactIds,
    targetMilestoneId: input.targetMilestoneId,
    photoUrl: input.photoUrl ?? "",
    ownerId: input.ownerId,
    assigneeIds: input.assigneeIds,
    mentorId: input.mentorId,
    startDate: input.startDate,
    dueDate: input.dueDate,
    priority: input.priority,
    status: input.status,
    blockers: input.blockers,
    dependencyIds: input.dependencyIds,
    linkedManufacturingIds: input.linkedManufacturingIds,
    linkedPurchaseIds: input.linkedPurchaseIds,
    estimatedHours: input.estimatedHours,
    actualHours: input.actualHours,
    requiresDocumentation: input.requiresDocumentation,
    documentationLinked: input.documentationLinked,
  };

  const normalizedTask = normalizeTaskTargets(task);

  currentSnapshot = normalizeSnapshotTaskSerials({
    ...currentSnapshot,
    tasks: [...currentSnapshot.tasks, normalizedTask],
  });

  return currentSnapshot.tasks.find((task) => task.id === normalizedTask.id) ?? normalizedTask;
}

function buildScopeRequirementsForMilestone(input: {
  milestoneId: string;
  projectIds: string[];
  relatedSubsystemIds: string[];
}) {
  const requirements: MilestoneRequirement[] = [];
  let sortOrder = 1;

  for (const projectId of uniqueIds(input.projectIds)) {
    requirements.push({
      id: `${input.milestoneId}:scope:project:${projectId}`,
      milestoneId: input.milestoneId,
      targetType: "project",
      targetId: projectId,
      conditionType: "custom",
      conditionValue: "in_scope",
      required: true,
      sortOrder: sortOrder++,
      notes: "",
    });
  }

  for (const subsystemId of uniqueIds(input.relatedSubsystemIds)) {
    requirements.push({
      id: `${input.milestoneId}:scope:subsystem:${subsystemId}`,
      milestoneId: input.milestoneId,
      targetType: "subsystem",
      targetId: subsystemId,
      conditionType: "custom",
      conditionValue: "in_scope",
      required: true,
      sortOrder: sortOrder++,
      notes: "",
    });
  }

  return requirements;
}

export function createMilestone(input: MilestoneInput) {
  const milestoneIds = new Set(currentSnapshot.milestones.map((milestone) => milestone.id));
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId =
    input.projectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((candidate): candidate is string => Boolean(candidate)) ??
    fallbackSeasonId;
  const milestone: Milestone = {
    id: uniqueId(toSlug(`${input.title} ${input.startDateTime.slice(0, 10)}`) || "milestone", milestoneIds),
    seasonId,
    title: input.title,
    type: input.type,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    isExternal: input.isExternal,
    description: input.description,
    projectIds: input.projectIds,
    relatedSubsystemIds: input.relatedSubsystemIds,
    status: normalizeMilestoneStatus(input.status),
    isBlocked: false,
    blockedReason: null,
    blockedByType: null,
    blockedById: null,
    photoUrl: input.photoUrl ?? "",
  };

  currentSnapshot = {
    ...currentSnapshot,
    milestones: [...currentSnapshot.milestones, milestone],
    milestoneRequirements: [
      ...(currentSnapshot.milestoneRequirements ?? []),
      ...buildScopeRequirementsForMilestone({
        milestoneId: milestone.id,
        projectIds: milestone.projectIds ?? [],
        relatedSubsystemIds: milestone.relatedSubsystemIds ?? [],
      }),
    ],
  };

  return milestone;
}

export function createQaReport(input: QaReportInput) {
  const reportIds = new Set(currentSnapshot.qaReports.map((report) => report.id));
  const report: QaReport = {
    id: uniqueId(toSlug(`${input.taskId} qa`) || "qa-report", reportIds),
    taskId: input.taskId,
    participantIds: input.participantIds,
    result: input.result,
    mentorApproved: input.mentorApproved,
    notes: input.notes,
    photoUrl: input.photoUrl ?? "",
    reviewedAt: input.reviewedAt,
  };

  currentSnapshot = {
    ...currentSnapshot,
    qaReports: [...currentSnapshot.qaReports, report],
  };

  return report;
}

export function createTestResult(input: TestResultInput) {
  const resultIds = new Set(currentSnapshot.testResults.map((result) => result.id));
  const testResult: TestResult = {
    id: uniqueId(toSlug(`${input.title} ${input.milestoneId}`) || "test-result", resultIds),
    milestoneId: input.milestoneId,
    title: input.title,
    status: input.status,
    findings: input.findings,
    photoUrl: input.photoUrl ?? "",
  };

  currentSnapshot = {
    ...currentSnapshot,
    testResults: [...currentSnapshot.testResults, testResult],
  };

  return testResult;
}

export function createReport(input: ReportInput) {
  if (input.reportType === "QA") {
    if (!input.taskId) {
      return null;
    }

    const report = createQaReport({
      taskId: input.taskId,
      participantIds: uniqueIds(input.participantIds ?? []),
      result:
        input.result === "minor-fix" || input.result === "iteration-worthy"
          ? input.result
          : "pass",
      mentorApproved: input.mentorApproved ?? false,
      notes: input.notes || input.summary,
      photoUrl: input.photoUrl,
      reviewedAt: input.reviewedAt ?? input.createdAt.slice(0, 10),
    });

    return reportFromQaReport(report);
  }

  if (!input.milestoneId) {
    return null;
  }

  const testResult = createTestResult({
    milestoneId: input.milestoneId,
    title: input.title ?? input.summary,
    status: input.status ?? (input.result === "fail" || input.result === "blocked" ? input.result : "pass"),
    findings: uniqueIds(input.findings ?? input.notes.split("\n")),
    photoUrl: input.photoUrl,
  });

  return reportFromTestResult(testResult);
}

export function createReportFinding(input: ReportFindingInput) {
  const report = getReports().find((candidate) => candidate.id === input.reportId);
  if (!report) {
    return null;
  }

  const now = new Date().toISOString();
  if (report.reportType === "QA") {
    const findingIds = new Set(currentSnapshot.qaFindings.map((finding) => finding.id));
    const finding: QaFinding = {
      id: uniqueId(toSlug(input.issueType) || "qa-finding", findingIds),
      qaReportId: input.reportId,
      taskId: input.spawnedTaskId ?? report.taskId,
      projectId: report.projectId,
      workstreamId: report.workstreamId,
      subsystemId: null,
      mechanismId: input.mechanismId,
      partInstanceId: input.partInstanceId,
      artifactId: input.artifactInstanceId,
      title: input.issueType,
      detail: input.notes,
      severity: input.severity,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    currentSnapshot = {
      ...currentSnapshot,
      qaFindings: [...currentSnapshot.qaFindings, finding],
    };

    return reportFindingFromQaFinding(finding);
  }

  const findingIds = new Set(currentSnapshot.testFindings.map((finding) => finding.id));
  const finding: TestFinding = {
    id: uniqueId(toSlug(input.issueType) || "test-finding", findingIds),
    testResultId: input.reportId,
    milestoneId: report.milestoneId,
    taskId: input.spawnedTaskId ?? report.taskId,
    projectId: report.projectId,
    workstreamId: report.workstreamId,
    subsystemId: null,
    mechanismId: input.mechanismId,
    partInstanceId: input.partInstanceId,
    artifactId: input.artifactInstanceId,
    title: input.issueType,
    detail: input.notes,
    severity: input.severity,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  currentSnapshot = {
    ...currentSnapshot,
    testFindings: [...currentSnapshot.testFindings, finding],
  };

  return reportFindingFromTestFinding(finding);
}

export function createTaskDependency(input: TaskDependencyInput) {
  const dependencyIds = new Set(currentSnapshot.taskDependencies.map((dependency) => dependency.id));
  const dependency: TaskDependency = {
    id: uniqueId(`${input.taskId}-dependency`, dependencyIds),
    taskId: input.taskId,
    kind: input.kind,
    refId: input.refId,
    requiredState: input.requiredState,
    dependencyType: input.dependencyType,
    createdAt: new Date().toISOString(),
  };

  currentSnapshot = {
    ...currentSnapshot,
    taskDependencies: [...currentSnapshot.taskDependencies, dependency],
    tasks: currentSnapshot.tasks.map((task) =>
      task.id === input.taskId && input.kind === "task" && input.dependencyType !== "soft"
        ? {
            ...task,
            dependencyIds: uniqueIds([...task.dependencyIds, input.refId]),
          }
        : task,
    ),
  };

  return dependency;
}

export function updateTaskDependency(
  dependencyId: string,
  input: Partial<TaskDependencyInput>,
) {
  const originalDependency = currentSnapshot.taskDependencies.find(
    (dependency) => dependency.id === dependencyId,
  );
  if (!originalDependency) {
    return null;
  }
  const savedDependency: TaskDependency = {
    ...originalDependency,
    ...input,
  };

  currentSnapshot = {
    ...currentSnapshot,
    taskDependencies: currentSnapshot.taskDependencies.map((dependency) =>
      dependency.id === dependencyId ? savedDependency : dependency,
    ),
  };

  currentSnapshot = {
    ...currentSnapshot,
    tasks: currentSnapshot.tasks.map((task) => {
      let dependencyIds = task.dependencyIds;
      if (
        task.id === originalDependency.taskId &&
        originalDependency.kind === "task" &&
        originalDependency.dependencyType !== "soft"
      ) {
        dependencyIds = dependencyIds.filter((dependencyId) => dependencyId !== originalDependency.refId);
      }

      return {
        ...task,
        dependencyIds:
          task.id === savedDependency.taskId &&
          savedDependency.kind === "task" &&
          savedDependency.dependencyType !== "soft"
            ? uniqueIds([...dependencyIds, savedDependency.refId])
            : dependencyIds,
      };
    }),
  };

  return savedDependency;
}

export function removeTaskDependency(dependencyId: string) {
  const dependency = currentSnapshot.taskDependencies.find(
    (candidate) => candidate.id === dependencyId,
  );
  if (!dependency) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    taskDependencies: currentSnapshot.taskDependencies.filter(
      (candidate) => candidate.id !== dependencyId,
    ),
    tasks: currentSnapshot.tasks.map((task) =>
      task.id === dependency.taskId && dependency.kind === "task" && dependency.dependencyType !== "soft"
        ? {
            ...task,
            dependencyIds: task.dependencyIds.filter(
              (candidate) => candidate !== dependency.refId,
            ),
          }
        : task,
    ),
  };

  return dependency;
}

export function createTaskBlocker(input: TaskBlockerInput) {
  const blockerIds = new Set(currentSnapshot.taskBlockers.map((blocker) => blocker.id));
  const blocker: TaskBlocker = {
    id: uniqueId(`${input.blockedTaskId}-blocker`, blockerIds),
    blockedTaskId: input.blockedTaskId,
    blockerType: input.blockerType,
    blockerId: input.blockerId,
    description: input.description,
    severity: input.severity,
    status: input.status ?? "open",
    createdByMemberId: input.createdByMemberId ?? null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  currentSnapshot = {
    ...currentSnapshot,
    taskBlockers: [...currentSnapshot.taskBlockers, blocker],
    tasks: currentSnapshot.tasks.map((task) =>
      task.id === input.blockedTaskId && blocker.status === "open"
        ? {
            ...task,
            blockers: uniqueIds([...task.blockers, input.description]),
          }
        : task,
    ),
  };

  return blocker;
}

export function updateTaskBlocker(blockerId: string, input: Partial<TaskBlockerInput>) {
  const originalBlocker = currentSnapshot.taskBlockers.find(
    (blocker) => blocker.id === blockerId,
  );
  if (!originalBlocker) {
    return null;
  }
  const savedBlocker: TaskBlocker = {
    ...originalBlocker,
    ...input,
    resolvedAt: input.status === "resolved" ? new Date().toISOString() : originalBlocker.resolvedAt,
  };

  currentSnapshot = {
    ...currentSnapshot,
    taskBlockers: currentSnapshot.taskBlockers.map((blocker) =>
      blocker.id === blockerId ? savedBlocker : blocker,
    ),
  };

  currentSnapshot = {
    ...currentSnapshot,
    tasks: currentSnapshot.tasks.map((task) => {
      const blockers = task.id === originalBlocker.blockedTaskId
        ? task.blockers.filter((description) => description !== originalBlocker.description)
        : task.blockers;

      return {
        ...task,
        blockers:
          task.id === savedBlocker.blockedTaskId && savedBlocker.status === "open"
            ? uniqueIds([...blockers, savedBlocker.description])
            : blockers,
      };
    }),
  };

  return savedBlocker;
}

export function removeTaskBlocker(blockerId: string) {
  const blocker = currentSnapshot.taskBlockers.find(
    (candidate) => candidate.id === blockerId,
  );
  if (!blocker) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    taskBlockers: currentSnapshot.taskBlockers.filter((candidate) => candidate.id !== blockerId),
    tasks: currentSnapshot.tasks.map((task) =>
      task.id === blocker.blockedTaskId
        ? {
            ...task,
            blockers: task.blockers.filter(
              (candidate) => candidate !== blocker.description,
            ),
          }
        : task,
    ),
  };

  return blocker;
}

export function updateMilestone(milestoneId: string, input: Partial<MilestoneInput>) {
  const currentMilestone = currentSnapshot.milestones.find((milestone) => milestone.id === milestoneId);
  if (!currentMilestone) {
    return null;
  }

  let updatedMilestone: Milestone | null = null;
  const desiredProjectIds = input.projectIds === undefined ? undefined : uniqueIds(input.projectIds);
  const desiredRelatedSubsystemIds =
    input.relatedSubsystemIds === undefined ? undefined : uniqueIds(input.relatedSubsystemIds);
  const nextProjectIds = desiredProjectIds ?? (currentMilestone.projectIds ?? []);
  const nextRelatedSubsystemIds =
    desiredRelatedSubsystemIds ?? (currentMilestone.relatedSubsystemIds ?? []);
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const nextSeasonId =
    nextProjectIds
      .map((projectId) => findProject(projectId)?.seasonId ?? null)
      .find((candidate): candidate is string => Boolean(candidate)) ??
    currentMilestone.seasonId ??
    fallbackSeasonId;

  updatedMilestone = {
    ...currentMilestone,
    ...input,
    seasonId: nextSeasonId,
    projectIds: nextProjectIds,
    relatedSubsystemIds: nextRelatedSubsystemIds,
    status:
      input.status === undefined
        ? currentMilestone.status
        : normalizeMilestoneStatus(input.status),
    photoUrl: input.photoUrl === undefined ? currentMilestone.photoUrl : input.photoUrl,
  };

  currentSnapshot = {
    ...currentSnapshot,
    milestones: currentSnapshot.milestones.map((milestone) =>
      milestone.id === milestoneId ? updatedMilestone! : milestone,
    ),
  };

  if (updatedMilestone) {
    const desiredScopeRequirementIds = new Set(
      buildScopeRequirementsForMilestone({
        milestoneId: updatedMilestone.id,
        projectIds: updatedMilestone.projectIds ?? [],
        relatedSubsystemIds: updatedMilestone.relatedSubsystemIds ?? [],
      }).map((req) => req.id),
    );

    const existing = currentSnapshot.milestoneRequirements ?? [];
    const retained = existing.filter((req) => {
      if (req.milestoneId !== updatedMilestone!.id) {
        return true;
      }

      // Keep non-scope requirements untouched. Scope requirements are synced to legacy fields.
      if (!req.id.startsWith(`${updatedMilestone!.id}:scope:`)) {
        return true;
      }

      return desiredScopeRequirementIds.has(req.id);
    });

    const retainedIds = new Set(retained.map((req) => req.id));
    const additions = buildScopeRequirementsForMilestone({
      milestoneId: updatedMilestone.id,
      projectIds: updatedMilestone.projectIds ?? [],
      relatedSubsystemIds: updatedMilestone.relatedSubsystemIds ?? [],
    }).filter((req) => !retainedIds.has(req.id));

    currentSnapshot = {
      ...currentSnapshot,
      milestoneRequirements: [...retained, ...additions],
    };
  }

  return updatedMilestone;
}

export function removeMilestone(milestoneId: string) {
  const milestone = currentSnapshot.milestones.find((candidate) => candidate.id === milestoneId);
  if (!milestone) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    milestones: currentSnapshot.milestones.filter((candidate) => candidate.id !== milestoneId),
    milestoneRequirements: (currentSnapshot.milestoneRequirements ?? []).filter(
      (requirement) => requirement.milestoneId !== milestoneId,
    ),
    testResults: currentSnapshot.testResults.filter((result) => result.milestoneId !== milestoneId),
    tasks: currentSnapshot.tasks.map((task) =>
      task.targetMilestoneId === milestoneId
        ? {
            ...task,
            targetMilestoneId: null,
          }
        : task,
    ),
  };

  return milestone;
}

export function createWorkLog(input: WorkLogInput) {
  const workLog: WorkLog = {
    id: nextWorkLogId(),
    taskId: input.taskId,
    date: input.date,
    hours: input.hours,
    participantIds: input.participantIds,
    notes: input.notes,
    photoUrl: input.photoUrl ?? "",
  };

  currentSnapshot = {
    ...currentSnapshot,
    workLogs: [...currentSnapshot.workLogs, workLog],
  };

  return workLog;
}

export function updateWorkLog(workLogId: string, input: Partial<WorkLogInput>) {
  let updatedWorkLog: WorkLog | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    workLogs: currentSnapshot.workLogs.map((workLog) => {
      if (workLog.id !== workLogId) {
        return workLog;
      }

      updatedWorkLog = {
        ...workLog,
        ...input,
      };

      return updatedWorkLog;
    }),
  };

  return updatedWorkLog;
}

export function removeWorkLog(workLogId: string) {
  const workLog = currentSnapshot.workLogs.find(
    (candidate) => candidate.id === workLogId,
  );
  if (!workLog) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    workLogs: currentSnapshot.workLogs.filter(
      (candidate) => candidate.id !== workLogId,
    ),
  };

  return workLog;
}

export function updateTask(taskId: string, input: Partial<TaskInput>): Task | null {
  const currentTask = currentSnapshot.tasks.find((task) => task.id === taskId);
  if (!currentTask) {
    return null;
  }

  const scalarTargetUpdates: Partial<TaskInput> = {};
  if (input.workstreamId !== undefined && input.workstreamIds === undefined) {
    scalarTargetUpdates.workstreamIds = uniqueIds([input.workstreamId]);
  }
  if (input.subsystemId !== undefined && input.subsystemIds === undefined) {
    scalarTargetUpdates.subsystemIds = uniqueIds([input.subsystemId]);
  }
  if (input.mechanismId !== undefined && input.mechanismIds === undefined) {
    scalarTargetUpdates.mechanismIds = uniqueIds([input.mechanismId]);
  }
  if (input.partInstanceId !== undefined && input.partInstanceIds === undefined) {
    scalarTargetUpdates.partInstanceIds = uniqueIds([input.partInstanceId]);
  }
  if (input.artifactId !== undefined && input.artifactIds === undefined) {
    scalarTargetUpdates.artifactIds = uniqueIds([input.artifactId]);
  }

  let updatedTask = normalizeTaskTargets({
    ...currentTask,
    ...input,
    ...(input.disciplineId !== undefined
      ? {
          disciplineId: normalizeDisciplineIdForProject(
            input.projectId ?? currentTask.projectId,
            input.disciplineId,
          ),
        }
      : {}),
    ...scalarTargetUpdates,
  });

  if (updatedTask.subsystemId !== currentTask.subsystemId) {
    updatedTask = {
      ...updatedTask,
      serialNumber: undefined,
      serial: undefined,
    };
  }

  currentSnapshot = {
    ...currentSnapshot,
    tasks: currentSnapshot.tasks.map((task) => (task.id === taskId ? updatedTask : task)),
  };

  currentSnapshot = normalizeSnapshotTaskSerials(currentSnapshot);

  return (
    currentSnapshot.tasks.find((task) => task.id === updatedTask.id) ?? updatedTask
  );
}

export function removeTask(taskId: string) {
  const task = currentSnapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    tasks: currentSnapshot.tasks
      .filter((candidate) => candidate.id !== taskId)
      .map((candidate) => ({
        ...candidate,
        dependencyIds: candidate.dependencyIds.filter(
          (dependencyId) => dependencyId !== taskId,
        ),
      })),
    workLogs: currentSnapshot.workLogs.filter((workLog) => workLog.taskId !== taskId),
    qaReports: currentSnapshot.qaReports.filter((report) => report.taskId !== taskId),
    taskDependencies: currentSnapshot.taskDependencies.filter(
      (dependency) => dependency.taskId !== taskId && dependency.refId !== taskId,
    ),
    taskBlockers: currentSnapshot.taskBlockers.filter(
      (blocker) => blocker.blockedTaskId !== taskId,
    ),
    qaReviews: currentSnapshot.qaReviews.filter(
      (review) => review.subjectType !== "task" || review.subjectId !== taskId,
    ),
    risks: currentSnapshot.risks.filter((risk) => risk.mitigationTaskId !== taskId),
  };

  currentSnapshot = normalizeSnapshotTaskSerials(currentSnapshot);

  return task;
}

export function createPurchaseItem(input: PurchaseItemInput) {
  const itemIds = new Set(currentSnapshot.purchaseItems.map((item) => item.id));
  const item: PurchaseItem = {
    id: uniqueId(toSlug(input.title) || "purchase-item", itemIds),
    title: input.title,
    subsystemId: input.subsystemId,
    requestedById: input.requestedById,
    partDefinitionId: input.partDefinitionId,
    quantity: input.quantity,
    vendor: input.vendor,
    linkLabel: input.linkLabel,
    estimatedCost: input.estimatedCost,
    finalCost: input.finalCost,
    approvedByMentor: input.approvedByMentor,
    status: input.status,
  };

  currentSnapshot = {
    ...currentSnapshot,
    purchaseItems: [...currentSnapshot.purchaseItems, item],
  };

  return item;
}

export function updatePurchaseItem(
  itemId: string,
  input: Partial<PurchaseItemInput>,
) {
  let updatedItem: PurchaseItem | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    purchaseItems: currentSnapshot.purchaseItems.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      updatedItem = {
        ...item,
        ...input,
      };

      return updatedItem;
    }),
  };

  return updatedItem;
}

export function removePurchaseItem(itemId: string) {
  const item = currentSnapshot.purchaseItems.find(
    (candidate) => candidate.id === itemId,
  );
  if (!item) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    purchaseItems: currentSnapshot.purchaseItems.filter(
      (candidate) => candidate.id !== itemId,
    ),
    tasks: currentSnapshot.tasks.map((task) => ({
      ...task,
      linkedPurchaseIds: task.linkedPurchaseIds.filter(
        (linkedItemId) => linkedItemId !== itemId,
      ),
    })),
  };

  return item;
}

export function createManufacturingItem(input: ManufacturingItemInput) {
  const itemIds = new Set(currentSnapshot.manufacturingItems.map((item) => item.id));
  const partInstanceIds = uniqueIds([
    ...(input.partInstanceIds ?? []),
    input.partInstanceId,
  ]);
  const item: ManufacturingItem = {
    id: uniqueId(toSlug(input.title) || "manufacturing-item", itemIds),
    title: input.title,
    subsystemId: input.subsystemId,
    requestedById: input.requestedById,
    process: input.process,
    dueDate: input.dueDate,
    material: input.material,
    materialId: input.materialId ?? null,
    partDefinitionId: input.partDefinitionId,
    partInstanceId: partInstanceIds[0] ?? null,
    partInstanceIds,
    quantity: input.quantity,
    status: input.status,
    mentorReviewed: input.mentorReviewed,
    inHouse: input.process === "cnc" ? input.inHouse ?? true : true,
    batchLabel: input.batchLabel,
  };

  currentSnapshot = {
    ...currentSnapshot,
    manufacturingItems: [...currentSnapshot.manufacturingItems, item],
  };

  return item;
}

export function updateManufacturingItem(
  itemId: string,
  input: Partial<ManufacturingItemInput>,
) {
  let updatedItem: ManufacturingItem | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    manufacturingItems: currentSnapshot.manufacturingItems.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      const receivedPartInstanceUpdate =
        input.partInstanceIds !== undefined || input.partInstanceId !== undefined;
      const partInstanceIds = receivedPartInstanceUpdate
        ? uniqueIds([...(input.partInstanceIds ?? []), input.partInstanceId])
        : item.partInstanceIds ?? uniqueIds([item.partInstanceId]);

      updatedItem = {
        ...item,
        ...input,
        partInstanceId: partInstanceIds[0] ?? null,
        partInstanceIds,
        inHouse:
          (input.process ?? item.process) === "cnc"
            ? input.inHouse ?? item.inHouse ?? true
            : true,
      };

      return updatedItem;
    }),
  };

  return updatedItem;
}

export function removeManufacturingItem(itemId: string) {
  const item = currentSnapshot.manufacturingItems.find(
    (candidate) => candidate.id === itemId,
  );
  if (!item) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    manufacturingItems: currentSnapshot.manufacturingItems.filter(
      (candidate) => candidate.id !== itemId,
    ),
    tasks: currentSnapshot.tasks.map((task) => ({
      ...task,
      linkedManufacturingIds: task.linkedManufacturingIds.filter(
        (linkedItemId) => linkedItemId !== itemId,
      ),
    })),
    qaReviews: currentSnapshot.qaReviews.filter(
      (review) =>
        review.subjectType !== "manufacturing" || review.subjectId !== itemId,
    ),
  };

  return item;
}

export function createMember(input: MemberInput) {
  const memberIds = new Set(currentSnapshot.members.map((member) => member.id));
  const fallbackSeasonId = currentSnapshot.seasons[0]?.id ?? "default-season";
  const seasonId = input.seasonId ?? fallbackSeasonId;
  const activeSeasonIds = uniqueIds([...(input.activeSeasonIds ?? []), seasonId]);
  const disciplineId = input.disciplineId === undefined ? undefined : input.disciplineId;
  const member: Member = {
    id: uniqueId(toSlug(input.name) || "member", memberIds),
    name: input.name,
    email: (input.email ?? "").trim(),
    photoUrl: (input.photoUrl ?? "").trim(),
    role: input.role,
    elevated: isElevatedMemberRole(input.role),
    ...(disciplineId !== undefined ? { disciplineId } : null),
    seasonId,
    activeSeasonIds: activeSeasonIds.length > 0 ? activeSeasonIds : [seasonId],
  };

  currentSnapshot = {
    ...currentSnapshot,
    members: [...currentSnapshot.members, member],
  };

  return member;
}

export function updateMember(memberId: string, input: Partial<MemberInput>) {
  let updatedMember: Member | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    members: currentSnapshot.members.map((member) => {
      if (member.id !== memberId) {
        return member;
      }

      const nextRole = input.role ?? member.role;
      const nextEmail = input.email === undefined ? member.email : input.email.trim();
      const nextPhotoUrl =
        input.photoUrl === undefined ? member.photoUrl : input.photoUrl.trim();
      const nextSeasonId = input.seasonId ?? member.seasonId;
      const nextActiveSeasonIds = uniqueIds([
        ...(input.activeSeasonIds ?? member.activeSeasonIds ?? [member.seasonId]),
        nextSeasonId,
      ]);
      updatedMember = {
        ...member,
        ...input,
        role: nextRole,
        email: nextEmail,
        photoUrl: nextPhotoUrl,
        seasonId: nextSeasonId,
        activeSeasonIds:
          nextActiveSeasonIds.length > 0 ? nextActiveSeasonIds : [nextSeasonId],
        elevated: isElevatedMemberRole(nextRole),
      };

      return updatedMember;
    }),
  };

  return updatedMember;
}

export function removeMember(memberId: string) {
  const member = currentSnapshot.members.find((candidate) => candidate.id === memberId);
  if (!member) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    members: currentSnapshot.members.filter((candidate) => candidate.id !== memberId),
    subsystems: currentSnapshot.subsystems.map((subsystem) => ({
      ...subsystem,
      responsibleEngineerId:
        subsystem.responsibleEngineerId === memberId
          ? null
          : subsystem.responsibleEngineerId,
      mentorIds: subsystem.mentorIds.filter((mentorId) => mentorId !== memberId),
    })),
    tasks: currentSnapshot.tasks.map((task) => ({
      ...task,
      ownerId: task.ownerId === memberId ? null : task.ownerId,
      assigneeIds: (task.assigneeIds ?? []).filter(
        (assigneeId) => assigneeId !== memberId,
      ),
      mentorId: task.mentorId === memberId ? null : task.mentorId,
    })),
    workLogs: currentSnapshot.workLogs.map((workLog) => ({
      ...workLog,
      participantIds: workLog.participantIds.filter(
        (participantId) => participantId !== memberId,
      ),
    })),
    attendanceRecords: currentSnapshot.attendanceRecords.filter(
      (record) => record.memberId !== memberId,
    ),
    manufacturingItems: currentSnapshot.manufacturingItems.map((item) => ({
      ...item,
      requestedById: item.requestedById === memberId ? null : item.requestedById,
    })),
    purchaseItems: currentSnapshot.purchaseItems.map((item) => ({
      ...item,
      requestedById: item.requestedById === memberId ? null : item.requestedById,
    })),
    qaReviews: currentSnapshot.qaReviews.map((review) => ({
      ...review,
      participantIds: review.participantIds.filter(
        (participantId) => participantId !== memberId,
      ),
    })),
  };

  return member;
}

export function findSubsystem(subsystemId: string): Subsystem | undefined {
  return currentSnapshot.subsystems.find((subsystem) => subsystem.id === subsystemId);
}

export function findMilestone(milestoneId: string): Milestone | undefined {
  return currentSnapshot.milestones.find((milestone) => milestone.id === milestoneId);
}

export function findDiscipline(disciplineId: string): Discipline | undefined {
  return currentSnapshot.disciplines.find((discipline) => discipline.id === disciplineId);
}

export function findMechanism(mechanismId: string): Mechanism | undefined {
  return currentSnapshot.mechanisms.find((mechanism) => mechanism.id === mechanismId);
}

export function findProject(projectId: string): Project | undefined {
  return currentSnapshot.projects.find((project) => project.id === projectId);
}

export function findWorkstream(workstreamId: string): Workstream | undefined {
  return currentSnapshot.workstreams.find((workstream) => workstream.id === workstreamId);
}

export function findPartDefinition(partDefinitionId: string): PartDefinition | undefined {
  return currentSnapshot.partDefinitions.find((partDefinition) => partDefinition.id === partDefinitionId);
}

export function findPartInstance(partInstanceId: string): PartInstance | undefined {
  return currentSnapshot.partInstances.find((partInstance) => partInstance.id === partInstanceId);
}

export function findMaterial(materialId: string): Material | undefined {
  return currentSnapshot.materials.find((material) => material.id === materialId);
}

export function findArtifact(artifactId: string): Artifact | undefined {
  return currentSnapshot.artifacts.find((artifact) => artifact.id === artifactId);
}

export function findRisk(riskId: string): Risk | undefined {
  return currentSnapshot.risks.find((risk) => risk.id === riskId);
}
