import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly appRoot: string;
  readonly webRoot: string;
  readonly dbPath: string;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function detectDefaultAppRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith('/backend')) return resolve(cwd, '..');
  return cwd;
}

function detectDefaultWebRoot(appRoot: string): string {
  const viteDistRoot = resolve(appRoot, 'frontend', 'dist');
  const viteIndex = resolve(viteDistRoot, 'index.html');
  if (existsSync(viteIndex)) return viteDistRoot;
  return appRoot;
}

export function readConfig(): AppConfig {
  const defaultAppRoot = detectDefaultAppRoot();
  const appRoot = resolve(process.env.FLASHCARDS_APP_ROOT || defaultAppRoot);
  const webRoot = resolve(process.env.FLASHCARDS_WEB_ROOT || detectDefaultWebRoot(appRoot));
  return {
    host: String(process.env.HOST || '0.0.0.0'),
    port: parsePort(process.env.PORT, 8000),
    appRoot,
    webRoot,
    dbPath: resolve(process.env.FLASHCARDS_DB_PATH || resolve(appRoot, 'flashcards.sqlite3'))
  };
}
