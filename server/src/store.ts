import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { HttpError } from './errors';
import type { Snapshot } from './save';
import { parseSnapshot } from './validate';

export interface Store {
  /** Runs `fn` alone. Concurrent calls wait, so two saves cannot drop each other's writes. */
  update<T>(fn: (current: Snapshot) => { snapshot: Snapshot; result: T } | Promise<{ snapshot: Snapshot; result: T }>): Promise<T>;
  read(): Promise<Snapshot>;
}

export function createMemoryStore(seed: Snapshot): Store {
  return createStore(async () => structuredClone(seed), async () => undefined);
}

export function createFileStore(file: string, seed: Snapshot): Store {
  return createStore(
    async () => {
      try {
        const raw = await readFile(file, 'utf8');
        try {
          return parseSnapshot(JSON.parse(raw) as unknown);
        } catch (error) {
          if (error instanceof HttpError && error.status === 422) throw new HttpError(500, 'Stored data could not be read.');
          throw new HttpError(500, 'Stored data could not be read.');
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (isMissing(error)) {
          const fresh = structuredClone(seed);
          await atomicWrite(file, `${JSON.stringify(fresh, null, 2)}\n`);
          return fresh;
        }
        throw new HttpError(500, 'Stored data could not be read.');
      }
    },
    (snapshot) => atomicWrite(file, `${JSON.stringify(snapshot, null, 2)}\n`),
  );
}

function createStore(load: () => Promise<Snapshot>, persist: (snapshot: Snapshot) => Promise<void>): Store {
  let cache: Snapshot | null = null;
  let queue: Promise<void> = Promise.resolve();
  const update = <T>(fn: (current: Snapshot) => { snapshot: Snapshot; result: T } | Promise<{ snapshot: Snapshot; result: T }>): Promise<T> => {
    const run = queue.then(async () => {
      cache ??= await load();
      const current = cache;
      const out = await fn(structuredClone(current));
      if (JSON.stringify(out.snapshot) !== JSON.stringify(current)) {
        cache = out.snapshot;
        await persist(cache);
      }
      return out.result;
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return {
    update,
    read: () => update((snapshot) => ({ snapshot, result: snapshot })),
  };
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, contents, 'utf8');
  try {
    await rename(tmp, file);
  } catch {
    await unlink(file).catch(() => undefined);
    await rename(tmp, file);
  }
}

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT';
