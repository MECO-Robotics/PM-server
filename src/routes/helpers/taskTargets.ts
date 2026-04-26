import {
  findMechanism,
  findPartInstance,
  findSubsystem,
  getProjects,
  getWorkstreams,
} from "../../data/store";

export function getDefaultProjectId() {
  return getProjects()[0]?.id ?? null;
}

export function resolveProjectId(input: {
  projectId?: string | null;
  subsystemId?: string | null;
}) {
  if (input.projectId) {
    return input.projectId;
  }

  if (input.subsystemId) {
    const subsystem = findSubsystem(input.subsystemId);
    if (subsystem) {
      return subsystem.projectId;
    }
  }

  return getDefaultProjectId();
}

export function resolveWorkstreamId(input: {
  projectId: string;
  requestedWorkstreamId?: string | null;
  subsystemId?: string | null;
}) {
  if (input.requestedWorkstreamId !== undefined) {
    return input.requestedWorkstreamId;
  }

  if (!input.subsystemId) {
    return null;
  }

  const subsystem = findSubsystem(input.subsystemId);
  if (!subsystem) {
    return null;
  }

  return (
    getWorkstreams().find(
      (workstream) =>
        workstream.projectId === input.projectId &&
        workstream.name.toLowerCase() === subsystem.name.toLowerCase(),
    )?.id ?? null
  );
}

export function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function readTargetIds(input: {
  id?: string | null;
  ids?: string[];
  fallbackId?: string | null;
  fallbackIds?: string[];
}) {
  if (input.ids !== undefined) {
    return uniqueIds(input.ids);
  }

  if (input.id !== undefined) {
    return uniqueIds([input.id]);
  }

  return uniqueIds(input.fallbackIds ?? [input.fallbackId]);
}

export function normalizeTaskTargets(
  input: {
    workstreamId?: string | null;
    workstreamIds?: string[];
    subsystemId?: string;
    subsystemIds?: string[];
    mechanismId?: string | null;
    mechanismIds?: string[];
    partInstanceId?: string | null;
    partInstanceIds?: string[];
  },
  fallback?: {
    workstreamId: string | null;
    workstreamIds: string[];
    subsystemId: string;
    subsystemIds: string[];
    mechanismId: string | null;
    mechanismIds: string[];
    partInstanceId: string | null;
    partInstanceIds: string[];
  },
) {
  const partInstanceIds = readTargetIds({
    id: input.partInstanceId,
    ids: input.partInstanceIds,
    fallbackId: fallback?.partInstanceId,
    fallbackIds: fallback?.partInstanceIds,
  });
  const partInstances = partInstanceIds
    .map((partInstanceId) => findPartInstance(partInstanceId))
    .filter((partInstance): partInstance is NonNullable<typeof partInstance> =>
      Boolean(partInstance),
    );
  const explicitMechanismIds = readTargetIds({
    id: input.mechanismId,
    ids: input.mechanismIds,
    fallbackId: fallback?.mechanismId,
    fallbackIds: fallback?.mechanismIds,
  });
  const mechanismIds = uniqueIds([
    ...explicitMechanismIds,
    ...partInstances.map((partInstance) => partInstance.mechanismId),
  ]);
  const mechanisms = mechanismIds
    .map((mechanismId) => findMechanism(mechanismId))
    .filter((mechanism): mechanism is NonNullable<typeof mechanism> =>
      Boolean(mechanism),
    );
  const explicitSubsystemIds = readTargetIds({
    id: input.subsystemId,
    ids: input.subsystemIds,
    fallbackId: fallback?.subsystemId,
    fallbackIds: fallback?.subsystemIds,
  });
  const subsystemIds = uniqueIds([
    ...explicitSubsystemIds,
    ...mechanisms.map((mechanism) => mechanism.subsystemId),
    ...partInstances.map((partInstance) => partInstance.subsystemId),
  ]);
  const workstreamIds = readTargetIds({
    id: input.workstreamId,
    ids: input.workstreamIds,
    fallbackId: fallback?.workstreamId,
    fallbackIds: fallback?.workstreamIds,
  });

  return {
    workstreamId: workstreamIds[0] ?? null,
    workstreamIds,
    subsystemId: subsystemIds[0] ?? "",
    subsystemIds,
    mechanismId: mechanismIds[0] ?? null,
    mechanismIds,
    partInstanceId: partInstanceIds[0] ?? null,
    partInstanceIds,
  };
}
