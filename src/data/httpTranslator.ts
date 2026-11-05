import { readErrorMessage } from './httpError';
import { isVerdict } from './translator';
import type { ReviewResult, TranslationService } from './translator';

/**
 * Calls your own backend, which holds the AI key. Contract:
 *   POST {baseUrl}/ai/translate  { text, glossary }       -> { translation }
 *   POST {baseUrl}/ai/review     { ar, en, glossary }     -> { verdict, summary, suggestion? }
 * Responses are validated at runtime: a malformed reply becomes an error, never a silent wrong answer.
 */
export function createHttpTranslator(baseUrl: string, token?: string): TranslationService {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const post = async (path: string, body: unknown, signal?: AbortSignal): Promise<unknown> => {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) {
      const fallback = res.status === 429 ? 'Too many requests. Wait a moment and try again.' : `AI service error (${res.status}).`;
      throw new Error(await readErrorMessage(res, fallback));
    }
    return res.json();
  };
  return {
    label: 'AI',
    async translate(ar, glossary, signal) {
      const data = (await post('/ai/translate', { text: ar, glossary }, signal)) as { translation?: unknown };
      if (typeof data.translation !== 'string' || !data.translation.trim()) throw new Error('The AI service returned no translation.');
      return data.translation.trim();
    },
    async review(ar, en, glossary, signal) {
      const data = (await post('/ai/review', { ar, en, glossary }, signal)) as Partial<ReviewResult>;
      if (!isVerdict(data.verdict) || typeof data.summary !== 'string') throw new Error('The AI service returned an unreadable review.');
      return { verdict: data.verdict, summary: data.summary, ...(typeof data.suggestion === 'string' && data.suggestion.trim() ? { suggestion: data.suggestion.trim() } : {}) };
    },
  };
}
