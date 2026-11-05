import { HttpError } from '../errors';

export interface Completion {
  system: string;
  user: string;
  signal?: AbortSignal;
}

/** One model call. The rest of the server never sees a vendor SDK or an API key. */
export interface LanguageModel {
  complete(input: Completion): Promise<string>;
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  endpoint?: string;
  logger?: (message: string) => void;
}

export function createAnthropicModel(options: AnthropicOptions): LanguageModel {
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = options.endpoint ?? 'https://api.anthropic.com/v1/messages';
  const logger = options.logger ?? ((message: string) => console.error(message));
  return {
    async complete({ system, user, signal }) {
      const timeout = AbortSignal.timeout(30_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: options.model,
            max_tokens: 800,
            system,
            messages: [{ role: 'user', content: user }],
          }),
          signal: combined,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        logger('Anthropic request failed before a response.');
        throw new HttpError(502, 'The AI service is unavailable right now.');
      }
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        logger(`Anthropic request failed (${response.status})${detail ? `: ${detail}` : ''}.`);
        const message = detail
          ? `The AI service rejected the request (${response.status}): ${detail}`
          : 'The AI service is unavailable right now. Check ANTHROPIC_API_KEY and ANTHROPIC_MODEL.';
        throw new HttpError(502, message);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new HttpError(502, 'The AI service returned an unreadable reply.');
      }
      const text = readText(payload);
      if (!text.trim()) throw new HttpError(502, 'The AI service returned an empty reply.');
      return text;
    },
  };
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return '';
    const error = (body as { error?: unknown }).error;
    if (!error || typeof error !== 'object') return '';
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  } catch {
    return '';
  }
}

function readText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content) || !content[0] || typeof content[0] !== 'object') return '';
  const text = (content[0] as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
}
