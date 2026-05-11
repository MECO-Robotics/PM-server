import type { PartDefinition } from "../domain/types";
import { getPartDefinitions } from "../data/store";
import type { CadPartDefinition, CadPartInstance } from "./cadTypes";
import type { CadStore } from "./cadStoreTypes";
import { normalizeCadName } from "./cadUtils";

export type CadPartMatchStatus = "EXACT" | "AMBIGUOUS" | "SUGGESTED" | "NO_MATCH";
export type CadPartMatchStrategy =
  | "EXACT_PART_NUMBER"
  | "EXACT_NORMALIZED_NAME"
  | "VENDOR_METADATA"
  | "STOCK_OR_FASTENER_NAME"
  | "FUZZY_NAME";

export interface CadPartMatchCandidate {
  id: string;
  partDefinitionId: string;
  name: string;
  partNumber: string;
  label: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  strategy: CadPartMatchStrategy;
  reason: string;
  score: number;
}

export interface CadPartMatchProposal {
  id: string;
  hierarchyNodeId: string;
  cadPartDefinitionId: string;
  cadPartDefinitionSourceId: string;
  cadPartName: string;
  sourcePartName: string;
  parentHierarchyName: string | null;
  cadPartNumber: string | null;
  instanceQuantity: number;
  status: CadPartMatchStatus;
  recommendedPartDefinitionId: string | null;
  candidates: CadPartMatchCandidate[];
}

function cleanPartNumber(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function tokens(value: string) {
  return normalizeCadName(value).split("-").filter(Boolean);
}

function tokenScore(left: string, right: string) {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function isStockOrFastenerName(value: string) {
  return /\b(rivet|bolt|screw|nut|washer|bearing|tube|extrusion|plate|stock|spacer)\b/i.test(value);
}

function candidateFrom(part: PartDefinition, strategy: CadPartMatchStrategy, confidence: "HIGH" | "MEDIUM" | "LOW", score: number) {
  return {
    id: part.id,
    partDefinitionId: part.id,
    name: part.name,
    partNumber: part.partNumber,
    label: `${part.partNumber} - ${part.name}`,
    strategy,
    confidence,
    reason: strategy.toLowerCase().replace(/_/g, " "),
    score,
  };
}

function byBestCandidate(left: CadPartMatchCandidate, right: CadPartMatchCandidate) {
  const confidenceRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return confidenceRank[right.confidence] - confidenceRank[left.confidence] || right.score - left.score || left.name.localeCompare(right.name);
}

function proposalStatus(candidates: CadPartMatchCandidate[]) {
  if (candidates.length === 0) {
    return { status: "NO_MATCH" as const, recommendedPartDefinitionId: null };
  }
  const best = candidates[0]!;
  const tied = candidates.filter((candidate) => candidate.confidence === best.confidence && candidate.score === best.score);
  if (best.confidence === "HIGH" && tied.length === 1) {
    return { status: "EXACT" as const, recommendedPartDefinitionId: best.id };
  }
  if (tied.length > 1) {
    return { status: "AMBIGUOUS" as const, recommendedPartDefinitionId: null };
  }
  return { status: "SUGGESTED" as const, recommendedPartDefinitionId: best.id };
}

function candidatesForPart(cadPart: CadPartDefinition, domainParts: PartDefinition[]) {
  const cadNumber = cleanPartNumber(cadPart.partNumber);
  if (cadNumber) {
    const exact = domainParts.filter((part) => cleanPartNumber(part.partNumber) === cadNumber);
    if (exact.length > 0) {
      return exact.map((part) => candidateFrom(part, "EXACT_PART_NUMBER", "HIGH", 1)).sort(byBestCandidate);
    }
  }

  const normalizedName = normalizeCadName(cadPart.name);
  const exactNames = domainParts.filter((part) => normalizeCadName(part.name) === normalizedName);
  if (exactNames.length > 0) {
    const confidence = exactNames.length === 1 ? "HIGH" : "MEDIUM";
    return exactNames.map((part) => candidateFrom(part, "EXACT_NORMALIZED_NAME", confidence, 0.95)).sort(byBestCandidate);
  }

  const vendor = normalizeCadName(String(cadPart.metadataJson.vendor ?? ""));
  const vendorMatches = vendor
    ? domainParts.filter((part) => normalizeCadName(part.source) === vendor && tokenScore(cadPart.name, part.name) >= 0.5)
    : [];
  if (vendorMatches.length > 0) {
    return vendorMatches.map((part) => candidateFrom(part, "VENDOR_METADATA", "MEDIUM", tokenScore(cadPart.name, part.name))).sort(byBestCandidate);
  }

  if (isStockOrFastenerName(cadPart.name)) {
    const stockMatches = domainParts.filter((part) => {
      const score = tokenScore(cadPart.name, `${part.name} ${part.type} ${part.description}`);
      return (part.isHardware || /stock|hardware/i.test(part.type)) && score >= 0.45;
    });
    if (stockMatches.length > 0) {
      return stockMatches.map((part) => candidateFrom(part, "STOCK_OR_FASTENER_NAME", "MEDIUM", tokenScore(cadPart.name, part.name))).sort(byBestCandidate);
    }
  }

  return domainParts
    .map((part) => ({ part, score: tokenScore(cadPart.name, part.name) }))
    .filter((item) => item.score >= 0.66)
    .map((item) => candidateFrom(item.part, "FUZZY_NAME", item.score >= 0.82 ? "MEDIUM" : "LOW", item.score))
    .sort(byBestCandidate);
}

export async function buildCadPartMatchProposals(args: { store: CadStore; snapshotId: string }) {
  const cadParts = await args.store.listPartDefinitions(args.snapshotId);
  const instances = await args.store.listPartInstances(args.snapshotId);
  const assemblies = await args.store.listAssemblyNodes(args.snapshotId);
  const quantityByPartId = new Map<string, number>();
  const parentNameByPartId = new Map<string, string | null>();
  const assembliesById = new Map(assemblies.map((assembly) => [assembly.id, assembly] as const));
  for (const instance of instances) {
    if (instance.partDefinitionId) {
      quantityByPartId.set(instance.partDefinitionId, (quantityByPartId.get(instance.partDefinitionId) ?? 0) + Math.max(instance.quantity, 1));
      if (!parentNameByPartId.has(instance.partDefinitionId)) {
        parentNameByPartId.set(
          instance.partDefinitionId,
          instance.parentAssemblyNodeId ? assembliesById.get(instance.parentAssemblyNodeId)?.name ?? null : null,
        );
      }
    }
  }
  const domainParts = getPartDefinitions().filter((part) => !part.isArchived);
  return {
    snapshotId: args.snapshotId,
    items: cadParts.map((cadPart): CadPartMatchProposal => {
      const candidates = candidatesForPart(cadPart, domainParts);
      const status = proposalStatus(candidates);
      return {
        id: `part-match:${cadPart.id}`,
        hierarchyNodeId: cadPart.id,
        cadPartDefinitionId: cadPart.id,
        cadPartDefinitionSourceId: cadPart.sourceId,
        cadPartName: cadPart.name,
        sourcePartName: cadPart.name,
        parentHierarchyName: parentNameByPartId.get(cadPart.id) ?? null,
        cadPartNumber: cadPart.partNumber,
        instanceQuantity: quantityByPartId.get(cadPart.id) ?? 0,
        ...status,
        candidates,
      };
    }),
  };
}
