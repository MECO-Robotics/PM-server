import { CadImportError } from "../cadImportService";
import { cadGroupInstancesQuerySchema, cadListQuerySchema } from "../cadRouteSchemas";

export function readListQuery(query: unknown) {
  const parsed = cadListQuerySchema.safeParse(query ?? {});
  if (!parsed.success) {
    throw new CadImportError("CAD list query is invalid.", 400);
  }
  return parsed.data;
}

export function readGroupInstancesQuery(query: unknown) {
  const parsed = cadGroupInstancesQuerySchema.safeParse(query ?? {});
  return parsed.success ? parsed.data.groupInstances !== "false" : true;
}
