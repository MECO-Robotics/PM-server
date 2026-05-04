import {
  findArtifact,
  findDiscipline,
  findMilestone,
  findMaterial,
  findMechanism,
  findPartDefinition,
  findPartInstance,
  findProject,
  findSubsystem,
  findWorkstream,
  getMilestones,
  getMembers,
  getQaReports,
  getTasks,
  getTestResults,
} from "../../data/store";
import { isTaskDisciplineAllowedForProject } from "../../domain/taskDisciplines";
import { uniqueIds } from "./taskTargets";

function memberIsActiveInSeason(
  member: { seasonId: string; activeSeasonIds?: string[] },
  seasonId: string,
) {
  return uniqueIds([...(member.activeSeasonIds ?? []), member.seasonId]).includes(seasonId);
}

export function validateWorkLogLinks(input: {
  taskId: string;
  participantIds: string[];
}) {
  const taskExists = getTasks().some((task) => task.id === input.taskId);
  if (!taskExists) {
    return "The selected task does not exist.";
  }

  const memberIds = new Set(getMembers().map((member) => member.id));
  const missingParticipant = input.participantIds.find(
    (participantId) => !memberIds.has(participantId),
  );
  if (missingParticipant) {
    return "One or more selected participants do not exist.";
  }

  return null;
}

export function validateQaReportLinks(input: {
  taskId: string;
  participantIds: string[];
}) {
  const taskExists = getTasks().some((task) => task.id === input.taskId);
  if (!taskExists) {
    return "The selected task does not exist.";
  }

  const memberIds = new Set(getMembers().map((member) => member.id));
  const missingParticipant = input.participantIds.find(
    (participantId) => !memberIds.has(participantId),
  );
  if (missingParticipant) {
    return "One or more selected participants do not exist.";
  }

  return null;
}

export function validateTestResultLinks(input: { milestoneId: string }) {
  if (!findMilestone(input.milestoneId)) {
    return "The selected milestone does not exist.";
  }

  return null;
}

export function validateRiskLinks(input: {
  sourceType: "qa-report" | "test-result";
  sourceId: string;
  attachmentType: "project" | "workstream" | "mechanism" | "part-instance";
  attachmentId: string;
  mitigationTaskId?: string | null;
}) {
  if (input.sourceType === "qa-report") {
    const qaReportExists = getQaReports().some((report) => report.id === input.sourceId);
    if (!qaReportExists) {
      return "The selected QA report does not exist.";
    }
  } else {
    const testResultExists = getTestResults().some(
      (testResult) => testResult.id === input.sourceId,
    );
    if (!testResultExists) {
      return "The selected test result does not exist.";
    }
  }

  switch (input.attachmentType) {
    case "project":
      if (!findProject(input.attachmentId)) {
        return "The selected project does not exist.";
      }
      break;
    case "workstream":
      if (!findWorkstream(input.attachmentId)) {
        return "The selected workstream does not exist.";
      }
      break;
    case "mechanism":
      if (!findMechanism(input.attachmentId)) {
        return "The selected mechanism does not exist.";
      }
      break;
    case "part-instance":
      if (!findPartInstance(input.attachmentId)) {
        return "The selected part instance does not exist.";
      }
      break;
    default:
      return "The selected attachment type is invalid.";
  }

  if (input.mitigationTaskId && !getTasks().some((task) => task.id === input.mitigationTaskId)) {
    return "The selected mitigation task does not exist.";
  }

  return null;
}

