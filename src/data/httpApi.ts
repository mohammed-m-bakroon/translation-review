import type { TranslationApi } from './api';
import { readErrorMessage } from './httpError';

/**
 * Adapter for a REST backend. Expected contract:
 *   GET    {baseUrl}/translations      -> { items: TranslationItem[], glossary: GlossaryTerm[] }
 *   PUT    {baseUrl}/translations/:id  <- TranslationItem            (create or update)
 *   DELETE {baseUrl}/translations/:id
 *   PUT    {baseUrl}/translations      <- TranslationItem[]          (replace all)
 *   PUT    {baseUrl}/glossary          <- GlossaryTerm[]
 */
export function createHttpApi(baseUrl: string, token?: string): TranslationApi {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const send = async (path: string, method: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(await readErrorMessage(res, `${method} ${path} failed (${res.status})`));
  };
  return {
    async load() {
      const res = await fetch(`${baseUrl}/translations`, { headers });
      if (!res.ok) throw new Error(await readErrorMessage(res, `Failed to load translations (${res.status})`));
      return res.json();
    },
    save: (item) => send(`/translations/${encodeURIComponent(item.id)}`, 'PUT', item),
    remove: (id) => send(`/translations/${encodeURIComponent(id)}`, 'DELETE'),
    replaceAll: (items) => send('/translations', 'PUT', items),
    saveGlossary: (glossary) => send('/glossary', 'PUT', glossary),
  };
}
