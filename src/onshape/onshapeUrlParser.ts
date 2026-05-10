import type { OnshapeUrlParseResult } from "./onshapeTypes";

const ONSHAPE_HOST_PATTERN = /(^|\.)onshape\.com$/i;

type PathMode = "w" | "v" | "m";

const modeToReferenceType: Record<PathMode, OnshapeUrlParseResult["referenceType"]> = {
  w: "workspace",
  v: "version",
  m: "microversion",
};

function readSegmentAfter(segments: string[], token: string) {
  const index = segments.indexOf(token);
  if (index < 0 || index + 1 >= segments.length) {
    return undefined;
  }
  return segments[index + 1] || undefined;
}

export function parseOnshapeUrl(rawUrl: string): OnshapeUrlParseResult {
  const originalUrl = rawUrl;
  const errors: string[] = [];
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      originalUrl,
      referenceType: "unknown",
      errors: ["URL is not valid."],
    };
  }

  if (!ONSHAPE_HOST_PATTERN.test(parsed.hostname)) {
    return {
      ok: false,
      originalUrl,
      referenceType: "unknown",
      errors: ["URL is not an Onshape URL."],
    };
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const documentId = readSegmentAfter(segments, "documents");
  const mode = ["w", "v", "m"].find((candidate): candidate is PathMode =>
    segments.includes(candidate),
  );
  const referenceId = mode ? readSegmentAfter(segments, mode) : undefined;
  const elementId = readSegmentAfter(segments, "e");

  if (!documentId) {
    errors.push("documentId is missing.");
  }
  if (!mode || !referenceId) {
    errors.push("workspaceId, versionId, or microversionId is missing.");
  }
  if (!elementId) {
    errors.push("elementId is missing; link-only storage is allowed but assembly sync may need an element.");
  }

  const referenceType = mode ? modeToReferenceType[mode] : "unknown";

  return {
    ok: Boolean(documentId && mode && referenceId),
    documentId,
    workspaceId: mode === "w" ? referenceId : undefined,
    versionId: mode === "v" ? referenceId : undefined,
    microversionId: mode === "m" ? referenceId : undefined,
    elementId,
    originalUrl,
    referenceType,
    errors,
  };
}
