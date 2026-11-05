import { describe, expect, it } from 'vitest';
import { newItem } from '../../src/domain/importer';
import { applyEdit, applyMachineTranslation, transition } from '../../src/domain/workflow';
import type { TranslationItem } from '../../src/domain/types';
import type { LanguageModel } from '../src/ai/anthropic';
import { createApp } from '../src/app';
import { createMemoryStore } from '../src/store';

const stamp = '2026-11-04T08:00:00.000Z';
const later = '2026-11-04T09:00:00.000Z';
const hello = newItem('home.hello', 'مرحبا بالعالم', 'Hello world', stamp);

describe('translation API', () => {
  it('stores a new string, an edit, a machine draft and a legal status step', async () => {
    const app = createApp({ store: createMemoryStore({ items: [hello], glossary: [] }), model: null });
    const created = newItem('home.cta', 'ادعم صوت', '', stamp);
    expect((await call(app, 'PUT', '/api/translations/home.cta', created)).status).toBe(204);

    const edited = applyEdit(hello, 'Hello there', later);
    expect((await call(app, 'PUT', '/api/translations/home.hello', edited)).status).toBe(204);

    const machine = applyMachineTranslation(created, 'Support Sawt', later);
    expect((await call(app, 'PUT', '/api/translations/home.cta', machine)).status).toBe(204);

    const reviewed = mustTransition(edited, 'reviewed');
    expect((await call(app, 'PUT', '/api/translations/home.hello', reviewed)).status).toBe(204);

    const body = (await (await call(app, 'GET', '/api/translations')).json()) as { items: TranslationItem[] };
    const saved = body.items.find((item) => item.id === 'home.hello');
    expect(saved).toMatchObject({ status: 'reviewed', en: 'Hello there', reviewer: 'reviewer' });
  });

  it('rejects skipping review, importing an approval, and a mismatched id', async () => {
    const app = createApp({ store: createMemoryStore({ items: [hello], glossary: [] }), model: null });
    const jumped = { ...hello, status: 'approved' as const, reviewer: 'reviewer' };
    expect((await call(app, 'PUT', '/api/translations/home.hello', jumped)).status).toBe(422);

    const imported = newItem('about.title', 'من نحن', 'About us', later);
    const sneaky = { ...imported, status: 'approved' as const, reviewer: 'reviewer' };
    expect((await call(app, 'PUT', '/api/translations', [hello, sneaky])).status).toBe(422);
    expect((await call(app, 'PUT', '/api/translations', [hello, imported])).status).toBe(204);

    expect((await call(app, 'PUT', '/api/translations/other.id', hello)).status).toBe(422);
    expect((await call(app, 'DELETE', '/api/translations/missing.id')).status).toBe(404);
    expect((await call(app, 'DELETE', '/api/translations/home.hello')).status).toBe(204);
  });

  it('saves the glossary and requires a token when one is configured', async () => {
    const app = createApp({
      store: createMemoryStore({ items: [], glossary: [] }),
      model: null,
      token: 'secret',
    });
    expect((await call(app, 'GET', '/api/health')).status).toBe(200);
    expect((await call(app, 'GET', '/api/translations')).status).toBe(401);
    const headers = { authorization: 'Bearer secret' };
    expect((await call(app, 'PUT', '/api/glossary', [{ ar: 'غزة', en: 'Gaza' }], headers)).status).toBe(204);
    expect((await call(app, 'PUT', '/api/glossary', [{ ar: 'غزة', en: 'Gaza' }, { ar: 'غزة', en: 'Ghazza' }], headers)).status).toBe(422);
    const body = (await (await call(app, 'GET', '/api/translations', undefined, headers)).json()) as { glossary: { ar: string; en: string }[] };
    expect(body.glossary).toEqual([{ ar: 'غزة', en: 'Gaza' }]);
  });
});

