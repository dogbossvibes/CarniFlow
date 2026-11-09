// ANYVO Prüfzentrum – gemeinsame Helfer. Keine Netzwerk-/Remote-DB-Zugriffe.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

// Variablen, die auf entfernte Datenbanken/Projekte zeigen könnten, werden für
// alle Kindprozesse entfernt. Das Prüfzentrum spricht nur lokale Container an.
const REMOTE_ENV = /^(SUPABASE_|DATABASE_URL$|PG(HOST|PORT|USER|PASSWORD|DATABASE|SERVICE)$|EXPO_PUBLIC_SUPABASE_|EXPO_TOKEN$|EAS_)/;

export function safeEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!REMOTE_ENV.test(k)) env[k] = v;
  return { ...env, CI: 'true', EXPO_NO_TELEMETRY: '1', FORCE_COLOR: '0', ...extra };
}

export function run(cmd, args, { cwd, input, timeoutMs = 30 * 60 * 1000, env, maxBuffer = 256 * 1024 * 1024 } = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, input, env: env ?? safeEnv(), encoding: 'utf8', timeout: timeoutMs, maxBuffer });
  return {
    code: r.status ?? (r.error ? 127 : 1),
    stdout: r.stdout ?? '',
    stderr: (r.stderr ?? '') + (r.error ? `\n${r.error.message}` : ''),
    signal: r.signal ?? null,
    ms: Date.now() - started,
  };
}

export function git(repo, ...args) {
  const r = run('git', ['-C', repo, ...args], { env: process.env });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const sha256File = path => sha256(readFileSync(path));

export function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

export function readJson(path, fallback = null) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; } catch { return fallback; }
}

export function log(msg) { process.stderr.write(`[verify-center] ${msg}\n`); }

// Multimengen-Differenz: Einträge in `head`, die (in dieser Anzahl) nicht in `base` vorkommen.
export function newEntries(head, base, keyOf) {
  const counts = new Map();
  for (const item of base) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  const added = [];
  for (const item of head) {
    const k = keyOf(item);
    const n = counts.get(k) ?? 0;
    if (n > 0) counts.set(k, n - 1); else added.push(item);
  }
  return added;
}
