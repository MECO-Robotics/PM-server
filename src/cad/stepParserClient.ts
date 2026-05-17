import { parseJsonFixture } from "./parsing/stepJsonFixtureParser";
import { placeholderResult } from "./parsing/stepPlaceholderParser";
import { parseStepTextAssemblyGraph } from "./parsing/stepTextParser";
import type { StepParserClient, StepParserInput, StepParserMode } from "./parsing/stepParserTypes";

export type { StepParserClient, StepParserInput, StepParserMode };

export function createJsonFixtureStepParserClient(): StepParserClient {
  return {
    async parseStepFile(input) {
      const parsed = parseJsonFixture(input);
      if (!parsed) {
        throw new Error("STEP parser JSON fixture input is invalid.");
      }
      return parsed;
    },
  };
}

export function createPlaceholderStepParserClient(): StepParserClient {
  return {
    async parseStepFile() {
      return placeholderResult();
    },
  };
}

export function createStepTextAssemblyParserClient(): StepParserClient {
  return {
    async parseStepFile(input) {
      return parseStepTextAssemblyGraph(input);
    },
  };
}

export function createStepParserClient(options?: { mode?: StepParserMode }): StepParserClient {
  const mode = options?.mode ?? "auto";
  if (mode === "placeholder") {
    return createPlaceholderStepParserClient();
  }
  if (mode === "json_fixture") {
    return createJsonFixtureStepParserClient();
  }
  if (mode === "step_text") {
    return createStepTextAssemblyParserClient();
  }
  return {
    async parseStepFile(input) {
      const trimmed = input.fileText.trimStart();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = parseJsonFixture(input);
        if (parsed) {
          return parsed;
        }
      }
      return parseStepTextAssemblyGraph(input);
    },
  };
}

export function createMockStepParserClient(): StepParserClient {
  return createJsonFixtureStepParserClient();
}
