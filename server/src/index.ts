import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { GLOSSARY, SEED_ITEMS } from '../../src/data/seed';
import { createAnthropicModel } from './ai/anthropic';
import { createApp } from './app';
import { loadConfig, loadEnvFiles } from './config';
import { createFileStore } from './store';

loadEnvFiles();
const config = loadConfig();
const store = createFileStore(config.dataFile, { items: SEED_ITEMS, glossary: GLOSSARY });
const model = config.anthropicKey ? createAnthropicModel({ apiKey: config.anthropicKey, model: config.model }) : null;
const app = createApp({
  store,
  model,
  ...(config.token ? { token: config.token } : {}),
  corsOrigin: config.corsOrigin,
  rateLimit: { limit: config.aiRateLimit, windowMs: config.aiWindowMs },
});

const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(config.port, () => {
  console.log(`Translation Review API on http://localhost:${config.port}`);
  console.log(model ? `AI model: ${config.model}` : 'AI: not configured (set ANTHROPIC_API_KEY in server/.env)');
  if (model && !config.token) console.warn('API_TOKEN is not set. Anyone who can reach this port can spend the AI key.');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const response = await app(await toRequest(req));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    if (res.headersSent) {
      res.end();
      return;
    }
    const tooLarge = error instanceof Error && error.message === 'Request body is too large.';
    res.statusCode = tooLarge ? 413 : 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ message: tooLarge ? error.message : 'Internal server error.' }));
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const method = req.method ?? 'GET';
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, { method, headers, body });
}

function readBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        req.destroy();
        reject(new Error('Request body is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}
