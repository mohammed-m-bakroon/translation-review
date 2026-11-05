import { normalizeArabic } from './arabic';
import type { Filters, Status, TranslationItem } from './types';
import { STATUSES } from './types';

export const DEFAULT_FILTERS: Filters = { status: 'all', group: 'all', query: '' };

export function filterItems(items: readonly TranslationItem[], filters: Filters): TranslationItem[] {
  const q = filters.query.trim().toLowerCase();
  const qAr = normalizeArabic(filters.query.trim());
  return items.filter((item) => {
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.group !== 'all' && item.group !== filters.group) return false;
    if (!q) return true;
    return (
      item.id.toLowerCase().includes(q) ||
      item.en.toLowerCase().includes(q) ||
      normalizeArabic(item.ar).includes(qAr)
    );
  });
}

export const groupsOf = (items: readonly TranslationItem[]): string[] =>
  [...new Set(items.map((i) => i.group))].sort();

export interface Summary {
  total: number;
  counts: Record<Status, number>;
  /** Share of strings that are approved, 0 to 100. */
  approvedPercent: number;
}

export function summarize(items: readonly TranslationItem[]): Summary {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const item of items) counts[item.status] += 1;
  const total = items.length;
  return { total, counts, approvedPercent: total === 0 ? 0 : Math.round((counts.approved / total) * 100) };
}
