import { GLOSSARY, SEED_ITEMS } from './seed';
import type { TranslationApi } from './api';
import type { GlossaryTerm, TranslationItem } from '../domain';

const KEY = 'translation-review:v1';

interface Stored {
  items: TranslationItem[];
  glossary: GlossaryTerm[];
}

function read(): Stored {
  const fallback: Stored = { items: SEED_ITEMS, glossary: GLOSSARY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : fallback.items,
      glossary: Array.isArray(parsed.glossary) ? parsed.glossary : fallback.glossary,
    };
  } catch {
    return fallback; // private mode, blocked storage or corrupt JSON: start from seed data
  }
}

function write(value: Stored): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the demo still works, it just will not persist */
  }
}

/** Demo adapter: seed data plus localStorage. No backend needed. */
export function createMockApi(latencyMs = 150): TranslationApi {
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
  // Every write reads and writes synchronously after the wait, so writes cannot interleave.
  return {
    async load() {
      await wait();
      return read();
    },
    async save(item) {
      await wait();
      const s = read();
      const exists = s.items.some((i) => i.id === item.id);
      write({ ...s, items: exists ? s.items.map((i) => (i.id === item.id ? item : i)) : [...s.items, item] });
    },
    async remove(id) {
      await wait();
      const s = read();
      write({ ...s, items: s.items.filter((i) => i.id !== id) });
    },
    async replaceAll(items) {
      await wait();
      write({ ...read(), items });
    },
    async saveGlossary(glossary) {
      await wait();
      write({ ...read(), glossary });
    },
  };
}
