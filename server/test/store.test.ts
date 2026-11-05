import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GLOSSARY, SEED_ITEMS } from '../../src/data/seed';
import { newItem } from '../../src/domain/importer';
import { createFileStore, createMemoryStore } from '../src/store';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('file store', () => {
  it('writes the seed when no file exists and reads it back', async () => {
    const file = await tempFile();
    const seed = { items: SEED_ITEMS, glossary: GLOSSARY };
    const first = createFileStore(file, seed);
    expect((await first.read()).items.map((item) => item.id)).toEqual(SEED_ITEMS.map((item) => item.id));
    const second = createFileStore(file, { items: [], glossary: [] });
    expect((await second.read()).glossary).toEqual(GLOSSARY);
  });

  it('refuses to replace a corrupt file with the seed', async () => {
    const file = await tempFile();
    await writeFile(file, '{', 'utf8');
    await expect(createFileStore(file, { items: [], glossary: [] }).read()).rejects.toThrow(/could not be read/);
    expect(await readFile(file, 'utf8')).toBe('{');
  });

  it('applies concurrent saves one after another', async () => {
    const store = createMemoryStore({ items: [], glossary: [] });
    const a = newItem('home.a', 'أول', 'First', '2026-11-04T08:00:00.000Z');
    const b = newItem('home.b', 'ثان', 'Second', '2026-11-04T08:00:00.000Z');
    await Promise.all([
      store.update((current) => ({ snapshot: { ...current, items: [...current.items, a] }, result: 'a' })),
      store.update((current) => ({ snapshot: { ...current, items: [...current.items, b] }, result: 'b' })),
    ]);
    expect((await store.read()).items.map((item) => item.id).sort()).toEqual(['home.a', 'home.b']);
  });
});

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'translation-review-'));
  dirs.push(dir);
  return join(dir, 'store.json');
}
