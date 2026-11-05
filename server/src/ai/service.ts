import { extractPlaceholders, validate } from '../../../src/domain/checks';
import { isVerdict } from '../../../src/data/translator';
import type { GlossaryTerm } from '../../../src/domain/types';
import type { ReviewResult } from '../../../src/data/translator';
import { HttpError, isAbort } from '../errors';
import type { LanguageModel } from './anthropic';
import { asObject, extractJsonObject } from './parse';
import { reviewPrompt, translationPrompt } from './prompts';

export interface AiService {
  translate(text: string, glossary: readonly GlossaryTerm[], signal?: AbortSignal): Promise<string>;
  review(ar: string, en: string, glossary: readonly GlossaryTerm[], signal?: AbortSignal): Promise<ReviewResult>;
}

const NOT_CONFIGURED = 'AI is not configured. Set ANTHROPIC_API_KEY on the server.';

export function createAi(model: LanguageModel | null): AiService {
  return {
    async translate(text, glossary, signal) {
      const raw = await complete(model, translationPrompt(text, glossary), signal);
      const translation = stringField(asObject(extractJsonObject(raw)).translation).trim();
      if (!translation) throw new HttpError(502, 'The AI service returned no translation.');
      const actual = new Set(extractPlaceholders(translation));
      const dropped = extractPlaceholders(text).filter((placeholder) => !actual.has(placeholder));
      if (dropped.length > 0) throw new HttpError(502, `The AI service dropped a placeholder (${dropped.join(', ')}).`);
      return translation;
    },
    async review(ar, en, glossary, signal) {
      const errors = validate(ar, en, glossary).filter((issue) => issue.severity === 'error');
      if (errors.length > 0) return { verdict: 'problem', summary: errors.map((issue) => issue.message).join(' ') };
      const raw = await complete(model, reviewPrompt(ar, en, glossary), signal);
      const body = asObject(extractJsonObject(raw));
      if (!isVerdict(body.verdict)) throw new HttpError(502, 'The AI service returned an unreadable review.');
      const summary = stringField(body.summary).trim().slice(0, 600);
      if (!summary) throw new HttpError(502, 'The AI service returned an unreadable review.');
      const suggestion = body.verdict === 'problem' ? cleanSuggestion(body.suggestion, en) : undefined;
      return { verdict: body.verdict, summary, ...(suggestion ? { suggestion } : {}) };
    },
  };
}

async function complete(model: LanguageModel | null, prompt: { system: string; user: string }, signal?: AbortSignal): Promise<string> {
  if (!model) throw new HttpError(503, NOT_CONFIGURED);
  try {
    return await model.complete({ ...prompt, signal });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isAbort(error)) throw new HttpError(499, 'The request was cancelled.');
    throw new HttpError(502, 'The AI service is unavailable right now.');
  }
}

function stringField(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(502, 'The AI service returned an unreadable reply.');
  return value;
}

function cleanSuggestion(value: unknown, current: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const suggestion = value.trim().slice(0, 4000);
  if (!suggestion || suggestion === current.trim()) return undefined;
  return suggestion;
}
