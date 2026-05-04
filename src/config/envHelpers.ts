export function pickFirstString(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

export function pickFirstNumber(...candidates: Array<number | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function parseGoogleClientIds(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((clientId) => clientId.trim())
    .filter((clientId) => clientId.length > 0);
}

export function parseCsv(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseCorsOrigins(value: string) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN must include at least one origin or '*'.");
  }

  if (origins.includes("*") && origins.length > 1) {
    throw new Error("CORS_ORIGIN can only use '*' by itself.");
  }

  return origins;
}

export function normalizeUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }

  return `https://${trimmed}`.replace(/\/+$/, "");
}
