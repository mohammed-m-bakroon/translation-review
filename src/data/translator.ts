import type { GlossaryTerm } from '../domain';

export type Verdict = 'correct' | 'problem' | 'unsure';

export interface ReviewResult {
  verdict: Verdict;
  /** One or two sentences a human can act on. */
  summary: string;
  /** A corrected English text, when the reviewer has one. */
  suggestion?: string;
}

/**
 * Machine translation and meaning review. Kept behind an interface so the UI
 * never depends on a vendor, and so the API key stays on a server you control.
 */
export interface TranslationService {
  /** Shown to the user so they know what produced a verdict. */
  readonly label: string;
  translate(ar: string, glossary: readonly GlossaryTerm[], signal?: AbortSignal): Promise<string>;
  review(ar: string, en: string, glossary: readonly GlossaryTerm[], signal?: AbortSignal): Promise<ReviewResult>;
}

export const isVerdict = (v: unknown): v is Verdict => v === 'correct' || v === 'problem' || v === 'unsure';
