import { useEffect, useRef, useState } from 'react';
import type { GlossaryTerm } from '../domain';
import type { ReviewResult, TranslationService } from '../data/translator';

export type ReviewState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; result: ReviewResult }
  | { kind: 'error'; message: string };

/**
 * Asks the service whether the English matches the Arabic, after the user stops
 * typing. Results are cached per (Arabic, English) pair, and an answer for text
 * that has since changed is thrown away, so a slow reply never shows a wrong verdict.
 */
export function useReview(service: TranslationService, ar: string, en: string, glossary: readonly GlossaryTerm[], delayMs: number): ReviewState {
  const [state, setState] = useState<ReviewState>({ kind: 'idle' });
  const cache = useRef(new Map<string, ReviewResult>());

  useEffect(() => {
    if (en.trim() === '') {
      setState({ kind: 'idle' });
      return;
    }
    const cacheKey = `${ar}\u0000${en}`;
    const hit = cache.current.get(cacheKey);
    if (hit) {
      setState({ kind: 'done', result: hit });
      return;
    }
    setState({ kind: 'checking' });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      service.review(ar, en, glossary, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          cache.current.set(cacheKey, result);
          setState({ kind: 'done', result });
        },
        (e: unknown) => {
          if (controller.signal.aborted) return;
          setState({ kind: 'error', message: e instanceof Error ? e.message : 'Review failed.' });
        },
      );
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [service, ar, en, glossary, delayMs]);

  return state;
}
