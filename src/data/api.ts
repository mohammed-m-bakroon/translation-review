import type { GlossaryTerm, TranslationItem } from '../domain';

/**
 * The only thing the UI knows about persistence. Swap the adapter without
 * touching a component: `createMockApi()` for the demo, `createHttpApi()` for a
 * real backend (for example a Laravel API).
 */
export interface TranslationApi {
  load(): Promise<{ items: TranslationItem[]; glossary: GlossaryTerm[] }>;
  /** Create or update one item. */
  save(item: TranslationItem): Promise<void>;
  remove(id: string): Promise<void>;
  /** Replace the whole list, used by import. */
  replaceAll(items: TranslationItem[]): Promise<void>;
  saveGlossary(glossary: GlossaryTerm[]): Promise<void>;
}
