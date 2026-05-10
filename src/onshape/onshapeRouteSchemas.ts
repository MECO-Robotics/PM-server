import { z } from "zod";

export const onshapeDocumentRefSchema = z.object({
  url: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  seasonId: z.string().trim().min(1).nullable().optional(),
  subsystemId: z.string().trim().min(1).nullable().optional(),
  mechanismId: z.string().trim().min(1).nullable().optional(),
  createdBy: z.string().trim().min(1).nullable().optional(),
});

export const onshapeImportRunSchema = z.object({
  documentRefId: z.string().trim().min(1),
  syncLevel: z.enum(["link_only", "shallow", "bom", "deep_release"]),
  requestedBy: z.string().trim().min(1).nullable().optional(),
});

export const onshapeListQuerySchema = z.object({
  documentRefId: z.string().trim().min(1).optional(),
  snapshotId: z.string().trim().min(1).optional(),
});

export const onshapeImportEstimateQuerySchema = z.object({
  documentRefId: z.string().trim().min(1),
  syncLevel: z.enum(["link_only", "shallow", "bom", "deep_release"]),
});
