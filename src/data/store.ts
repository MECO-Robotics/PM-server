import { snapshot as initialSnapshot } from "./mockData";
import type {
  Artifact,
  Discipline,
  Event,
  ManufacturingItem,
  Material,
  Mechanism,
  Member,
  PartDefinition,
  PartInstance,
  PlatformSnapshot,
  Project,
  PurchaseItem,
  Season,
  Subsystem,
  Task,
  Workstream,
  WorkLog,
} from "../domain/types";
import type {
  ArtifactInput,
  EventInput,
  ManufacturingItemInput,
  MaterialInput,
  MechanismInput,
  MemberInput,
  PartDefinitionInput,
  PartInstanceInput,
  ProjectInput,
  PurchaseItemInput,
  SeasonInput,
  SubsystemInput,
  TaskInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

export type {
  ArtifactInput,
  EventInput,
  ManufacturingItemInput,
  MaterialInput,
  MechanismInput,
  MemberInput,
  PartDefinitionInput,
  PartInstanceInput,
  ProjectInput,
  PurchaseItemInput,
  SeasonInput,
  SubsystemInput,
  TaskInput,
  WorkLogInput,
  WorkstreamInput,
} from "./storeTypes";

function cloneSnapshot(snapshot: PlatformSnapshot): PlatformSnapshot {
  return structuredClone(snapshot);
}

let currentSnapshot = cloneSnapshot(initialSnapshot);

function isElevatedMemberRole(role: Member["role"]): boolean {
  return role === "lead" || role === "admin";
}

function normalizeIteration(iteration: number | undefined) {
  return Number.isFinite(iteration) && iteration && iteration >= 1
    ? Math.trunc(iteration)
    : 1;
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
    assigneeIds,
  };
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
    targetEventId: null,
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
    projectId: ownership.projectId,
    workstreamId: null,
    workstreamIds: [],
    title: `Integrate ${subsystem.name}`,
    summary: `Complete integration and interface verification for ${subsystem.name}.`,
    subsystemId: parentSubsystem.id,
    subsystemIds: [parentSubsystem.id],
    disciplineId: "integration",
    mechanismId: null,
    mechanismIds: [],
    partInstanceId: null,
    partInstanceIds: [],
    targetEventId: null,
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

export function resetStore() {
  currentSnapshot = cloneSnapshot(initialSnapshot);
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

  currentSnapshot = {
    ...currentSnapshot,
    workstreams: currentSnapshot.workstreams.map((workstream) => {
      if (workstream.id !== workstreamId) {
        return workstream;
      }

      updatedWorkstream = {
        ...workstream,
        ...input,
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

export function getEvents() {
  return currentSnapshot.events;
}

export function getQaReports() {
  return currentSnapshot.qaReports;
}

export function getTestResults() {
  return currentSnapshot.testResults;
}

export function getRisks() {
  return currentSnapshot.risks;
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
  };

  return artifact;
}

export function createSubsystem(input: SubsystemInput) {
  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const subsystem: Subsystem = {
    id: uniqueId(toSlug(input.name) || "subsystem", subsystemIds),
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
    isCore: false,
    parentSubsystemId: input.parentSubsystemId,
    responsibleEngineerId: input.responsibleEngineerId,
    mentorIds: input.mentorIds,
    risks: input.risks,
  };

  const integrationTask = createSubsystemIntegrationTask(subsystem);

  currentSnapshot = {
    ...currentSnapshot,
    subsystems: [...currentSnapshot.subsystems, subsystem],
    tasks: integrationTask ? [...currentSnapshot.tasks, integrationTask] : currentSnapshot.tasks,
  };

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

  currentSnapshot = {
    ...currentSnapshot,
    subsystems: currentSnapshot.subsystems.map((subsystem) => {
      if (subsystem.id !== subsystemId) {
        return subsystem;
      }

      updatedSubsystem = {
        ...subsystem,
        ...input,
        iteration:
          input.iteration === undefined
            ? subsystem.iteration
            : normalizeIteration(input.iteration),
        parentSubsystemId: nextParentSubsystemId,
      };

      return updatedSubsystem;
    }),
  };

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
    events: currentSnapshot.events.map((event) => ({
      ...event,
      relatedSubsystemIds: event.relatedSubsystemIds.filter(
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
  const partDefinitionIds = new Set(
    currentSnapshot.partDefinitions.map((partDefinition) => partDefinition.id),
  );
  const partDefinition: PartDefinition = {
    id: uniqueId(toSlug(input.name) || "part-definition", partDefinitionIds),
    name: input.name,
    partNumber: input.partNumber,
    revision: input.revision,
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
    type: input.type,
    source: input.source,
    materialId: input.materialId,
    description: input.description,
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

      updatedPartDefinition = {
        ...partDefinition,
        ...input,
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
    iteration: normalizeIteration(input.iteration),
    isArchived: input.isArchived ?? false,
  };

  const wiringTask = createMechanismWiringTask(mechanism);

  currentSnapshot = {
    ...currentSnapshot,
    mechanisms: [...currentSnapshot.mechanisms, mechanism],
    tasks: wiringTask ? [...currentSnapshot.tasks, wiringTask] : currentSnapshot.tasks,
  };

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
    status: input.status,
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
  const task: Task = {
    id: uniqueId(toSlug(input.title) || "task", taskIds),
    projectId: input.projectId,
    workstreamId: input.workstreamId,
    workstreamIds: input.workstreamIds,
    title: input.title,
    summary: input.summary,
    subsystemId: input.subsystemId,
    subsystemIds: input.subsystemIds,
    disciplineId: input.disciplineId,
    mechanismId: input.mechanismId,
    mechanismIds: input.mechanismIds,
    partInstanceId: input.partInstanceId,
    partInstanceIds: input.partInstanceIds,
    targetEventId: input.targetEventId,
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

  currentSnapshot = {
    ...currentSnapshot,
    tasks: [...currentSnapshot.tasks, normalizedTask],
  };

  return normalizedTask;
}

export function createEvent(input: EventInput) {
  const eventIds = new Set(currentSnapshot.events.map((event) => event.id));
  const event: Event = {
    id: uniqueId(toSlug(`${input.title} ${input.startDateTime.slice(0, 10)}`) || "event", eventIds),
    title: input.title,
    type: input.type,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    isExternal: input.isExternal,
    description: input.description,
    projectIds: input.projectIds,
    relatedSubsystemIds: input.relatedSubsystemIds,
  };

  currentSnapshot = {
    ...currentSnapshot,
    events: [...currentSnapshot.events, event],
  };

  return event;
}

export function updateEvent(eventId: string, input: Partial<EventInput>) {
  let updatedEvent: Event | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    events: currentSnapshot.events.map((event) => {
      if (event.id !== eventId) {
        return event;
      }

      updatedEvent = {
        ...event,
        ...input,
      };

      return updatedEvent;
    }),
  };

  return updatedEvent;
}

export function removeEvent(eventId: string) {
  const event = currentSnapshot.events.find((candidate) => candidate.id === eventId);
  if (!event) {
    return null;
  }

  currentSnapshot = {
    ...currentSnapshot,
    events: currentSnapshot.events.filter((candidate) => candidate.id !== eventId),
    tasks: currentSnapshot.tasks.map((task) =>
      task.targetEventId === eventId
        ? {
            ...task,
            targetEventId: null,
          }
        : task,
    ),
  };

  return event;
}

export function createWorkLog(input: WorkLogInput) {
  const workLog: WorkLog = {
    id: nextWorkLogId(),
    taskId: input.taskId,
    date: input.date,
    hours: input.hours,
    participantIds: input.participantIds,
    notes: input.notes,
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

export function updateTask(taskId: string, input: Partial<TaskInput>) {
  let updatedTask: Task | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
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

      updatedTask = normalizeTaskTargets({
        ...task,
        ...input,
        ...scalarTargetUpdates,
      });

      return updatedTask;
    }),
  };

  return updatedTask;
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
    qaReviews: currentSnapshot.qaReviews.filter(
      (review) => review.subjectType !== "task" || review.subjectId !== taskId,
    ),
    risks: currentSnapshot.risks.filter((risk) => risk.mitigationTaskId !== taskId),
  };

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
  const member: Member = {
    id: uniqueId(toSlug(input.name) || "member", memberIds),
    name: input.name,
    email: (input.email ?? "").trim(),
    role: input.role,
    elevated: isElevatedMemberRole(input.role),
    seasonId: input.seasonId ?? fallbackSeasonId,
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
      updatedMember = {
        ...member,
        ...input,
        role: nextRole,
        email: nextEmail,
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

export function findEvent(eventId: string): Event | undefined {
  return currentSnapshot.events.find((event) => event.id === eventId);
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
