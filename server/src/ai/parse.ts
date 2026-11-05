import { HttpError } from '../errors';

/** Takes the first JSON object in a model reply, including one wrapped in prose or a markdown fence. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw unreadable();
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as unknown;
        } catch {
          throw unreadable();
        }
      }
    }
  }
  throw unreadable();
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unreadable();
  return value as Record<string, unknown>;
}

const unreadable = () => new HttpError(502, 'The AI service returned an unreadable reply.');
