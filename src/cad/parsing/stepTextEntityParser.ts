export interface StepEntity {
  id: string;
  type: string;
  args: string[];
  refs: string[];
}

export function normalizeEntityId(value: string) {
  return value.trim().toUpperCase();
}

export function stepStringValue(arg: string) {
  const value = arg.trim();
  if (!value.startsWith("'")) {
    return null;
  }
  let output = "";
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      if (value[index + 1] === "'") {
        output += "'";
        index += 1;
        continue;
      }
      break;
    }
    output += character;
  }
  return output;
}

function splitStepArgs(argsText: string) {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let index = 0; index < argsText.length; index += 1) {
    const character = argsText[index];
    if (character === "'") {
      current += character;
      if (inString && argsText[index + 1] === "'") {
        current += argsText[index + 1];
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth = Math.max(0, depth - 1);
      } else if (character === "," && depth === 0) {
        args.push(current.trim());
        current = "";
        continue;
      }
    }
    current += character;
  }

  if (current.trim() || argsText.trim()) {
    args.push(current.trim());
  }
  return args;
}

function matchingParenIndex(text: string, openIndex: number) {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (character === "'") {
      if (inString && text[index + 1] === "'") {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

export function parseStepEntities(fileText: string) {
  const entities: StepEntity[] = [];
  const entityPattern = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = entityPattern.exec(fileText)) !== null) {
    const openIndex = match.index + match[0]!.lastIndexOf("(");
    const closeIndex = matchingParenIndex(fileText, openIndex);
    if (closeIndex < 0) {
      break;
    }
    const argsText = fileText.slice(openIndex + 1, closeIndex);
    const args = splitStepArgs(argsText);
    entities.push({
      id: normalizeEntityId(`#${match[1]}`),
      type: match[2]!.toUpperCase(),
      args,
      refs: [...argsText.matchAll(/#\d+/g)].map((ref) => normalizeEntityId(ref[0])),
    });
    entityPattern.lastIndex = closeIndex + 1;
  }
  return entities;
}
