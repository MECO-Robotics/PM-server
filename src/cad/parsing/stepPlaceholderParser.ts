import type { StepParseResult } from "../cadTypes";
import { finalizeResult } from "./stepParserShared";

export function placeholderResult(): StepParseResult {
  const rootName = "PLACEHOLDER PARSER RESULT - NOT REAL CAD";
  const assemblyName = "PLACEHOLDER - DO NOT MAP";
  const childAssemblyName = "PLACEHOLDER CHILD - DO NOT MAP";
  const partName = "PLACEHOLDER PART - DO NOT MAP";
  return finalizeResult({
    parserVersion: "mock-step-parser-placeholder-1",
    rootName,
    units: null,
    assemblyNodes: [
      {
        sourceId: "asm-root",
        parentSourceId: null,
        name: assemblyName,
        instancePath: `/${assemblyName}`,
        depth: 0,
        inferredType: "ROOT",
        stableSignature: `asm:path:/${assemblyName}`,
        metadata: { placeholder: true },
      },
      {
        sourceId: "asm-placeholder-child",
        parentSourceId: "asm-root",
        name: childAssemblyName,
        instancePath: `/${assemblyName}/${childAssemblyName}`,
        depth: 1,
        inferredType: "MECHANISM_CANDIDATE",
        stableSignature: `asm:path:/${assemblyName}/${childAssemblyName}`,
        metadata: { placeholder: true },
      },
    ],
    partDefinitions: [
      {
        sourceId: "part-placeholder",
        name: partName,
        partNumber: null,
        material: null,
        stableSignature: "part:name:placeholder-part-do-not-map",
        metadata: { placeholder: true },
      },
    ],
    partInstances: [
      {
        sourceId: "inst-placeholder-1",
        partDefinitionSourceId: "part-placeholder",
        parentAssemblySourceId: "asm-placeholder-child",
        instancePath: `/${assemblyName}/${childAssemblyName}/${partName}`,
        quantity: 1,
        stableSignature: `inst:path:/${assemblyName}/${childAssemblyName}/${partName}`,
        metadata: { placeholder: true },
      },
    ],
    warnings: [
      {
        severity: "ERROR",
        code: "step_parser_placeholder_used",
        title: "Placeholder STEP parser used",
        message: "Placeholder parser output. This is not a real parse of the uploaded STEP file.",
        metadata: {},
      },
    ],
  });
}
