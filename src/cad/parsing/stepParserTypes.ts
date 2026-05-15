import type { StepParseResult } from "../cadTypes";

export interface StepParserInput {
  fileText: string;
  originalFilename: string;
  importRunId: string;
  options?: Record<string, unknown>;
}

export interface StepParserClient {
  parseStepFile(input: StepParserInput): Promise<StepParseResult>;
}

export type StepParserMode = "auto" | "step_text" | "json_fixture" | "placeholder";
