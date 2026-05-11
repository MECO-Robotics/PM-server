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
