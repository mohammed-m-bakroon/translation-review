import type { TranslationItem } from './types';

/**
 * Builds the JSON payload for the app's language files. Only approved English
 * strings are exported, so unreviewed text never ships by accident. Arabic is
 * always included because it is the source of truth.
 */
export function buildExport(items: readonly TranslationItem[]): { ar: Record<string, string>; en: Record<string, string> } {
  const ar: Record<string, string> = {};
  const en: Record<string, string> = {};
  for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    ar[item.id] = item.ar;
    if (item.status === 'approved') en[item.id] = item.en;
  }
  return { ar, en };
}
