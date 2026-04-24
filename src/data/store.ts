import { snapshot as initialSnapshot } from "./mockData";
import type {
  Artifact,
  ArtifactKind,
  ArtifactStatus,
  Discipline,
  Event,
  ManufacturingItem,
  ManufacturingProcess,
  ManufacturingStatus,
  Material,
  MaterialCategory,
  Mechanism,
  Member,
  PartDefinition,
  PartInstance,
  PlatformSnapshot,
  Project,
  PurchaseItem,
  PurchaseStatus,
  Season,
  Subsystem,
  Task,
  TaskPriority,
  TaskStatus,
  Workstream,
  WorkLog,
} from "../domain/types";

function cloneSnapshot(snapshot: PlatformSnapshot): PlatformSnapshot {
  return structuredClone(snapshot);
}

let currentSnapshot = cloneSnapshot(initialSnapshot);

export interface TaskInput {
  projectId: string;
  workstreamId: string | null;
  title: string;
  summary: string;
  subsystemId: string;
  disciplineId: string;
  mechanismId: string | null;
  partInstanceId: string | null;
  targetEventId: string | null;
  ownerId: string | null;
  mentorId: string | null;
  startDate: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedHours: number;
  actualHours: number;
  blockers: string[];
  dependencyIds: string[];
  linkedManufacturingIds: string[];
  linkedPurchaseIds: string[];
  requiresDocumentation: boolean;
  documentationLinked: boolean;
}

export interface WorkLogInput {
  taskId: string;
  date: string;
  hours: number;
  participantIds: string[];
  notes: string;
}

export interface MemberInput {
  name: string;
  role: Member["role"];
  seasonId: string;
}

export interface SeasonInput {
  name: string;
  type: Season["type"];
  startDate: string;
  endDate: string;
}

export interface PurchaseItemInput {
  title: string;
  subsystemId: string;
  requestedById: string | null;
  partDefinitionId: string | null;
  quantity: number;
  vendor: string;
  linkLabel: string;
  estimatedCost: number;
  finalCost?: number;
  approvedByMentor: boolean;
  status: PurchaseStatus;
}

export interface ManufacturingItemInput {
  title: string;
  subsystemId: string;
  requestedById: string | null;
  process: ManufacturingProcess;
  dueDate: string;
  material: string;
  partDefinitionId: string | null;
  quantity: number;
  status: ManufacturingStatus;
  mentorReviewed: boolean;
  batchLabel?: string;
}

export interface MaterialInput {
  name: string;
  category: MaterialCategory;
  unit: string;
  onHandQuantity: number;
  reorderPoint: number;
  location: string;
  vendor: string;
  notes: string;
}

export interface ArtifactInput {
  projectId: string;
  workstreamId: string | null;
  kind: ArtifactKind;
  title: string;
  summary: string;
  status: ArtifactStatus;
  link: string;
  updatedAt: string;
}

export interface SubsystemInput {
  projectId: string;
  name: string;
  description: string;
  parentSubsystemId: string | null;
  responsibleEngineerId: string | null;
  mentorIds: string[];
  risks: string[];
}

export interface MechanismInput {
  subsystemId: string;
  name: string;
  description: string;
}

export interface PartDefinitionInput {
  name: string;
  partNumber: string;
  revision: string;
  type: string;
  source: string;
  materialId: string | null;
  description: string;
}

export interface PartInstanceInput {
  subsystemId: string;
  mechanismId: string | null;
  partDefinitionId: string;
  name: string;
  quantity: number;
  trackIndividually: boolean;
  status: PartInstance["status"];
}

