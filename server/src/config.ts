import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  port: number;
  dataFile: string;
  /** When set, every route except health requires `Authorization: Bearer <token>`. */
  token?: string;
  /** `*` or a comma-separated origin list. */
  corsOrigin: string;
  anthropicKey?: string;
  model: string;
  aiRateLimit: number;
  aiWindowMs: number;
}

/** Fills `process.env` from dotenv-style files. Existing variables win, so the shell can override a file. */
export function loadEnvFiles(paths: readonly string[] = [resolve('server/.env'), resolve('.env')]): void {
  for (const file of paths) {
    if (!existsSync(file)) continue;
    applyEnv(readFileSync(file, 'utf8'));
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = parsePort(env.PORT ?? '8787');
  const limit = parseLimit(env.AI_RATE_LIMIT ?? '30');
  const token = optional(env.API_TOKEN);
  return {
    port,
    dataFile: env.DATA_FILE?.trim() || resolve('server/data/store.json'),
    ...(token ? { token } : {}),
    corsOrigin: env.CORS_ORIGIN?.trim() || '*',
    ...(optional(env.ANTHROPIC_API_KEY) ? { anthropicKey: optional(env.ANTHROPIC_API_KEY) } : {}),
    model: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
    aiRateLimit: limit,
    aiWindowMs: 60_000,
  };
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('PORT must be an integer between 1 and 65535.');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  return port;
}

function parseLimit(value: string): number {
  if (!/^\d+$/.test(value)) return 30;
  const limit = Number(value);
  return limit >= 1 && limit <= 1000 ? limit : 30;
}

function applyEnv(text: string): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const raw = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = raw.indexOf('=');
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = raw.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
