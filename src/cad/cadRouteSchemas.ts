import { z } from "zod";

export const cadStepImportJsonSchema = z.object({
  fileName: z.string().trim().min(1),
  fileText: z.string().min(1),
  label: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  seasonId: z.string().trim().min(1).nullable().optional(),
  requestedBy: z.string().trim().min(1).nullable().optional(),
  allowPlaceholder: z.boolean().optional(),
});

export const cadListQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  seasonId: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
});

export const cadGroupInstancesQuerySchema = z.object({
  groupInstances: z.enum(["true", "false"]).optional(),
});

export const cadMappingUpdateSchema = z.object({
  updates: z.array(
    z.object({
      mappingId: z.string().trim().min(1).optional(),
      sourceKind: z.enum(["ASSEMBLY_NODE", "PART_DEFINITION", "PART_INSTANCE"]).optional(),
      sourceId: z.string().trim().min(1).optional(),
      sourceIds: z.array(z.string().trim().min(1)).optional(),
      targetKind: z.enum([
        "SUBSYSTEM",
        "MECHANISM",
        "COMPONENT_ASSEMBLY",
        "PART_DEFINITION",
        "PART_INSTANCE",
        "IGNORE",
        "REFERENCE_GEOMETRY",
        "UNMAPPED",
      ]),
      targetId: z.string().trim().min(1).nullable().optional(),
      confidence: z.enum(["HIGH", "MEDIUM", "LOW", "MANUAL"]).optional(),
      status: z.enum(["PROPOSED", "CONFIRMED", "REJECTED", "NEEDS_REVIEW"]).optional(),
      applyToFuture: z.boolean().optional(),
      reviewedBy: z.string().trim().min(1).nullable().optional(),
      notes: z.string().trim().nullable().optional(),
    }),
  ).min(1),
  reviewedBy: z.string().trim().min(1).nullable().optional(),
});

export const cadHierarchyApplySchema = z.object({
  reviewedBy: z.string().trim().min(1).nullable().optional(),
  decisions: z.array(
    z.object({
      nodeId: z.string().trim().min(1),
      sourceId: z.string().trim().min(1).optional(),
      sourceKind: z.enum(["ASSEMBLY_NODE", "PART_DEFINITION", "PART_INSTANCE"]).optional(),
      targetKind: z.enum(["SUBSYSTEM", "MECHANISM", "COMPONENT_ASSEMBLY", "PART_DEFINITION", "IGNORE", "REFERENCE_GEOMETRY", "UNMAPPED"]),
      targetId: z.string().trim().min(1).nullable().optional(),
      parentSubsystemId: z.string().trim().min(1).nullable().optional(),
      parentMechanismId: z.string().trim().min(1).nullable().optional(),
      status: z.enum(["CONFIRMED", "REJECTED", "NEEDS_REVIEW"]).optional(),
      applyToFuture: z.boolean().optional(),
      notes: z.string().trim().nullable().optional(),
    }),
  ).optional(),
  assemblyDecisions: z.array(
    z.object({
      sourceId: z.string().trim().min(1),
      targetKind: z.enum(["SUBSYSTEM", "MECHANISM", "COMPONENT_ASSEMBLY", "IGNORE", "REFERENCE_GEOMETRY", "UNMAPPED"]),
      targetId: z.string().trim().min(1).nullable().optional(),
      parentSubsystemId: z.string().trim().min(1).nullable().optional(),
      parentMechanismId: z.string().trim().min(1).nullable().optional(),
      confidence: z.enum(["HIGH", "MEDIUM", "LOW", "MANUAL"]).optional(),
      status: z.enum(["PROPOSED", "CONFIRMED", "REJECTED", "NEEDS_REVIEW"]).optional(),
      applyToFuture: z.boolean().optional(),
      notes: z.string().trim().nullable().optional(),
    }),
  ).optional(),
  partMatchConfirmations: z.array(
    z.object({
      cadPartDefinitionSourceId: z.string().trim().min(1),
      targetPartDefinitionId: z.string().trim().min(1).nullable(),
      status: z.enum(["CONFIRMED", "REJECTED", "NEEDS_REVIEW"]).optional(),
      applyToFuture: z.boolean().optional(),
      notes: z.string().trim().nullable().optional(),
    }),
  ).optional(),
}).refine(
  (value) =>
    (value.decisions?.length ?? 0) +
      (value.assemblyDecisions?.length ?? 0) +
      (value.partMatchConfirmations?.length ?? 0) >
    0,
  { message: "At least one hierarchy decision is required." },
);

export const cadMappingRuleCreateSchema = z.object({
  projectId: z.string().trim().min(1),
  seasonId: z.string().trim().min(1).nullable().optional(),
  sourceKind: z.enum(["ASSEMBLY_NODE", "PART_DEFINITION", "PART_INSTANCE"]),
  matchStrategy: z.enum([
    "STABLE_SIGNATURE",
    "INSTANCE_PATH",
    "NORMALIZED_NAME",
    "NORMALIZED_NAME_WITH_PARENT",
    "MANUAL_ONLY",
  ]),
  matchValue: z.string().trim().min(1),
  targetKind: z.enum([
    "SUBSYSTEM",
    "MECHANISM",
    "COMPONENT_ASSEMBLY",
    "PART_DEFINITION",
    "PART_INSTANCE",
    "IGNORE",
    "REFERENCE_GEOMETRY",
    "UNMAPPED",
  ]),
  targetId: z.string().trim().min(1).nullable().optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW", "MANUAL"]),
  createdFromSnapshotId: z.string().trim().min(1),
  createdBy: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export const cadMappingRulePatchSchema = z.object({
  active: z.boolean().optional(),
  supersededByRuleId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export const cadFinalizeSchema = z.object({
  allowUnresolved: z.boolean().optional(),
  finalizedBy: z.string().trim().min(1).nullable().optional(),
});