export interface EventInput {
  title: string;
  type: Event["type"];
  startDateTime: string;
  endDateTime: string | null;
  isExternal: boolean;
  description: string;
  relatedSubsystemIds: string[];
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

const DEFAULT_SEASON_PROJECTS: Array<{
  key: string;
  name: string;
  projectType: Project["projectType"];
}> = [
  { key: "robot", name: "Robot", projectType: "robot" },
  { key: "business", name: "Business", projectType: "other" },
  { key: "outreach", name: "Outreach", projectType: "outreach" },
  { key: "media", name: "Media", projectType: "other" },
  { key: "training", name: "Training", projectType: "other" },
  { key: "operations", name: "Operations", projectType: "operations" },
];

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
    title: `Wire ${mechanism.name}`,
    summary: `Complete wiring and harness verification for ${mechanism.name}.`,
    subsystemId: subsystem.id,
    disciplineId: "electrical",
    mechanismId: mechanism.id,
    partInstanceId: null,
    targetEventId: null,
    ownerId: subsystem.responsibleEngineerId,
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
    title: `Integrate ${subsystem.name}`,
    summary: `Complete integration and interface verification for ${subsystem.name}.`,
    subsystemId: parentSubsystem.id,
    disciplineId: "integration",
    mechanismId: null,
    partInstanceId: null,
    targetEventId: null,
    ownerId: parentSubsystem.responsibleEngineerId,
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

  currentSnapshot = {
    ...currentSnapshot,
    seasons: [...currentSnapshot.seasons, season],
    projects: [...currentSnapshot.projects, ...projects],
  };

  return season;
}

export function getProjects() {
  return currentSnapshot.projects;
}

export function getWorkstreams() {
  return currentSnapshot.workstreams;
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
        parentSubsystemId: nextParentSubsystemId,
      };

      return updatedSubsystem;
    }),
  };

  return updatedSubsystem;
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
    tasks: currentSnapshot.tasks.map((task) =>
      removedPartInstanceIds.has(task.partInstanceId ?? "")
        ? {
            ...task,
            partInstanceId: null,
          }
        : task,
    ),
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
    tasks: currentSnapshot.tasks.map((task) =>
      task.partInstanceId === partInstanceId
        ? {
            ...task,
            partInstanceId: null,
          }
        : task,
    ),
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
      };

      return updatedMechanism;
    }),
    tasks: currentSnapshot.tasks.map((task) =>
      task.mechanismId === mechanismId
        ? {
            ...task,
            subsystemId: nextSubsystemId,
          }
        : task,
    ),
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
    tasks: currentSnapshot.tasks.map((task) =>
      task.mechanismId === mechanismId
        ? {
            ...task,
            mechanismId: null,
          }
        : task,
    ),
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
    title: input.title,
    summary: input.summary,
    subsystemId: input.subsystemId,
    disciplineId: input.disciplineId,
    mechanismId: input.mechanismId,
    partInstanceId: input.partInstanceId,
    targetEventId: input.targetEventId,
    ownerId: input.ownerId,
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

  currentSnapshot = {
    ...currentSnapshot,
    tasks: [...currentSnapshot.tasks, task],
  };

  return task;
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

export function updateTask(taskId: string, input: Partial<TaskInput>) {
  let updatedTask: Task | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    tasks: currentSnapshot.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      updatedTask = {
        ...task,
        ...input,
      };

      return updatedTask;
    }),
  };

  return updatedTask;
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

export function createManufacturingItem(input: ManufacturingItemInput) {
  const itemIds = new Set(currentSnapshot.manufacturingItems.map((item) => item.id));
  const item: ManufacturingItem = {
    id: uniqueId(toSlug(input.title) || "manufacturing-item", itemIds),
    title: input.title,
    subsystemId: input.subsystemId,
    requestedById: input.requestedById,
    process: input.process,
    dueDate: input.dueDate,
    material: input.material,
    partDefinitionId: input.partDefinitionId,
    quantity: input.quantity,
    status: input.status,
    mentorReviewed: input.mentorReviewed,
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

      updatedItem = {
        ...item,
        ...input,
      };

      return updatedItem;
    }),
  };

  return updatedItem;
}

export function createMember(input: MemberInput) {
  const memberIds = new Set(currentSnapshot.members.map((member) => member.id));
  const member: Member = {
    id: uniqueId(toSlug(input.name) || "member", memberIds),
    name: input.name,
    role: input.role,
    seasonId: input.seasonId,
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

      updatedMember = {
        ...member,
        ...input,
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
