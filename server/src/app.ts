import { validate } from '../../src/domain/checks';
import type { LanguageModel } from './ai/anthropic';
import { createAi } from './ai/service';
import { HttpError } from './errors';
import { assertAuthorized, corsHeaders, json, readJson } from './http';
import { clientKey, createRateLimiter } from './rateLimit';
import type { RateLimiter } from './rateLimit';
import { replaceItems, saveItem } from './save';
import type { Store } from './store';
import { parseGlossary, parseItem, parseItems, parseReviewBody, parseTranslateBody } from './validate';

export interface AppOptions {
  store: Store;
  model: LanguageModel | null;
  token?: string;
  corsOrigin?: string;
  rateLimit?: { limit: number; windowMs: number };
  now?: () => number;
}

export function createApp(options: AppOptions): (request: Request) => Promise<Response> {
  const origin = options.corsOrigin ?? '*';
  const ai = createAi(options.model);
  const limiter: RateLimiter = createRateLimiter(options.rateLimit?.limit ?? 30, options.rateLimit?.windowMs ?? 60_000, options.now);
  return async (request) => {
    const cors = corsHeaders(request, origin);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      return withCors(await route(request, options, ai, limiter), cors);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'Internal server error.';
      return json(status, { message }, cors);
    }
  };
}

async function route(request: Request, options: AppOptions, ai: ReturnType<typeof createAi>, limiter: RateLimiter): Promise<Response> {
  const path = normalizePath(request);
  if (request.method === 'GET' && path === '/api/health') {
    return json(200, { ok: true, ai: options.model !== null });
  }
  assertAuthorized(request, options.token);
  if (request.method === 'GET' && path === '/api/translations') return json(200, await options.store.read());
  if (request.method === 'PUT' && path === '/api/translations') return replaceAll(request, options.store);
  if (request.method === 'PUT' && path === '/api/glossary') return saveGlossary(request, options.store);
  const itemPath = matchId(path);
  if (itemPath && request.method === 'PUT') return save(request, options.store, itemPath);
  if (itemPath && request.method === 'DELETE') return remove(options.store, itemPath);
  if (request.method === 'POST' && path === '/api/ai/translate') return translate(request, ai, limiter);
  if (request.method === 'POST' && path === '/api/ai/review') return review(request, ai, limiter);
  throw new HttpError(404, 'Not found.');
}

async function replaceAll(request: Request, store: Store): Promise<Response> {
  const items = parseItems(await readJson(request));
  await store.update((current) => ({ snapshot: replaceItems(current, items), result: undefined }));
  return empty();
}

async function saveGlossary(request: Request, store: Store): Promise<Response> {
  const glossary = parseGlossary(await readJson(request));
  await store.update((current) => ({ snapshot: { ...current, glossary }, result: undefined }));
  return empty();
}

async function save(request: Request, store: Store, id: string): Promise<Response> {
  const item = parseItem(await readJson(request));
  await store.update((current) => ({ snapshot: saveItem(current, id, item), result: undefined }));
  return empty();
}

async function remove(store: Store, id: string): Promise<Response> {
  await store.update((current) => {
    if (!current.items.some((item) => item.id === id)) throw new HttpError(404, 'Translation not found.');
    return { snapshot: { ...current, items: current.items.filter((item) => item.id !== id) }, result: undefined };
  });
  return empty();
}

async function translate(request: Request, ai: ReturnType<typeof createAi>, limiter: RateLimiter): Promise<Response> {
  const body = parseTranslateBody(await readJson(request));
  spend(request, limiter);
  const translation = await ai.translate(body.text, body.glossary, request.signal);
  return json(200, { translation });
}

async function review(request: Request, ai: ReturnType<typeof createAi>, limiter: RateLimiter): Promise<Response> {
  const body = parseReviewBody(await readJson(request));
  const blocked = validate(body.ar, body.en, body.glossary).some((issue) => issue.severity === 'error');
  // Rule failures are answered locally. Only a model call spends the rate limit.
  if (!blocked) spend(request, limiter);
  return json(200, await ai.review(body.ar, body.en, body.glossary, request.signal));
}

function spend(request: Request, limiter: RateLimiter): void {
  if (!limiter.allow(clientKey(request))) throw new HttpError(429, 'Too many requests. Wait a moment and try again.');
}

function normalizePath(request: Request): string {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  return path || '/';
}

function matchId(path: string): string | null {
  const prefix = '/api/translations/';
  if (!path.startsWith(prefix)) return null;
  const id = decodeURIComponent(path.slice(prefix.length));
  return id ? id : null;
}

function empty(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

function withCors(response: Response, cors: Headers | Record<string, string>): Response {
  const headers = new Headers(response.headers);
  new Headers(cors).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}
