import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors';

const MAX_BODY = 1_000_000;

type HeadersLike = Headers | Record<string, string>;

export function json(status: number, body: unknown, extra?: HeadersLike): Response {
  const headers = new Headers(extra);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers });
}

export function corsHeaders(request: Request, configured: string): Record<string, string> {
  const allowed = configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  const requestOrigin = request.headers.get('origin');
  const allow =
    allowed.length === 0 || allowed.includes('*')
      ? '*'
      : requestOrigin && allowed.includes(requestOrigin)
        ? requestOrigin
        : allowed[0]!;
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, Accept',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export function assertAuthorized(request: Request, token: string | undefined): void {
  if (!token) return;
  const header = request.headers.get('authorization') ?? '';
  if (!bearerMatches(header, token)) throw new HttpError(401, 'Unauthorized.');
}

export async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY) throw new HttpError(413, 'Request body is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request body is too large.');
  if (!text.trim()) throw new HttpError(400, 'Request body is required.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'Request body must be JSON.');
  }
}

function bearerMatches(header: string, token: string): boolean {
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  const given = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
