export type CadImportSource = "STEP_UPLOAD" | "ONSHAPE_API" | "ONSHAPE_BOM_CSV" | "MANUAL_BOM_CSV";
export type CadImportStatus =
  | "PENDING"
  | "PARSING"
  | "PARSED"
  | "MAPPING_REVIEW"
  | "MAPPED"
  | "FINALIZED"
  | "FAILED"
  | "CANCELED";
export type CadSnapshotStatus = "parsed" | "mapping_review" | "mapped" | "finalized" | "superseded";
export type CadMappingSourceKind = "ASSEMBLY_NODE" | "PART_DEFINITION" | "PART_INSTANCE";
export type CadMappingTargetKind =
  | "SUBSYSTEM"
  | "MECHANISM"
  | "COMPONENT_ASSEMBLY"
  | "PART_DEFINITION"
  | "PART_INSTANCE"
  | "IGNORE"
  | "REFERENCE_GEOMETRY"
  | "UNMAPPED";
export type CadMappingConfidence = "HIGH" | "MEDIUM" | "LOW" | "MANUAL";
export type CadSnapshotMappingStatus = "PROPOSED" | "CONFIRMED" | "REJECTED" | "NEEDS_REVIEW";
export type CadAssemblyInferredType =
  | "ROOT"
  | "SUBSYSTEM_CANDIDATE"
  | "MECHANISM_CANDIDATE"
  | "COMPONENT_ASSEMBLY_CANDIDATE"
  | "SUBASSEMBLY"
  | "UNKNOWN";
export type CadMappingMatchStrategy =
  | "STABLE_SIGNATURE"
  | "INSTANCE_PATH"
  | "NORMALIZED_NAME"
  | "NORMALIZED_NAME_WITH_PARENT"
  | "MANUAL_ONLY";
export type CadWarningSeverity = "INFO" | "WARNING" | "ERROR";

export interface CadImportRun {
  id: string;
  projectId: string | null;
  seasonId: string | null;
  source: CadImportSource;
  status: CadImportStatus;
  originalFilename: string;
  uploadedFileId: string | null;
  uploadedFileHash: string | null;
  parserVersion: string | null;
  parseStartedAt: string | null;
  parseCompletedAt: string | null;
  requestedBy: string | null;
  errorMessage: string | null;
  rawSummaryJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CadSnapshot {
  id: string;
  projectId: string | null;
  seasonId: string | null;
  importRunId: string;
  source: CadImportSource;
  label: string;
  uploadedFileId: string | null;
  uploadedFileHash: string | null;
  previousSnapshotId: string | null;
  status: CadSnapshotStatus;
  createdBy: string | null;
  createdAt: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  notes: string | null;
}

export interface CadAssemblyNode {
  id: string;
  snapshotId: string;
  sourceId: string;
  parentSourceId: string | null;
  parentAssemblyNodeId: string | null;
  name: string;
  normalizedName: string;
  instancePath: string;
  depth: number;
  inferredType: CadAssemblyInferredType;
  stableSignature: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface CadPartDefinition {
  id: string;
  snapshotId: string;
  sourceId: string;
  name: string;
  normalizedName: string;
  partNumber: string | null;
  material: string | null;
  stableSignature: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface CadPartInstance {
  id: string;
  snapshotId: string;
  sourceId: string;
  partDefinitionId: string | null;
  parentAssemblyNodeId: string | null;
  instancePath: string;
  quantity: number;
  stableSignature: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface CadMappingRule {
  id: string;
  projectId: string;
  seasonId: string | null;
  sourceKind: CadMappingSourceKind;
  matchStrategy: CadMappingMatchStrategy;
  matchValue: string;
  targetKind: CadMappingTargetKind;
  targetId: string | null;
  confidence: CadMappingConfidence;
  createdFromSnapshotId: string;
  createdBy: string | null;
  createdAt: string;
  supersededByRuleId: string | null;
  active: boolean;
  notes: string | null;
}

export interface CadSnapshotMapping {
  id: string;
  snapshotId: string;
  mappingRuleId: string | null;
  sourceKind: CadMappingSourceKind;
  sourceId: string;
  targetKind: CadMappingTargetKind;
  targetId: string | null;
  confidence: CadMappingConfidence;
  status: CadSnapshotMappingStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CadImportWarning {
  id: string;
  importRunId: string;
  snapshotId: string | null;
  severity: CadWarningSeverity;
  code: string;
  title: string;
  message: string;
  sourceKind: CadMappingSourceKind | null;
  sourceId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface NormalizedCadAssemblyNode {
  sourceId: string;
  parentSourceId?: string | null;
  name: string;
  instancePath: string;
  depth: number;
  inferredType: CadAssemblyInferredType;
  stableSignature?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedCadPartDefinition {
  sourceId: string;
  name: string;
  partNumber?: string | null;
  material?: string | null;
  stableSignature?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedCadPartInstance {
  sourceId: string;
  partDefinitionSourceId?: string | null;
  parentAssemblySourceId?: string | null;
  instancePath: string;
  quantity?: number;
  stableSignature?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedCadWarning {
  severity: CadWarningSeverity;
  code: string;
  title: string;
  message: string;
  sourceKind?: CadMappingSourceKind | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StepParseResult {
  parserVersion: string;
  rootName: string | null;
  units?: string | null;
  assemblyNodes: NormalizedCadAssemblyNode[];
  partDefinitions: NormalizedCadPartDefinition[];
  partInstances: NormalizedCadPartInstance[];
  warnings: NormalizedCadWarning[];
  rawStats: {
    assemblyCount: number;
    partDefinitionCount: number;
    partInstanceCount: number;
    maxDepth: number;
    hadNames: boolean;
    hadHierarchy: boolean;
    duplicateNameCount: number;
    entityCount?: number;
    productCount?: number;
    productDefinitionFormationCount?: number;
    productDefinitionCount?: number;
    nextAssemblyUsageOccurrenceCount?: number;
    assemblyUsageCount?: number;
    rootCount?: number;
    rootNames?: string[];
    topLevelAssemblyNames?: string[];
    firstTenAssemblyNames?: string[];
  };
}