export function validateTaskLinks(input: {
  projectId: string;
  workstreamId?: string | null;
  workstreamIds?: string[];
  subsystemId?: string | null;
  subsystemIds: string[];
  disciplineId?: string;
  mechanismId?: string | null;
  mechanismIds?: string[];
  partInstanceId?: string | null;
  partInstanceIds?: string[];
  artifactId?: string | null;
  artifactIds?: string[];
  targetMilestoneId?: string | null;
  assigneeIds?: string[];
}) {
  const project = findProject(input.projectId);
  if (!project) {
    return "The selected project does not exist.";
  }

  const workstreamIds = uniqueIds([
    ...(input.workstreamIds ?? []),
    input.workstreamId,
  ]);
  for (const workstreamId of workstreamIds) {
    const workstream = findWorkstream(workstreamId);
    if (!workstream) {
      return "The selected workstream does not exist.";
    }

    if (workstream.projectId !== project.id) {
      return "The selected workstream does not belong to the selected project.";
    }
  }

  const subsystemIds = uniqueIds([
    ...input.subsystemIds,
    input.subsystemId,
  ]);
  if (subsystemIds.length === 0) {
    return "Select at least one subsystem, mechanism, or part instance target.";
  }
  for (const subsystemId of subsystemIds) {
    const subsystem = findSubsystem(subsystemId);
    if (!subsystem) {
      return "The selected subsystem does not exist.";
    }
    if (subsystem.projectId !== project.id) {
      return "The selected subsystem does not belong to the selected project.";
    }
  }

  if (input.disciplineId) {
    const discipline = findDiscipline(input.disciplineId);
    if (!discipline) {
      return "The selected discipline does not exist.";
    }

    if (!isTaskDisciplineAllowedForProject(project, discipline.id)) {
      return "The selected discipline does not belong to the selected project.";
    }
  }

  const mechanismIds = uniqueIds([
    ...(input.mechanismIds ?? []),
    input.mechanismId,
  ]);
  for (const mechanismId of mechanismIds) {
    const mechanism = findMechanism(mechanismId);
    if (!mechanism) {
      return "The selected mechanism does not exist.";
    }

    if (!subsystemIds.includes(mechanism.subsystemId)) {
      return "One or more selected mechanisms do not belong to a selected subsystem.";
    }
  }

  const partInstanceIds = uniqueIds([
    ...(input.partInstanceIds ?? []),
    input.partInstanceId,
  ]);
  for (const partInstanceId of partInstanceIds) {
    const partInstance = findPartInstance(partInstanceId);
    if (!partInstance) {
      return "The selected part instance does not exist.";
    }

    if (!subsystemIds.includes(partInstance.subsystemId)) {
      return "One or more selected part instances do not belong to a selected subsystem.";
    }

    if (!partInstance.mechanismId) {
      return "The selected part instance must be linked to a mechanism.";
    }

    if (!mechanismIds.includes(partInstance.mechanismId)) {
      return "One or more selected part instances do not belong to a selected mechanism.";
    }
  }

  const artifactIds = uniqueIds([
    ...(input.artifactIds ?? []),
    input.artifactId,
  ]);
  for (const artifactId of artifactIds) {
    const artifact = findArtifact(artifactId);
    if (!artifact) {
      return "The selected artifact does not exist.";
    }

    if (artifact.projectId !== project.id) {
      return "The selected artifact does not belong to the selected project.";
    }
  }

  if (input.targetMilestoneId) {
    const milestone = getMilestones().find((candidate) => candidate.id === input.targetMilestoneId);
    if (!milestone) {
      return "The selected milestone does not exist.";
    }
  }

  if (input.assigneeIds && input.assigneeIds.length > 0) {
    const membersById = new Map(getMembers().map((member) => [member.id, member]));
    for (const assigneeId of input.assigneeIds) {
      const assignee = membersById.get(assigneeId);
      if (!assignee) {
        return "One or more assigned students do not exist.";
      }

      if (assignee.role !== "student" && assignee.role !== "lead") {
        return "Assigned task members must be students or leads.";
      }
    }
  }

  return null;
}

export function validateTaskBlockerLinks(input: {
  blockedTaskId: string;
  blockerType:
    | "task"
    | "milestone"
    | "workstream"
    | "mechanism"
    | "part_instance"
    | "artifact_instance"
    | "external";
  blockerId: string | null;
}) {
  if (!getTasks().some((task) => task.id === input.blockedTaskId)) {
    return "The selected blocked task does not exist.";
  }

  if (input.blockerType === "external") {
    return input.blockerId === null ? null : "External blockers cannot link to another record.";
  }

  if (!input.blockerId) {
    return "The selected blocker record does not exist.";
  }

  switch (input.blockerType) {
    case "task":
      return getTasks().some((task) => task.id === input.blockerId)
        ? null
        : "The selected blocker task does not exist.";
    case "milestone":
      return findMilestone(input.blockerId)
        ? null
        : "The selected blocker milestone does not exist.";
    case "workstream":
      return findWorkstream(input.blockerId)
        ? null
        : "The selected blocker workstream does not exist.";
    case "mechanism":
      return findMechanism(input.blockerId)
        ? null
        : "The selected blocker mechanism does not exist.";
    case "part_instance":
      return findPartInstance(input.blockerId)
        ? null
        : "The selected blocker part instance does not exist.";
    case "artifact_instance":
      return findArtifact(input.blockerId)
        ? null
        : "The selected blocker artifact does not exist.";
    default:
      return "The selected blocker type is invalid.";
  }
}

export function validateArtifactLinks(input: {
  projectId: string;
  workstreamId?: string | null | undefined;
}) {
  const project = findProject(input.projectId);
  if (!project) {
    return "The selected project does not exist.";
  }

  if (input.workstreamId) {
    const workstream = findWorkstream(input.workstreamId);
    if (!workstream) {
      return "The selected workstream does not exist.";
    }

    if (workstream.projectId !== project.id) {
      return "The selected workstream does not belong to the selected project.";
    }
  }

  return null;
}

