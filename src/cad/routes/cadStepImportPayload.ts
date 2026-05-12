import type { FastifyRequest } from "fastify";

import { cadStepUploadConfig } from "../../config/env";
import { CadImportError } from "../cadImportService";
import { cadStepImportJsonSchema } from "../cadRouteSchemas";

const maxStepUploadBytes = cadStepUploadConfig.maxBytes;

function formatUploadLimit(bytes: number) {
  const mib = bytes / (1024 * 1024);
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`;
}

function isMultipartFileTooLargeError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

export async function readStepImportPayload(request: FastifyRequest) {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const parsed = cadStepImportJsonSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new CadImportError("STEP import payload is invalid.");
    }
    return parsed.data;
  }

  const multipartRequest = request as FastifyRequest & {
    parts: (options?: unknown) => AsyncIterable<{
      type: "file" | "field";
      fieldname: string;
      filename: string;
      value?: unknown;
      toBuffer?: () => Promise<Buffer>;
    }>;
  };

  try {
    const fields: Record<string, string> = {};
    let fileName: string | null = null;
    let fileText: string | null = null;

    for await (const part of multipartRequest.parts({ limits: { fileSize: maxStepUploadBytes, files: 1 } })) {
      if (part.type === "field") {
        if (typeof part.value === "string") {
          fields[part.fieldname] = part.value;
        }
        continue;
      }
      if (part.fieldname !== "file" || !part.toBuffer) {
        continue;
      }
      const buffer = await part.toBuffer();
      fileName = part.filename;
      fileText = buffer.toString("utf8");
    }

    if (!fileName || fileText === null) {
      throw new CadImportError("STEP import requires a file.");
    }
    return {
      fileName,
      fileText,
      label: fields.label,
      projectId: fields.projectId,
      seasonId: fields.seasonId,
      requestedBy: fields.requestedBy,
      allowPlaceholder: fields.allowPlaceholder === "true",
    };
  } catch (error) {
    if (isMultipartFileTooLargeError(error)) {
      throw new CadImportError(
        `STEP file is larger than the ${formatUploadLimit(maxStepUploadBytes)} upload limit. Export a smaller assembly or ask an admin to raise CAD_STEP_UPLOAD_MAX_BYTES.`,
        413,
      );
    }
    throw error;
  }
}
