import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoTranslator } from './demoTranslator';
import { createHttpTranslator } from './httpTranslator';

const glossary = [{ ar: 'غزة', en: 'Gaza' }];

describe('demo translator', () => {
  const svc = createDemoTranslator(0);
  it('translates known phrases, ignoring diacritics and punctuation', async () => {
    await expect(svc.translate('بروفايل غزّة', glossary)).resolves.toBe('Gaza Profile');
    await expect(svc.translate('ادعم صوت!', glossary)).resolves.toBe('Support Sawt');
  });
  it('says plainly when it does not know the text', async () => {
    await expect(svc.translate('نص غير معروف تماما', glossary)).rejects.toThrow(/only knows a few phrases/);
  });
  it('flags the wrong translation and offers the right one', async () => {
    await expect(svc.review('بروفايل غزة', 'Gaza', glossary)).resolves.toMatchObject({ verdict: 'problem', suggestion: 'Gaza Profile' });
  });
  it('confirms a correct translation', async () => {
    await expect(svc.review('بروفايل غزة', 'gaza profile', glossary)).resolves.toMatchObject({ verdict: 'correct' });
  });
  it('reports rule errors as problems and unknown text as unsure', async () => {
    await expect(svc.review('منصة صوت', 'Voice Platform', [{ ar: 'منصة صوت', en: 'Sawt' }])).resolves.toMatchObject({ verdict: 'problem' });
    await expect(svc.review('نص غير معروف تماما', 'Some text here for you', [])).resolves.toMatchObject({ verdict: 'unsure' });
  });
});

describe('http translator', () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) }));

  it('returns the translation and sends the token', async () => {
    respond(200, { translation: ' Gaza Profile ' });
    const svc = createHttpTranslator('https://x.test/api', 'tok');
    await expect(svc.translate('بروفايل غزة', glossary)).resolves.toBe('Gaza Profile');
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://x.test/api/ai/translate');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
  it('rejects malformed replies instead of guessing', async () => {
    respond(200, { translation: '' });
    await expect(createHttpTranslator('u').translate('x', [])).rejects.toThrow(/no translation/);
    respond(200, { verdict: 'maybe', summary: 's' });
    await expect(createHttpTranslator('u').review('a', 'b', [])).rejects.toThrow(/unreadable/);
  });
  it('turns HTTP errors into readable messages', async () => {
    respond(429, {});
    await expect(createHttpTranslator('u').translate('x', [])).rejects.toThrow(/Too many requests/);
    respond(500, {});
    await expect(createHttpTranslator('u').review('a', 'b', [])).rejects.toThrow(/\(500\)/);
  });
  it('keeps an optional suggestion', async () => {
    respond(200, { verdict: 'problem', summary: 'Missing word', suggestion: ' Gaza Profile ' });
    await expect(createHttpTranslator('u').review('a', 'b', [])).resolves.toEqual({ verdict: 'problem', summary: 'Missing word', suggestion: 'Gaza Profile' });
  });
});
