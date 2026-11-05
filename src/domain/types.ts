export const STATUSES = ['missing', 'draft', 'reviewed', 'approved'] as const;
export type Status = (typeof STATUSES)[number];

export interface TranslationItem {
  /** Stable key, e.g. `home.hero.title`. */
  id: string;
  /** Section of the site the string belongs to. */
  group: string;
  ar: string;
  en: string;
  status: Status;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  reviewer?: string;
  /** True while the English is an unedited machine draft. A human edit clears it. */
  machine?: boolean;
}

export interface GlossaryTerm {
  ar: string;
  en: string;
  note?: string;
}

export type Severity = 'error' | 'warning';

export interface Issue {
  code: 'glossary' | 'placeholder' | 'length';
  severity: Severity;
  message: string;
}

export interface Filters {
  status: Status | 'all';
  group: string | 'all';
  query: string;
}
