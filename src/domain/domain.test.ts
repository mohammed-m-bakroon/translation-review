import { describe, expect, it } from 'vitest';
import {
  allowedTransitions, applyEdit, buildExport, checkGlossary, checkLength, checkPlaceholders,
  extractPlaceholders, filterItems, DEFAULT_FILTERS, groupsOf, hasErrors, normalizeArabic,
  summarize, transition, validate,
} from './index';
import type { GlossaryTerm, TranslationItem } from './types';

const NOW = '2026-11-04T10:00:00.000Z';
const glossary: GlossaryTerm[] = [
  { ar: 'منصة صوت', en: 'Sawt' },
  { ar: 'غزة', en: 'Gaza' },
  { ar: 'صناع المحتوى', en: 'content creators' },
];
const make = (over: Partial<TranslationItem> = {}): TranslationItem => ({
  id: 'k', group: 'home', ar: 'من غزة', en: 'From Gaza', status: 'draft', updatedAt: 'old', ...over,
});

describe('normalizeArabic', () => {
  it('removes diacritics and tatweel', () => {
    expect(normalizeArabic('صنّاع')).toBe('صناع');
    expect(normalizeArabic('تـــعاون')).toBe('تعاون');
  });
  it('unifies alef, yeh and teh marbuta variants', () => {
    expect(normalizeArabic('أحمد إبراهيم آمن')).toBe('احمد ابراهيم امن');
    expect(normalizeArabic('على')).toBe(normalizeArabic('علي'));
    expect(normalizeArabic('منصة')).toBe(normalizeArabic('منصه'));
  });
});

describe('placeholders', () => {
  it('extracts Laravel and brace-style placeholders once each', () => {
    expect(extractPlaceholders('Hi :name, {count} left, {{ total }} :name')).toEqual([':name', '{count}', '{{ total }}']);
  });
  it('does not mistake a time like 10:30 or a URL scheme for a placeholder', () => {
    expect(extractPlaceholders('Opens at 10:30 on https://sawtgaza.com')).toEqual([]);
  });
  it('flags missing and unexpected placeholders', () => {
    const issues = checkPlaceholders('شكراً :name بمبلغ :amount', 'Thank you, :name. :extra');
    expect(issues.map((i) => i.message)).toEqual(['Missing placeholder: :amount.', 'Unexpected placeholder: :extra.']);
  });
  it('is quiet when placeholders match, in any order', () => {
    expect(checkPlaceholders('{a} و {b}', '{b} and {a}')).toEqual([]);
  });
  it('is quiet for an empty translation', () => {
    expect(checkPlaceholders('مرحبا :name', '  ')).toEqual([]);
  });
});

describe('glossary', () => {
  it('flags a required term that is missing', () => {
    const issues = checkGlossary('الفريق خلف منصة صوت', 'The team behind the Voice Platform', glossary);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'glossary', severity: 'error' });
  });
  it('matches case-insensitively and ignores diacritics in the source', () => {
    expect(checkGlossary('صنّاع المحتوى', 'Our Content Creators', glossary)).toEqual([]);
  });
  it('ignores terms that are not in the source text', () => {
    expect(checkGlossary('مرحبا', 'Hello', glossary)).toEqual([]);
  });
  it('does not complain about an empty translation', () => {
    expect(checkGlossary('غزة', '', glossary)).toEqual([]);
  });
});

describe('length check', () => {
  const ar = 'نؤمن أن لكل إنسان قصة تستحق أن تُروى حقاً';
  it('warns when English is far too long or too short', () => {
    expect(checkLength(ar, 'x'.repeat(200))[0]?.severity).toBe('warning');
    expect(checkLength(ar, 'Hi')[0]?.severity).toBe('warning');
  });
  it('accepts a proportionate translation and skips very short strings', () => {
    expect(checkLength(ar, 'We believe every person has a story worth telling')).toEqual([]);
    expect(checkLength('ادعم صوت', 'Support Sawt now and forever, please')).toEqual([]);
  });
  it('warnings are not blocking', () => {
    expect(hasErrors(validate(ar, 'Hi', []))).toBe(false);
  });
});

