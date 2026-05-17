import type {
  NormalizedCadAssemblyNode,
  NormalizedCadPartDefinition,
  NormalizedCadWarning,
  StepParseResult,
} from "../cadTypes";
import { finalizeResult, partDefinitionSignature } from "./stepParserShared";
import type { StepProductDefinition } from "./stepTextParserTypes";

export function createFlatStepResult(args: {
  productDefinitions: Map<string, StepProductDefinition>;
  products: Map<string, string>;
  warnings: NormalizedCadWarning[];
  rawStats?: Partial<StepParseResult["rawStats"]>;
}) {
  const assemblyNodes: NormalizedCadAssemblyNode[] = [];
  const partDefinitions: NormalizedCadPartDefinition[] = [];
  const productDefinitions = [...args.productDefinitions.values()];

  if (productDefinitions.length > 0) {
    const [root, ...leaves] = productDefinitions;
    const rootPath = `/${root.name}`;
    assemblyNodes.push({
      sourceId: `step-asm-root:${root.id}`,
      parentSourceId: null,
      name: root.name,
      instancePath: rootPath,
      depth: 0,
      inferredType: "ROOT",
      stableSignature: `asm:path:${rootPath}`,
      metadata: {
        productDefinitionId: root.id,
        productId: root.productId,
        parserFallback: "flat-step-products",
      },
    });
    for (const part of leaves) {
      partDefinitions.push({
        sourceId: `step-part-def:${part.id}`,
        name: part.name,
        partNumber: null,
        material: null,
        stableSignature: partDefinitionSignature({ sourceId: `step-part-def:${part.id}`, name: part.name, partNumber: null }),
        metadata: {
          productDefinitionId: part.id,
          productId: part.productId,
          parserFallback: "flat-step-products",
        },
      });
    }
  } else {
    const products = [...args.products.entries()];
    const [rootProduct, ...leafProducts] = products;
    const rootName = rootProduct?.[1] ?? "STEP import";
    const rootId = rootProduct?.[0] ?? "unknown";
    const rootPath = `/${rootName}`;
    assemblyNodes.push({
      sourceId: `step-asm-root:${rootId}`,
      parentSourceId: null,
      name: rootName,
      instancePath: rootPath,
      depth: 0,
      inferredType: "ROOT",
      stableSignature: `asm:path:${rootPath}`,
      metadata: {
        productId: rootId,
        parserFallback: "flat-step-products",
      },
    });
    for (const [productId, name] of leafProducts) {
      partDefinitions.push({
        sourceId: `step-part-def:${productId}`,
        name,
        partNumber: null,
        material: null,
        stableSignature: partDefinitionSignature({ sourceId: `step-part-def:${productId}`, name, partNumber: null }),
        metadata: {
          productId,
          parserFallback: "flat-step-products",
        },
      });
    }
  }

  return finalizeResult({
    parserVersion: "step-text-assembly-parser-1",
    rootName: assemblyNodes[0]?.name ?? null,
    units: null,
    assemblyNodes,
    partDefinitions,
    partInstances: [],
    warnings: args.warnings,
    rawStats: args.rawStats,
  });
}
