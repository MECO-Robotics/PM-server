import { snapshot as initialSnapshot } from "./mockData";
import type {
  Discipline,
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
  PurchaseItem,
  PurchaseStatus,
  Requirement,
  Subsystem,
  Task,
  TaskPriority,
  TaskStatus,
} from "../domain/types";

function cloneSnapshot(snapshot: PlatformSnapshot): PlatformSnapshot {
  return structuredClone(snapshot);
}

let currentSnapshot = cloneSnapshot(initialSnapshot);

export interface TaskInput {
  title: string;
  summary: string;
  subsystemId: string;
  disciplineId: string;
  requirementId: string | null;
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

export interface MemberInput {
  name: string;
  role: Member["role"];
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

export interface SubsystemInput {
  name: string;
  description: string;
  isCore: boolean;
  responsibleEngineerId: string | null;
  mentorIds: string[];
  risks: string[];
}

export interface MechanismInput {
  subsystemId: string;
  name: string;
  description: string;
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

export function getSnapshot() {
  return currentSnapshot;
}

export function resetStore() {
  currentSnapshot = cloneSnapshot(initialSnapshot);
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

export function getRequirements() {
  return currentSnapshot.requirements;
}

export function getMaterials() {
  return currentSnapshot.materials;
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

export function createSubsystem(input: SubsystemInput) {
  const subsystemIds = new Set(currentSnapshot.subsystems.map((subsystem) => subsystem.id));
  const subsystem: Subsystem = {
    id: uniqueId(toSlug(input.name) || "subsystem", subsystemIds),
    name: input.name,
    description: input.description,
    isCore: input.isCore,
    responsibleEngineerId: input.responsibleEngineerId,
    mentorIds: input.mentorIds,
    risks: input.risks,
  };

  currentSnapshot = {
    ...currentSnapshot,
    subsystems: [...currentSnapshot.subsystems, subsystem],
  };

  return subsystem;
}

export function updateSubsystem(subsystemId: string, input: Partial<SubsystemInput>) {
  let updatedSubsystem: Subsystem | null = null;

  currentSnapshot = {
    ...currentSnapshot,
    subsystems: currentSnapshot.subsystems.map((subsystem) => {
      if (subsystem.id !== subsystemId) {
        return subsystem;
      }

      updatedSubsystem = {
        ...subsystem,
        ...input,
      };

      return updatedSubsystem;
    }),
  };

  return updatedSubsystem;
}

export function createMechanism(input: MechanismInput) {
  const mechanismIds = new Set(currentSnapshot.mechanisms.map((mechanism) => mechanism.id));
  const mechanism: Mechanism = {
    id: uniqueId(toSlug(input.name) || "mechanism", mechanismIds),
    subsystemId: input.subsystemId,
    name: input.name,
    description: input.description,
  };

  currentSnapshot = {
    ...currentSnapshot,
    mechanisms: [...currentSnapshot.mechanisms, mechanism],
  };

  return mechanism;
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
    title: input.title,
    summary: input.summary,
    subsystemId: input.subsystemId,
    disciplineId: input.disciplineId,
    requirementId: input.requirementId,
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

export function findDiscipline(disciplineId: string): Discipline | undefined {
  return currentSnapshot.disciplines.find((discipline) => discipline.id === disciplineId);
}

export function findMechanism(mechanismId: string): Mechanism | undefined {
  return currentSnapshot.mechanisms.find((mechanism) => mechanism.id === mechanismId);
}

export function findRequirement(requirementId: string): Requirement | undefined {
  return currentSnapshot.requirements.find((requirement) => requirement.id === requirementId);
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
