import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { applyEdit, applyMachineTranslation, mergeImport, newItem, parseImport, transition, validateNewItem } from '../domain';
import type { GlossaryTerm, MergeResult, Status, TransitionResult, TranslationItem } from '../domain';
import type { TranslationApi } from '../data/api';
import type { TranslationService } from '../data/translator';
import { initialState, reducer } from './store';
import type { State } from './store';
import type { Filters } from '../domain';

interface ContextValue {
  state: State;
  selected: TranslationItem | undefined;
  select(id: string): void;
  setFilters(patch: Partial<Filters>): void;
  editEnglish(id: string, en: string): void;
  moveTo(id: string, to: Status): TransitionResult;
  /** Returns an error message, or null on success. */
  addItem(id: string, ar: string, en: string, autoTranslate?: boolean): string | null;
  service: TranslationService;
  /** Wait before an automatic meaning review starts after typing stops. */
  reviewDelayMs: number;
  /** Machine-translates one string. Resolves to an error message, or null on success. */
  translateItem(id: string): Promise<string | null>;
  /** Translates every string that has no English yet. */
  translateMissing(): Promise<void>;
  dismissNotice(): void;
  removeItem(id: string): void;
  importText(text: string, mode: 'merge' | 'replace'): { ok: true; result: MergeResult; skipped: string[] } | { ok: false; error: string };
  setGlossary(glossary: GlossaryTerm[]): void;
}

const Ctx = createContext<ContextValue | null>(null);

interface Props {
  api: TranslationApi;
  service: TranslationService;
  reviewDelayMs?: number;
  /** Injectable clock keeps timestamps deterministic in tests. */
  now?: () => string;
  children: ReactNode;
}

export function TranslationProvider({ api, service, reviewDelayMs = 700, now = () => new Date().toISOString(), children }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Async work finishes after renders; read the latest list from a ref, never from a stale closure.
  const itemsRef = useRef(state.items);
  itemsRef.current = state.items;
  const glossaryRef = useRef(state.glossary);
  glossaryRef.current = state.glossary;

  useEffect(() => {
    let cancelled = false;
    api
      .load()
      .then(({ items, glossary }) => !cancelled && dispatch({ type: 'loaded', items, glossary }))
      .catch((e: unknown) => !cancelled && dispatch({ type: 'loadFailed', error: e instanceof Error ? e.message : 'Could not load translations.' }));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const persist = useCallback(
    (previous: TranslationItem, next: TranslationItem) => {
      dispatch({ type: 'itemUpdated', item: next });
      api.save(next).then(
        () => dispatch({ type: 'saveSucceeded' }),
        (e: unknown) => dispatch({ type: 'saveFailed', previous, error: e instanceof Error ? e.message : 'Save failed.' }),
      );
    },
    [api],
  );

  /** Whole-list changes keep a snapshot so a failed save can be undone completely. */
  const commitList = useCallback(
    (next: TranslationItem[], call: () => Promise<void>) => {
      const snapshot = { items: state.items, glossary: state.glossary };
      dispatch({ type: 'itemsReplaced', items: next });
      call().then(
        () => dispatch({ type: 'saveSucceeded' }),
        (e: unknown) => dispatch({ type: 'restore', ...snapshot, error: e instanceof Error ? e.message : 'Save failed.' }),
      );
    },
    [state.items, state.glossary],
  );

  /** Returns an error message, or null. Skips silently if the user edited the string while we waited. */
  const runTranslate = useCallback(
    async (id: string): Promise<string | null> => {
      const start = itemsRef.current.find((i) => i.id === id);
      if (!start) return 'String not found.';
      dispatch({ type: 'translating', id, on: true });
      try {
        const en = await service.translate(start.ar, glossaryRef.current);
        const current = itemsRef.current.find((i) => i.id === id);
        if (!current) return null; // deleted meanwhile
        if (current.en.trim() !== '' || current.ar !== start.ar) return null; // a human got there first: never overwrite
        persist(current, applyMachineTranslation(current, en, now()));
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Translation failed.';
      } finally {
        dispatch({ type: 'translating', id, on: false });
      }
    },
    [service, persist, now],
  );

  const value = useMemo<ContextValue>(() => {
    const find = (id: string) => state.items.find((i) => i.id === id);
    return {
      state,
      selected: state.items.find((i) => i.id === state.selectedId),
      select: (id) => dispatch({ type: 'select', id }),
      setFilters: (patch) => dispatch({ type: 'filters', patch }),
      editEnglish(id, en) {
        const item = find(id);
        if (!item) return;
        const next = applyEdit(item, en, now());
        if (next !== item) persist(item, next);
      },
      moveTo(id, to) {
        const item = find(id);
        if (!item) return { ok: false, reason: 'Item not found.' };
        const result = transition(item, to, state.glossary, now());
        if (result.ok) persist(item, result.item);
        return result;
      },
      addItem(id, ar, en, autoTranslate = false) {
        const error = validateNewItem(id, ar, state.items);
        if (error) return error;
        const item = newItem(id, ar, en, now());
        commitList([...state.items, item], () => api.save(item));
        dispatch({ type: 'select', id: item.id });
        if (autoTranslate && item.en === '') {
          // The new item reaches the ref on the next render; wait one tick for it.
          setTimeout(() => {
            void runTranslate(item.id).then((message) => {
              if (message) dispatch({ type: 'notice', text: `"${item.id}" was added, but could not be translated automatically: ${message}` });
            });
          }, 0);
        }
        return null;
      },
      service,
      reviewDelayMs,
      translateItem: runTranslate,
      async translateMissing() {
        const ids = itemsRef.current.filter((i) => i.en.trim() === '').map((i) => i.id);
        let done = 0;
        let firstError: string | null = null;
        for (const id of ids) {
          const message = await runTranslate(id);
          if (message) {
            firstError = message;
            break; // the same failure would repeat for every string
          }
          done += 1;
        }
        dispatch({
          type: 'notice',
          text: firstError ? `Translated ${done} of ${ids.length}. Stopped: ${firstError}` : `Translated ${done} string${done === 1 ? '' : 's'}. Review them before approving.`,
        });
      },
      dismissNotice: () => dispatch({ type: 'notice', text: undefined }),
      removeItem(id) {
        commitList(state.items.filter((i) => i.id !== id), () => api.remove(id));
      },
      importText(text, mode) {
        const parsed = parseImport(text, now());
        if (!parsed.ok) return parsed;
        const result = mergeImport(state.items, parsed.value.items, mode, now());
        commitList(result.items, () => api.replaceAll(result.items));
        return { ok: true, result, skipped: parsed.value.skipped };
      },
      setGlossary(glossary) {
        const previous = state.glossary;
        dispatch({ type: 'glossaryReplaced', glossary });
        api.saveGlossary(glossary).then(
          () => dispatch({ type: 'saveSucceeded' }),
          (e: unknown) => dispatch({ type: 'restore', items: state.items, glossary: previous, error: e instanceof Error ? e.message : 'Save failed.' }),
        );
      },
    };
  }, [state, now, persist, commitList, api, service, reviewDelayMs, runTranslate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTranslations(): ContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTranslations must be used inside <TranslationProvider>');
  return ctx;
}
