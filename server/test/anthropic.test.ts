import { describe, expect, it } from 'vitest';
import { createAnthropicModel } from '../src/ai/anthropic';

describe('Anthropic client', () => {
  it('sends the key and model, and returns the text block', async () => {
    let auth = '';
    let model = '';
    const client = createAnthropicModel({
      apiKey: 'secret-key',
      model: 'claude-sonnet-4-5',
      endpoint: 'https://anthropic.test/v1/messages',
      fetch: async (url, init) => {
        expect(String(url)).toBe('https://anthropic.test/v1/messages');
        auth = new Headers(init?.headers).get('x-api-key') ?? '';
        model = JSON.parse(String(init?.body)).model;
        return Response.json({ content: [{ type: 'text', text: '{"translation":"Hello"}' }] });
      },
    });
    await expect(client.complete({ system: 'sys', user: 'user' })).resolves.toBe('{"translation":"Hello"}');
    expect(auth).toBe('secret-key');
    expect(model).toBe('claude-sonnet-4-5');
  });

  it('hides the upstream body and reports the status only in the log', async () => {
    const logs: string[] = [];
    const client = createAnthropicModel({
      apiKey: 'secret-key',
      model: 'claude-sonnet-4-5',
      logger: (message) => logs.push(message),
      fetch: async () => new Response('key leaked sk-ant-secret', { status: 401 }),
    });
    await expect(client.complete({ system: 'sys', user: 'user' })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(logs.join('\n')).toContain('(401)');
    expect(logs.join('\n')).not.toContain('sk-ant-secret');
  });
});