describe('AI routes', () => {
  it('translates through the model and rejects a dropped placeholder or a bad reply', async () => {
    const { model, calls } = scripted(async ({ user }) => {
      if (user.includes(':name')) return JSON.stringify({ translation: 'Thank you' });
      return 'Note: {"translation":" Hello "}';
    });
    const app = createApp({ store: createMemoryStore({ items: [], glossary: [] }), model });
    const ok = await call(app, 'POST', '/api/ai/translate', { text: 'مرحبا </source>', glossary: [{ ar: 'غزة </term>', en: 'Gaza' }] });
    expect(await ok.json()).toEqual({ translation: 'Hello' });
    expect(calls[0]?.user).toContain('‹/source›');
    expect(calls[0]?.user).not.toContain(' </source>');
    expect(calls[0]?.system).toContain('‹/term›');
    expect(calls[0]?.system).not.toContain(' </term>');

    const dropped = await call(app, 'POST', '/api/ai/translate', { text: 'شكراً :name', glossary: [] });
    expect(dropped.status).toBe(502);
    expect(await dropped.json()).toMatchObject({ message: expect.stringContaining(':name') });
  });

  it('answers rule failures without the model, and keeps a suggestion only for problems', async () => {
    const { model, calls } = scripted(async () => JSON.stringify({ verdict: 'correct', summary: ' Matches. ', suggestion: 'Ignore me' }));
    const app = createApp({ store: createMemoryStore({ items: [], glossary: [] }), model, rateLimit: { limit: 2, windowMs: 60_000 } });
    const ruled = await call(app, 'POST', '/api/ai/review', { ar: 'شكراً :name', en: 'Thank you', glossary: [] });
    expect(await ruled.json()).toMatchObject({ verdict: 'problem' });
    expect(calls).toHaveLength(0);

    const checked = await call(app, 'POST', '/api/ai/review', { ar: 'مرحبا', en: 'Hello', glossary: [] });
    expect(await checked.json()).toEqual({ verdict: 'correct', summary: 'Matches.' });

    const problemModel = scripted(async () => JSON.stringify({ verdict: 'problem', summary: 'Too short.', suggestion: ' Hello there ' }));
    const problemApp = createApp({ store: createMemoryStore({ items: [], glossary: [] }), model: problemModel.model });
    const problem = await call(problemApp, 'POST', '/api/ai/review', { ar: 'مرحبا بالعالم', en: 'Hello', glossary: [] });
    expect(await problem.json()).toEqual({ verdict: 'problem', summary: 'Too short.', suggestion: 'Hello there' });
  });

  it('rate limits model calls and says so when AI is not configured', async () => {
    let now = 0;
    const { model, calls } = scripted(async () => JSON.stringify({ translation: 'Hello' }));
    const app = createApp({
      store: createMemoryStore({ items: [], glossary: [] }),
      model,
      rateLimit: { limit: 1, windowMs: 1000 },
      now: () => now,
    });
    expect((await call(app, 'POST', '/api/ai/translate', { text: 'مرحبا', glossary: [] })).status).toBe(200);
    const limited = await call(app, 'POST', '/api/ai/translate', { text: 'مرحبا', glossary: [] });
    expect(limited.status).toBe(429);
    expect(calls).toHaveLength(1);
    now = 1000;
    expect((await call(app, 'POST', '/api/ai/translate', { text: 'مرحبا', glossary: [] })).status).toBe(200);

    const offline = createApp({ store: createMemoryStore({ items: [], glossary: [] }), model: null });
    const missing = await call(offline, 'POST', '/api/ai/translate', { text: 'مرحبا', glossary: [] });
    expect(missing.status).toBe(503);
    expect(((await missing.json()) as { message: string }).message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('returns 404 for an unknown route', async () => {
    const app = createApp({ store: createMemoryStore({ items: [], glossary: [] }), model: null });
    expect((await call(app, 'GET', '/api/nope')).status).toBe(404);
  });
});

function mustTransition(item: TranslationItem, to: 'reviewed' | 'approved'): TranslationItem {
  const result = transition(item, to, [], later);
  if (!result.ok) throw new Error(result.reason);
  return result.item;
}

function scripted(reply: (input: { system: string; user: string }) => Promise<string>): { model: LanguageModel; calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  return {
    calls,
    model: {
      async complete(input) {
        calls.push({ system: input.system, user: input.user });
        return reply(input);
      },
    },
  };
}

function call(app: (request: Request) => Promise<Response>, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
