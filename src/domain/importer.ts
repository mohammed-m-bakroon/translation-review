import { normalizeArabic } from './arabic';
import type { TranslationItem } from './types';

const KEY = /^[a-z0-9_]+(\.[a-z0-9_-]+)*$/i;

export const isValidKey = (id: string): boolean => KEY.test(id);

export interface ParsedImport {
  items: TranslationItem[];
  /** Human-readable reasons for entries that were not imported. */
  skipped: string[];
}

function flatten(value: unknown, prefix: string, out: Record<string, string>, skipped: string[]): void {
  if (typeof value === 'string') {
    out[prefix] = value;
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out, skipped);
  } else if (prefix) {
    skipped.push(`${prefix}: not a text value`);
  }
}

/**
 * Accepts three shapes:
 *  1. `{ "ar": { key: text }, "en": { key: text } }`  (this app's export)
 *  2. `{ "key": "arabic text" }`                       (flat file)
 *  3. nested Laravel lang files `{ "home": { "title": "..." } }`, flattened to `home.title`
 * Imported English is never auto-approved: it always enters as "draft".
 */
export function parseImport(text: string, now: string): { ok: true; value: ParsedImport } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not valid JSON.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Expected a JSON object of translations.' };
  }

  const skipped: string[] = [];
  const ar: Record<string, string> = {};
  const en: Record<string, string> = {};
  const root = data as Record<string, unknown>;
  const isBilingual = typeof root.ar === 'object' && root.ar !== null && Object.keys(root).every((k) => k === 'ar' || k === 'en');

  if (isBilingual) {
    flatten(root.ar, '', ar, skipped);
    flatten(root.en ?? {}, '', en, skipped);
  } else {
    flatten(root, '', ar, skipped);
  }

  const items: TranslationItem[] = [];
  for (const [id, arabic] of Object.entries(ar)) {
    if (!isValidKey(id)) {
      skipped.push(`${id}: invalid key (use letters, numbers, dots, _ or -)`);
      continue;
    }
    if (!arabic.trim()) {
      skipped.push(`${id}: empty Arabic text`);
      continue;
    }
    const english = en[id] ?? '';
    items.push({
      id,
      group: id.includes('.') ? id.slice(0, id.indexOf('.')) : 'general',
      ar: arabic,
      en: english,
      status: english.trim() ? 'draft' : 'missing',
      updatedAt: now,
    });
  }
  if (items.length === 0) return { ok: false, error: 'No valid translations were found in this file.' };
  return { ok: true, value: { items, skipped } };
}

export interface MergeResult {
  items: TranslationItem[];
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
}

const sameArabic = (a: string, b: string) => normalizeArabic(a.trim()) === normalizeArabic(b.trim());

/**
 * Merges imported strings into the current list. If the Arabic source of an
 * existing string changed, its English is kept but sent back to "draft", since
 * an old approval no longer applies to different source text.
 */
export function mergeImport(
  existing: readonly TranslationItem[],
  incoming: readonly TranslationItem[],
  mode: 'merge' | 'replace',
  now: string,
): MergeResult {
  if (mode === 'replace') {
    return { items: [...incoming], added: incoming.length, updated: 0, unchanged: 0, removed: existing.length };
  }
  const byId = new Map(existing.map((i) => [i.id, i]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const next of incoming) {
    const current = byId.get(next.id);
    if (!current) {
      byId.set(next.id, next);
      added += 1;
      continue;
    }
    const arabicChanged = !sameArabic(current.ar, next.ar);
    const fillsEnglish = current.en.trim() === '' && next.en.trim() !== '';
    if (!arabicChanged && !fillsEnglish) {
      unchanged += 1;
      continue;
    }
    const { reviewer: _dropped, ...rest } = current;
    const en = fillsEnglish ? next.en : current.en;
    byId.set(next.id, { ...rest, ar: next.ar, en, status: en.trim() ? 'draft' : 'missing', updatedAt: now });
    updated += 1;
  }
  return { items: [...byId.values()], added, updated, unchanged, removed: 0 };
}

/** Returns an error message, or null when the new string can be added. */
export function validateNewItem(id: string, ar: string, existing: readonly TranslationItem[]): string | null {
  if (!isValidKey(id.trim())) return 'Key must use letters, numbers, dots, _ or - (for example home.title).';
  if (existing.some((i) => i.id === id.trim())) return `The key "${id.trim()}" already exists.`;
  if (!ar.trim()) return 'Arabic text is required.';
  return null;
}

export function newItem(id: string, ar: string, en: string, now: string): TranslationItem {
  const key = id.trim();
  return {
    id: key,
    group: key.includes('.') ? key.slice(0, key.indexOf('.')) : 'general',
    ar: ar.trim(),
    en: en.trim(),
    status: en.trim() ? 'draft' : 'missing',
    updatedAt: now,
  };
}
