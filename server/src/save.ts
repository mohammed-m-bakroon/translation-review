import { newItem } from '../../src/domain/importer';
import { applyEdit, applyMachineTranslation, transition } from '../../src/domain/workflow';
import type { GlossaryTerm, TranslationItem } from '../../src/domain/types';
import { HttpError } from './errors';

export interface Snapshot {
  items: TranslationItem[];
  glossary: GlossaryTerm[];
}

/** A brand-new string follows the same shape the dashboard creates: unapproved, no reviewer. */
export function assertCreate(next: TranslationItem): void {
  const fresh = newItem(next.id, next.ar, next.en, next.updatedAt);
  if (!equalItem(fresh, next)) throw new HttpError(422, 'New strings start as an unapproved draft or as missing.');
}

/**
 * A single-item save is either an edit (which returns the string to draft), a machine draft,
 * or one step from the workflow table. Skipping "reviewed" on the way to "approved" is rejected.
 */
export function assertUpdate(previous: TranslationItem, next: TranslationItem, glossary: readonly GlossaryTerm[]): void {
  if (next.ar !== previous.ar || next.group !== previous.group) {
    throw new HttpError(422, 'The Arabic source and section can only change through import.');
  }
  if (next.en !== previous.en) {
    const edited = applyEdit(previous, next.en, next.updatedAt);
    const machine = applyMachineTranslation(previous, next.en, next.updatedAt);
    if (equalItem(edited, next) || equalItem(machine, next)) return;
    throw new HttpError(422, 'Editing the English sends the string back to draft.');
  }
  if (equalItem(previous, next)) return;
  if (next.status === previous.status) throw new HttpError(422, 'This change is not an allowed review step.');
  const result = transition(previous, next.status, glossary, next.updatedAt, next.reviewer ?? 'reviewer');
  if (!result.ok) throw new HttpError(422, result.reason);
  if (!equalItem(result.item, next)) throw new HttpError(422, 'This change is not an allowed review step.');
}

export function saveItem(current: Snapshot, id: string, next: TranslationItem): Snapshot {
  if (next.id !== id) throw new HttpError(422, 'The id in the body must match the URL.');
  const index = current.items.findIndex((item) => item.id === id);
  if (index === -1) {
    assertCreate(next);
    return { ...current, items: [...current.items, next] };
  }
  const previous = current.items[index]!;
  assertUpdate(previous, next, current.glossary);
  const items = current.items.slice();
  items[index] = next;
  return { ...current, items };
}

/**
 * Import replaces the list. An item that is not an exact copy of what is stored
 * cannot arrive already reviewed or approved: a changed Arabic source has to be read again.
 */
export function replaceItems(current: Snapshot, incoming: readonly TranslationItem[]): Snapshot {
  const byId = new Map(current.items.map((item) => [item.id, item]));
  for (const next of incoming) {
    const previous = byId.get(next.id);
    if (previous && equalItem(previous, next)) continue;
    if (next.status !== 'draft' && next.status !== 'missing') {
      throw new HttpError(422, `"${next.id}" can only be imported as draft or missing.`);
    }
    if ((next.status === 'missing') !== (next.en.trim() === '')) {
      throw new HttpError(422, `"${next.id}" has a status that does not match its English text.`);
    }
    if (next.reviewer) throw new HttpError(422, `"${next.id}" cannot be imported with a reviewer.`);
  }
  return { ...current, items: [...incoming] };
}

export function equalItem(a: TranslationItem, b: TranslationItem): boolean {
  return (
    a.id === b.id &&
    a.group === b.group &&
    a.ar === b.ar &&
    a.en === b.en &&
    a.status === b.status &&
    a.updatedAt === b.updatedAt &&
    a.reviewer === b.reviewer &&
    a.machine === b.machine
  );
}
