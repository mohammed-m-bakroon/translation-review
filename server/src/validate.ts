import { isValidKey } from '../../src/domain/importer';
import { STATUSES } from '../../src/domain/types';
import type { GlossaryTerm, Status, TranslationItem } from '../../src/domain/types';
import { HttpError } from './errors';

const GROUP = /^[A-Za-z0-9_-]{1,100}$/;

export function parseItem(value: unknown): TranslationItem {
  const record = asRecord(value, 'Each translation must be an object.');
  const id = requireString(record.id, 'id', 200);
  if (!isValidKey(id)) throw new HttpError(422, `Invalid key "${id}". Use letters, numbers, dots, _ or -.`);
  const group = requireString(record.group, 'group', 100);
  if (!GROUP.test(group)) throw new HttpError(422, `Invalid section "${group}".`);
  const ar = requireString(record.ar, 'ar', 8000);
  if (!ar.trim()) throw new HttpError(422, 'Arabic text is required.');
  const en = requireString(record.en, 'en', 8000);
  const status = requireStatus(record.status);
  const updatedAt = requireTimestamp(record.updatedAt);
  const item: TranslationItem = { id, group, ar, en, status, updatedAt };
  if ('reviewer' in record && record.reviewer !== undefined && record.reviewer !== null && record.reviewer !== '') {
    item.reviewer = requireString(record.reviewer, 'reviewer', 120);
  }
  if (record.machine !== undefined && record.machine !== false) {
    if (record.machine !== true) throw new HttpError(422, 'machine must be a boolean.');
    item.machine = true;
  }
  return item;
}

export function parseItems(value: unknown): TranslationItem[] {
  if (!Array.isArray(value)) throw new HttpError(422, 'Translations must be an array.');
  if (value.length > 5000) throw new HttpError(422, 'Too many translations.');
  const items = value.map((entry) => parseItem(entry));
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new HttpError(422, `Duplicate id "${item.id}".`);
    ids.add(item.id);
  }
  return items;
}

export function parseGlossary(value: unknown): GlossaryTerm[] {
  if (!Array.isArray(value)) throw new HttpError(422, 'Glossary must be an array.');
  if (value.length > 200) throw new HttpError(422, 'Glossary cannot have more than 200 terms.');
  const seen = new Set<string>();
  return value.map((entry) => {
    const record = asRecord(entry, 'Each glossary term must be an object.');
    const ar = requireString(record.ar, 'glossary.ar', 200).trim();
    const en = requireString(record.en, 'glossary.en', 200).trim();
    if (!ar || !en) throw new HttpError(422, 'Glossary terms need both Arabic and English.');
    if (seen.has(ar)) throw new HttpError(422, `Duplicate glossary term "${ar}".`);
    seen.add(ar);
    const term: GlossaryTerm = { ar, en };
    if ('note' in record && record.note !== undefined && record.note !== null && record.note !== '') {
      term.note = requireString(record.note, 'glossary.note', 300).trim();
    }
    return term;
  });
}

export function parseTranslateBody(value: unknown): { text: string; glossary: GlossaryTerm[] } {
  const record = asRecord(value, 'Body must be an object.');
  const text = requireString(record.text, 'text', 4000).trim();
  if (!text) throw new HttpError(422, 'text is required.');
  const glossary = record.glossary === undefined ? [] : parseGlossary(record.glossary);
  return { text, glossary };
}

export function parseReviewBody(value: unknown): { ar: string; en: string; glossary: GlossaryTerm[] } {
  const record = asRecord(value, 'Body must be an object.');
  const ar = requireString(record.ar, 'ar', 4000).trim();
  const en = requireString(record.en, 'en', 4000).trim();
  if (!ar || !en) throw new HttpError(422, 'Both ar and en are required.');
  const glossary = record.glossary === undefined ? [] : parseGlossary(record.glossary);
  return { ar, en, glossary };
}

export function parseSnapshot(value: unknown): { items: TranslationItem[]; glossary: GlossaryTerm[] } {
  const record = asRecord(value, 'Stored data could not be read.');
  return { items: parseItems(record.items), glossary: parseGlossary(record.glossary) };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, message);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new HttpError(422, `${field} must be a string.`);
  if (value.length > max) throw new HttpError(422, `${field} is too long.`);
  return value;
}

function requireStatus(value: unknown): Status {
  if (typeof value !== 'string' || !(STATUSES as readonly string[]).includes(value)) {
    throw new HttpError(422, 'status must be missing, draft, reviewed or approved.');
  }
  return value as Status;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new HttpError(422, 'updatedAt must be an ISO timestamp.');
  }
  return value;
}
