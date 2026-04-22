import { snapshot as initialSnapshot } from "./mockData";
import type {
  Member,
  PlatformSnapshot,
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
  ownerId: string;
  mentorId: string;
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

export function getMembers() {
  return currentSnapshot.members;
}

export function getSubsystems() {
  return currentSnapshot.subsystems;
}

export function getTasks() {
  return currentSnapshot.tasks;
}

export function createTask(input: TaskInput) {
  const taskIds = new Set(currentSnapshot.tasks.map((task) => task.id));
  const task: Task = {
    id: uniqueId(toSlug(input.title) || "task", taskIds),
    title: input.title,
    summary: input.summary,
    subsystemId: input.subsystemId,
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

export function findSubsystem(subsystemId: string): Subsystem | undefined {
  return currentSnapshot.subsystems.find((subsystem) => subsystem.id === subsystemId);
}
