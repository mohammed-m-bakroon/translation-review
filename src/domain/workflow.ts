import { hasErrors, validate } from './checks';
import type { GlossaryTerm, Status, TranslationItem } from './types';

/**
 * Allowed status transitions. Anything not listed is rejected, which keeps the
 * review process honest: nothing reaches "approved" without being reviewed.
 */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  missing: [],
  draft: ['reviewed'],
  reviewed: ['approved', 'draft'],
  approved: ['draft'],
};

export type TransitionResult =
  | { ok: true; item: TranslationItem }
  | { ok: false; reason: string };

export const allowedTransitions = (from: Status): readonly Status[] => TRANSITIONS[from];

/**
 * Applies an edit to the English text. Any edit invalidates earlier sign-off, so
 * the item goes back to "draft" (or "missing" when the text is cleared).
 */
export function applyEdit(item: TranslationItem, en: string, now: string): TranslationItem {
  if (en === item.en) return item;
  const { reviewer: _r, machine: _m, ...rest } = item;
  return { ...rest, en, status: en.trim() === '' ? 'missing' : 'draft', updatedAt: now };
}

/** Stores a machine translation as an unapproved draft that is clearly marked as machine-made. */
export function applyMachineTranslation(item: TranslationItem, en: string, now: string): TranslationItem {
  const { reviewer: _r, ...rest } = item;
  return { ...rest, en: en.trim(), status: en.trim() === '' ? 'missing' : 'draft', machine: true, updatedAt: now };
}

export function transition(
  item: TranslationItem,
  to: Status,
  glossary: readonly GlossaryTerm[],
  now: string,
  reviewer = 'reviewer',
): TransitionResult {
  if (!TRANSITIONS[item.status].includes(to)) {
    return { ok: false, reason: `Cannot move from "${item.status}" to "${to}".` };
  }
  if (to === 'reviewed' || to === 'approved') {
    const issues = validate(item.ar, item.en, glossary);
    if (hasErrors(issues)) {
      return { ok: false, reason: 'Resolve all errors before moving this translation forward.' };
    }
  }
  if (to === 'draft') {
    const { reviewer: _dropped, ...rest } = item;
    return { ok: true, item: { ...rest, status: to, updatedAt: now } };
  }
  return { ok: true, item: { ...item, status: to, updatedAt: now, reviewer } };
}
