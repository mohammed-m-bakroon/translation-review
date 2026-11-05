import { DEFAULT_FILTERS } from '../domain';
import type { Filters, GlossaryTerm, TranslationItem } from '../domain';

export interface State {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  items: TranslationItem[];
  glossary: GlossaryTerm[];
  selectedId: string | null;
  filters: Filters;
  /** Latest save failure, shown as a banner. Cleared on the next successful save. */
  saveError?: string;
  /** Ids with a translation request in flight. */
  translating: string[];
  /** Neutral or failure message from translation, shown as a dismissible banner. */
  notice?: string;
}

export type Action =
  | { type: 'loaded'; items: TranslationItem[]; glossary: GlossaryTerm[] }
  | { type: 'loadFailed'; error: string }
  | { type: 'select'; id: string }
  | { type: 'filters'; patch: Partial<Filters> }
  | { type: 'itemUpdated'; item: TranslationItem }
  | { type: 'saveFailed'; error: string; previous: TranslationItem }
  | { type: 'itemsReplaced'; items: TranslationItem[] }
  | { type: 'glossaryReplaced'; glossary: GlossaryTerm[] }
  | { type: 'restore'; items: TranslationItem[]; glossary: GlossaryTerm[]; error: string }
  | { type: 'saveSucceeded' }
  | { type: 'translating'; id: string; on: boolean }
  | { type: 'notice'; text: string | undefined };

export const initialState: State = {
  status: 'loading',
  items: [],
  glossary: [],
  selectedId: null,
  filters: DEFAULT_FILTERS,
  translating: [],
};

const replace = (items: TranslationItem[], next: TranslationItem) =>
  items.map((i) => (i.id === next.id ? next : i));

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'ready', items: action.items, glossary: action.glossary, selectedId: action.items[0]?.id ?? null };
    case 'loadFailed':
      return { ...state, status: 'error', error: action.error };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'filters':
      return { ...state, filters: { ...state.filters, ...action.patch } };
    case 'itemUpdated': // optimistic: UI updates first, the save runs in the background
      return { ...state, items: replace(state.items, action.item) };
    case 'saveFailed': // roll back so the UI never shows something that was not stored
      return { ...state, items: replace(state.items, action.previous), saveError: action.error };
    case 'itemsReplaced': { // add, delete and import: keep the selection valid
      const selectedId = action.items.some((i) => i.id === state.selectedId) ? state.selectedId : (action.items[0]?.id ?? null);
      return { ...state, items: action.items, selectedId };
    }
    case 'glossaryReplaced':
      return { ...state, glossary: action.glossary };
    case 'restore': { // roll back a whole-list change that failed to save
      const selectedId = action.items.some((i) => i.id === state.selectedId) ? state.selectedId : (action.items[0]?.id ?? null);
      return { ...state, items: action.items, glossary: action.glossary, selectedId, saveError: action.error };
    }
    case 'translating':
      return { ...state, translating: action.on ? [...new Set([...state.translating, action.id])] : state.translating.filter((i) => i !== action.id) };
    case 'notice':
      return { ...state, notice: action.text };
    case 'saveSucceeded':
      return state.saveError ? { ...state, saveError: undefined } : state;
  }
}
