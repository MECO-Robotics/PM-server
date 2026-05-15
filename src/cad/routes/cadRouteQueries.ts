import { CadImportError } from "../cadImportService";
import {
  cadGroupInstancesQuerySchema,
  cadImportRunListQuerySchema,
  cadSnapshotListQuerySchema,
} from "../cadRouteSchemas";

export function readImportRunListQuery(query: unknown) {
  const parsed = cadImportRunListQuerySchema.safeParse(query ?? {});
  if (!parsed.success) {
    throw new CadImportError("CAD list query is invalid.", 400);
  }
  return parsed.data;
}

export function readSnapshotListQuery(query: unknown) {
  const parsed = cadSnapshotListQuerySchema.safeParse(query ?? {});
  if (!parsed.success) {
    throw new CadImportError("CAD list query is invalid.", 400);
  }
  return parsed.data;
}

export function readGroupInstancesQuery(query: unknown) {
  const parsed = cadGroupInstancesQuerySchema.safeParse(query ?? {});
  return parsed.success ? parsed.data.groupInstances !== "false" : true;
}
