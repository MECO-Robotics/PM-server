export type NativeRecord = Record<string, unknown>;

export function asRecord(value: unknown): NativeRecord | null {
  return typeof value === "object" && value !== null ? (value as NativeRecord) : null;
}

export function readString(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

export function readNumber(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export function readBoolean(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

export function readRecord(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = asRecord(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function readArray(record: NativeRecord | null, keys: string[]) {
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}
