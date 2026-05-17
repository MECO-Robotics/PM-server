import { createHash } from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function nextId(prefix: string, existingIds: string[]) {
  let index = existingIds.length + 1;
  let candidate = `${prefix}-${String(index).padStart(4, "0")}`;
  while (existingIds.includes(candidate)) {
    index += 1;
    candidate = `${prefix}-${String(index).padStart(4, "0")}`;
  }
  return candidate;
}

export function normalizeCadName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function hashText(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function inferAssemblyType(name: string, depth: number) {
  const normalized = normalizeCadName(name);
  if (depth === 0 || normalized.includes("robot") || normalized.includes("master")) {
    return "ROOT" as const;
  }
  if (normalized.startsWith("sub-") || normalized.includes("subsystem")) {
    return "SUBSYSTEM_CANDIDATE" as const;
  }
  if (normalized.startsWith("mech-") || normalized.includes("mechanism")) {
    return "MECHANISM_CANDIDATE" as const;
  }
  if (normalized.startsWith("asm-")) {
    return "SUBASSEMBLY" as const;
  }
  return "UNKNOWN" as const;
}

export function isGenericCadName(name: string) {
  const normalized = normalizeCadName(name);
  return /^(asm|assembly|part|prt|component|body|solid|default|item)-?\d*$/.test(normalized);
}

export function sourceNameWithParent(name: string, parentName: string | null) {
  const normalizedName = normalizeCadName(name) || "unnamed";
  const normalizedParent = normalizeCadName(parentName) || "root";
  return `${normalizedName}|${normalizedParent}`;
}
