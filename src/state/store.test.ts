import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './store';
import type { TranslationItem } from '../domain';

const item = (id: string, en = 'x'): TranslationItem => ({ id, group: 'g', ar: 'ا', en, status: 'draft', updatedAt: 't' });

describe('reducer', () => {
  const loaded = reducer(initialState, { type: 'loaded', items: [item('a'), item('b')], glossary: [] });

  it('selects the first item once loaded', () => {
    expect(loaded).toMatchObject({ status: 'ready', selectedId: 'a' });
  });
  it('handles an empty load without a selection', () => {
    expect(reducer(initialState, { type: 'loaded', items: [], glossary: [] }).selectedId).toBeNull();
  });
  it('records a load failure', () => {
    expect(reducer(initialState, { type: 'loadFailed', error: 'boom' })).toMatchObject({ status: 'error', error: 'boom' });
  });
  it('merges filter patches', () => {
    const s = reducer(loaded, { type: 'filters', patch: { query: 'q' } });
    expect(s.filters).toEqual({ status: 'all', group: 'all', query: 'q' });
  });
  it('applies an optimistic update, then rolls back on a failed save', () => {
    const before = loaded.items[0]!;
    const after = reducer(loaded, { type: 'itemUpdated', item: item('a', 'new') });
    expect(after.items[0]?.en).toBe('new');
    const rolledBack = reducer(after, { type: 'saveFailed', previous: before, error: 'offline' });
    expect(rolledBack.items[0]).toBe(before);
    expect(rolledBack.saveError).toBe('offline');
    expect(reducer(rolledBack, { type: 'saveSucceeded' }).saveError).toBeUndefined();
  });
});
