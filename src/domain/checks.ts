import { normalizeArabic } from './arabic';
import type { GlossaryTerm, Issue } from './types';

/** Laravel (`:name`) and ICU/i18next (`{name}`, `{{name}}`) placeholders. */
const PLACEHOLDER = /:[a-z_][a-z0-9_]*|\{\{?\s*[\w.]+\s*\}?\}/gi;

export function extractPlaceholders(text: string): string[] {
  return [...new Set((text.match(PLACEHOLDER) ?? []).map((p) => p.trim()))].sort();
}

export function checkGlossary(ar: string, en: string, glossary: readonly GlossaryTerm[]): Issue[] {
  if (!en.trim()) return [];
  const source = normalizeArabic(ar);
  const target = en.toLowerCase();
  return glossary
    .filter((term) => source.includes(normalizeArabic(term.ar)) && !target.includes(term.en.toLowerCase()))
    .map((term) => ({
      code: 'glossary' as const,
      severity: 'error' as const,
      message: `"${term.ar}" must appear as "${term.en}".${term.note ? ` ${term.note}` : ''}`,
    }));
}

export function checkPlaceholders(ar: string, en: string): Issue[] {
  if (!en.trim()) return [];
  const expected = extractPlaceholders(ar);
  const actual = new Set(extractPlaceholders(en));
  const missing = expected.filter((p) => !actual.has(p));
  const extra = [...actual].filter((p) => !expected.includes(p));
  const issues: Issue[] = [];
  if (missing.length > 0) {
    issues.push({ code: 'placeholder', severity: 'error', message: `Missing placeholder: ${missing.join(', ')}.` });
  }
  if (extra.length > 0) {
    issues.push({ code: 'placeholder', severity: 'error', message: `Unexpected placeholder: ${extra.join(', ')}.` });
  }
  return issues;
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Warns when the English is suspiciously short or long compared with the Arabic.
 * Arabic attaches small words (و، ب، ل) to the next word, so English normally has
 * at least as many words. Fewer English words usually means something was dropped,
 * for example "بروفايل غزة" translated as just "Gaza".
 */
export function checkLength(ar: string, en: string): Issue[] {
  if (en.trim() === '') return [];
  const arWords = words(ar);
  if (arWords >= 2 && words(en) < arWords * 0.6) {
    return [{ code: 'length', severity: 'warning', message: 'English has far fewer words than the Arabic. A word may be missing.' }];
  }
  const a = ar.trim().length;
  const e = en.trim().length;
  if (a < 20) return [];
  const ratio = e / a;
  if (ratio > 2.2) return [{ code: 'length', severity: 'warning', message: 'English is much longer than the Arabic. Check it for padding.' }];
  if (ratio < 0.45) return [{ code: 'length', severity: 'warning', message: 'English is much shorter than the Arabic. Something may be missing.' }];
  return [];
}

export function validate(ar: string, en: string, glossary: readonly GlossaryTerm[]): Issue[] {
  return [...checkGlossary(ar, en, glossary), ...checkPlaceholders(ar, en), ...checkLength(ar, en)];
}

export const hasErrors = (issues: readonly Issue[]): boolean => issues.some((i) => i.severity === 'error');
