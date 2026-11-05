import { describe, expect, it } from 'vitest';
import { isValidKey, mergeImport, newItem, parseImport, validateNewItem } from './importer';
import type { TranslationItem } from './types';

const NOW = '2026-11-04T10:00:00.000Z';
const parse = (v: unknown) => parseImport(typeof v === 'string' ? v : JSON.stringify(v), NOW);
const item = (over: Partial<TranslationItem> = {}): TranslationItem => ({
  id: 'home.title', group: 'home', ar: 'مرحبا', en: 'Hello', status: 'approved', reviewer: 'A', updatedAt: 'old', ...over,
});

describe('parseImport', () => {
  it('reads a flat Arabic-only file as missing items', () => {
    const r = parse({ 'home.title': 'مرحبا', welcome: 'أهلاً' });
    expect(r.ok && r.value.items).toEqual([
      expect.objectContaining({ id: 'home.title', group: 'home', en: '', status: 'missing' }),
      expect.objectContaining({ id: 'welcome', group: 'general', status: 'missing' }),
    ]);
  });
  it('flattens nested Laravel language files', () => {
    const r = parse({ home: { hero: { title: 'عنوان' } } });
    expect(r.ok && r.value.items[0]?.id).toBe('home.hero.title');
  });
  it('reads the bilingual export and makes English a draft, never approved', () => {
    const r = parse({ ar: { a: 'أ', b: 'ب' }, en: { a: 'A' } });
    expect(r.ok && r.value.items.map((i) => [i.id, i.status])).toEqual([['a', 'draft'], ['b', 'missing']]);
  });
  it('skips bad keys, empty Arabic and non-text values, but keeps the good ones', () => {
    const r = parse({ ok: 'نص', 'bad key!': 'نص', empty: '  ', num: 5 });
    expect(r.ok && r.value.items.map((i) => i.id)).toEqual(['ok']);
    expect(r.ok && r.value.skipped).toHaveLength(3);
  });
  it('rejects invalid JSON, arrays and files with nothing usable', () => {
    expect(parse('{nope')).toEqual({ ok: false, error: 'This is not valid JSON.' });
    expect(parse('[1,2]').ok).toBe(false);
    expect(parse({ a: '' }).ok).toBe(false);
  });
});

describe('mergeImport', () => {
  it('adds new keys and leaves untouched ones alone', () => {
    const r = mergeImport([item()], [item({ id: 'new', ar: 'جديد', en: '', status: 'missing' }), item()], 'merge', NOW);
    expect(r).toMatchObject({ added: 1, updated: 0, unchanged: 1 });
    expect(r.items.find((i) => i.id === 'home.title')?.status).toBe('approved');
  });
  it('sends an approved item back to draft when its Arabic source changed', () => {
    const r = mergeImport([item()], [item({ ar: 'مرحباً بكم', en: '', status: 'missing' })], 'merge', NOW);
    const updated = r.items[0]!;
    expect(r.updated).toBe(1);
    expect(updated).toMatchObject({ ar: 'مرحباً بكم', en: 'Hello', status: 'draft', updatedAt: NOW });
    expect(updated.reviewer).toBeUndefined();
  });
  it('does not treat diacritics-only differences as a change', () => {
    const r = mergeImport([item({ ar: 'صناع' })], [item({ ar: 'صنّاع', en: '', status: 'missing' })], 'merge', NOW);
    expect(r.unchanged).toBe(1);
  });
  it('fills a missing English from the file', () => {
    const r = mergeImport([item({ en: '', status: 'missing', reviewer: undefined })], [item({ status: 'draft' })], 'merge', NOW);
    expect(r.items[0]).toMatchObject({ en: 'Hello', status: 'draft' });
  });
  it('replace mode swaps the whole list', () => {
    const r = mergeImport([item(), item({ id: 'x' })], [item({ id: 'y' })], 'replace', NOW);
    expect(r).toMatchObject({ added: 1, removed: 2 });
    expect(r.items.map((i) => i.id)).toEqual(['y']);
  });
});

describe('new strings', () => {
  it('validates keys, duplicates and Arabic', () => {
    expect(isValidKey('home.hero-title_1')).toBe(true);
    expect(isValidKey('has space')).toBe(false);
    expect(validateNewItem('bad key', 'ن', [])).toMatch(/Key must use/);
    expect(validateNewItem('home.title', 'ن', [item()])).toMatch(/already exists/);
    expect(validateNewItem('k', '  ', [])).toMatch(/Arabic text is required/);
    expect(validateNewItem('k', 'ن', [])).toBeNull();
  });
  it('creates a missing item without English and a draft with English', () => {
    expect(newItem(' a.b ', ' نص ', '', NOW)).toMatchObject({ id: 'a.b', group: 'a', ar: 'نص', status: 'missing' });
    expect(newItem('c', 'ن', 'Text', NOW)).toMatchObject({ group: 'general', status: 'draft' });
  });
});