function validatePartDefinitionLink(partDefinitionId: string | null | undefined) {
  if (!partDefinitionId) {
    return "Please select a real part from the Parts tab.";
  }

  if (!findPartDefinition(partDefinitionId)) {
    return "Please select a real part from the Parts tab.";
  }

  return null;
}

export function validatePartDefinitionMaterialId(materialId: string | null | undefined) {
  if (materialId === undefined || materialId === null) {
    return null;
  }

  if (!findMaterial(materialId)) {
    return "The selected material does not exist.";
  }

  return null;
}

export function validatePartInstanceLinks(input: {
  subsystemId: string;
  mechanismId?: string | null | undefined;
  partDefinitionId: string;
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (input.mechanismId) {
    const mechanism = findMechanism(input.mechanismId);
    if (!mechanism) {
      return "The selected mechanism does not exist.";
    }

    if (mechanism.subsystemId !== input.subsystemId) {
      return "The selected mechanism does not belong to the selected subsystem.";
    }
  }

  return validatePartDefinitionLink(input.partDefinitionId);
}

export function validatePurchaseItemLinks(input: {
  subsystemId: string;
  partDefinitionId?: string | null | undefined;
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (!input.partDefinitionId) {
    return null;
  }

  return validatePartDefinitionLink(input.partDefinitionId);
}

export function validateManufacturingItemLinks(input: {
  subsystemId: string;
  process: string;
  partDefinitionId?: string | null | undefined;
  partInstanceId?: string | null | undefined;
  partInstanceIds?: string[];
}) {
  if (!findSubsystem(input.subsystemId)) {
    return "The selected subsystem does not exist.";
  }

  if (input.partDefinitionId) {
    const partDefinitionError = validatePartDefinitionLink(input.partDefinitionId);
    if (partDefinitionError) {
      return partDefinitionError;
    }
  }

  const partInstanceIds = uniqueIds([
    ...(input.partInstanceIds ?? []),
    input.partInstanceId,
  ]);
  for (const partInstanceId of partInstanceIds) {
    const partInstance = findPartInstance(partInstanceId);
    if (!partInstance) {
      return "The selected part instance does not exist.";
    }

    if (
      input.partDefinitionId &&
      partInstance.partDefinitionId !== input.partDefinitionId
    ) {
      return "The selected part instance does not match the selected part definition.";
    }
  }

  return null;
}

export function validateSubsystemPeople(input: {
  projectId: string;
  responsibleEngineerId?: string | null;
  mentorIds?: string[];
}) {
  const members = getMembers();
  const project = findProject(input.projectId);
  const seasonId = project?.seasonId ?? null;

  if (
    input.responsibleEngineerId &&
    !members.some((member) => member.id === input.responsibleEngineerId)
  ) {
    return "The selected responsible engineer does not exist.";
  }
  if (
    seasonId &&
    input.responsibleEngineerId &&
    !members.some(
      (member) =>
        member.id === input.responsibleEngineerId &&
        memberIsActiveInSeason(member, seasonId),
    )
  ) {
    return "The responsible engineer must belong to the project's season.";
  }

  if (input.mentorIds) {
    const invalidMentor = input.mentorIds.find(
      (mentorId) => !members.some((member) => member.id === mentorId),
    );

    if (invalidMentor) {
      return "One of the selected mentors does not exist.";
    }
    if (
      seasonId &&
      input.mentorIds.some(
        (mentorId) =>
          !members.some(
            (member) =>
              member.id === mentorId && memberIsActiveInSeason(member, seasonId),
          ),
      )
    ) {
      return "Mentors must belong to the project's season.";
    }
  }

  return null;
}

export function wouldCreateSubsystemCycle(
  subsystemId: string,
  parentSubsystemId: string | null,
) {
  const visitedSubsystemIds = new Set<string>();
  let nextParentSubsystemId = parentSubsystemId;

  while (nextParentSubsystemId) {
    if (nextParentSubsystemId === subsystemId) {
      return true;
    }

    if (visitedSubsystemIds.has(nextParentSubsystemId)) {
      return true;
    }

    visitedSubsystemIds.add(nextParentSubsystemId);
    nextParentSubsystemId =
      findSubsystem(nextParentSubsystemId)?.parentSubsystemId ?? null;
  }

  return false;
}

export function validateMilestoneProjectLinks(projectIds: string[]) {
  const unknownProjectId = projectIds.find((projectId) => !findProject(projectId));

  if (unknownProjectId) {
    return "One or more related projects do not exist.";
  }

  return null;
}