describe('workflow', () => {
  it('only allows the documented transitions', () => {
    expect(allowedTransitions('missing')).toEqual([]);
    expect(allowedTransitions('draft')).toEqual(['reviewed']);
    expect(allowedTransitions('reviewed')).toEqual(['approved', 'draft']);
    expect(allowedTransitions('approved')).toEqual(['draft']);
  });

  it('refuses to skip review', () => {
    const r = transition(make({ status: 'draft' }), 'approved', glossary, NOW);
    expect(r).toEqual({ ok: false, reason: 'Cannot move from "draft" to "approved".' });
  });

  it('moves a clean draft to reviewed and records the reviewer', () => {
    const r = transition(make(), 'reviewed', glossary, NOW, 'Mohammed');
    expect(r).toEqual({ ok: true, item: expect.objectContaining({ status: 'reviewed', reviewer: 'Mohammed', updatedAt: NOW }) });
  });

  it('blocks forward moves while errors exist', () => {
    const bad = make({ ar: 'منصة صوت', en: 'Voice Platform' });
    const r = transition(bad, 'reviewed', glossary, NOW);
    expect(r.ok).toBe(false);
  });

  it('sending back to draft clears the reviewer', () => {
    const r = transition(make({ status: 'approved', reviewer: 'A' }), 'draft', glossary, NOW);
    expect(r.ok && r.item.reviewer).toBeUndefined();
    expect(r.ok && r.item.status).toBe('draft');
  });

  it('an edit invalidates earlier sign-off', () => {
    const next = applyEdit(make({ status: 'approved', reviewer: 'A' }), 'From Gaza!', NOW);
    expect(next).toMatchObject({ status: 'draft', en: 'From Gaza!', updatedAt: NOW });
    expect(next.reviewer).toBeUndefined();
  });

  it('clearing the text makes the item missing', () => {
    expect(applyEdit(make(), '   ', NOW).status).toBe('missing');
  });

  it('returns the same object when nothing changed', () => {
    const item = make();
    expect(applyEdit(item, item.en, NOW)).toBe(item);
  });

  it('does not mutate its input', () => {
    const item = Object.freeze(make({ status: 'approved', reviewer: 'A' }));
    expect(() => applyEdit(item, 'new', NOW)).not.toThrow();
    expect(() => transition(item, 'draft', glossary, NOW)).not.toThrow();
  });
});

describe('filters and summary', () => {
  const items = [
    make({ id: 'home.a', group: 'home', ar: 'أهلاً', en: 'Welcome', status: 'approved' }),
    make({ id: 'about.b', group: 'about', ar: 'صنّاع المحتوى', en: '', status: 'missing' }),
    make({ id: 'about.c', group: 'about', ar: 'نص', en: 'Text', status: 'draft' }),
  ];
  it('filters by status, group and combined', () => {
    expect(filterItems(items, { ...DEFAULT_FILTERS, status: 'draft' }).map((i) => i.id)).toEqual(['about.c']);
    expect(filterItems(items, { ...DEFAULT_FILTERS, group: 'about' })).toHaveLength(2);
    expect(filterItems(items, { status: 'missing', group: 'home', query: '' })).toEqual([]);
  });
  it('searches key, English and Arabic (diacritic-insensitive)', () => {
    expect(filterItems(items, { ...DEFAULT_FILTERS, query: 'WELCOME' })).toHaveLength(1);
    expect(filterItems(items, { ...DEFAULT_FILTERS, query: 'about.' })).toHaveLength(2);
    expect(filterItems(items, { ...DEFAULT_FILTERS, query: 'صناع' }).map((i) => i.id)).toEqual(['about.b']);
  });
  it('lists unique sorted groups', () => {
    expect(groupsOf(items)).toEqual(['about', 'home']);
  });
  it('summarises counts and approved percentage', () => {
    expect(summarize(items)).toEqual({ total: 3, counts: { missing: 1, draft: 1, reviewed: 0, approved: 1 }, approvedPercent: 33 });
    expect(summarize([]).approvedPercent).toBe(0);
  });
});

describe('export', () => {
  it('exports every Arabic string but only approved English, sorted by key', () => {
    const out = buildExport([
      make({ id: 'b', ar: 'ب', en: 'B', status: 'approved' }),
      make({ id: 'a', ar: 'أ', en: 'A', status: 'reviewed' }),
    ]);
    expect(Object.keys(out.ar)).toEqual(['a', 'b']);
    expect(out.en).toEqual({ b: 'B' });
  });
});

describe('word-count check', () => {
  it('warns when English has far fewer words, like "بروفايل غزة" -> "Gaza"', () => {
    const issues = checkLength('بروفايل غزة', 'Gaza');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning' });
  });
  it('accepts normal short translations', () => {
    expect(checkLength('ادعم صوت', 'Support Sawt')).toEqual([]);
    expect(checkLength('تعاون معنا', 'Collaborate with us')).toEqual([]);
    expect(checkLength('الرئيسية', 'Home')).toEqual([]);
  });
});

describe('machine translation', () => {
  it('stores a machine draft without a reviewer and marks it as machine-made', async () => {
    const { applyMachineTranslation } = await import('./index');
    const out = applyMachineTranslation(make({ status: 'missing', en: '' }), ' Gaza Profile ', NOW);
    expect(out).toMatchObject({ en: 'Gaza Profile', status: 'draft', machine: true, updatedAt: NOW });
  });
  it('a human edit clears the machine flag', async () => {
    const { applyMachineTranslation } = await import('./index');
    const machine = applyMachineTranslation(make({ en: '' }), 'Draft', NOW);
    expect(applyEdit(machine, 'Better', NOW).machine).toBeUndefined();
  });
});
