// Test-Harness für den Production-OTA-Wrapper (KEINE echte EAS-/Production-Aktion).
//
// • Fixture-Git-Repo (temp): eigene git-common-dir (Lock), kontrollierte Commits für den
//   Ancestry-Guard (base ⊂ release; `other` ist KEIN Vorfahre), immer sauberer Worktree.
// • Falsches `eas` im PATH mit Zustandsdatei: channel:view, update:list, update:view und
//   `update` (simuliert die Veröffentlichung, indem eine neue Group vorne angefügt wird).
//   Jeder Aufruf wird als JSON-argv protokolliert.
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export const SECRET = 'SECRETVALUE-do-not-print-123';
export const PROD_URL = 'https://axkkhyqrjrtbkumaulta.supabase.co';
export const FULL_ENV = [
  'EXPO_PUBLIC_BACKEND_ENV=production',
  `EXPO_PUBLIC_SUPABASE_URL=${PROD_URL}`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY=${SECRET}`,
  'SENTRY_AUTH_TOKEN=' + SECRET,
].join('\n');

export interface FakeEntry { platform: string; id: string; gitCommitHash: string | null; runtimeVersion: string }
export interface FakeGroup { group: string; createdAt?: string; entries: FakeEntry[] }
export interface FakeState {
  groups: FakeGroup[];                 // neueste zuerst
  branches?: string[];                 // Channel production → Branches (Default ['production'])
  channelName?: string;
  paused?: boolean;
  rollout?: boolean;
  raceAtList?: number;                 // beim n-ten update:list erscheint raceGroup (fremder Publish)
  raceGroup?: FakeGroup;
  failUpdate?: boolean;                // `eas update` schlägt fehl
  sleepMs?: number;                    // `eas update` dauert (Parallelstart-/Signal-Tests)
  publishHash?: string;                // simulierte Abweichung des veröffentlichten gitCommitHash
  publishRuntime?: string;
  publishExtraPlatform?: string;       // simulierte fremde Plattform in der neuen Group
  listCalls?: number;
  ignoreListFilters?: boolean;         // update:list ignoriert --platform/--runtime-version (Fail-safe-Test)
  builds?: Record<string, unknown>;    // build:view <id> --json → Eintrag; fehlt → Fehler (Build unbekannt)
}

const FAKE_EAS = `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_EAS_LOG, JSON.stringify(a) + '\\n');
const load = () => JSON.parse(fs.readFileSync(process.env.FAKE_EAS_STATE, 'utf8'));
const save = s => fs.writeFileSync(process.env.FAKE_EAS_STATE, JSON.stringify(s));
const out = o => process.stdout.write(JSON.stringify(o));
if (a[0] === 'env:list') process.stdout.write(fs.readFileSync(process.env.FAKE_ENV_FILE, 'utf8'));
else if (a[0] === 'channel:view') {
  const s = load();
  out({ currentPage: {
    name: s.channelName || 'production', isPaused: !!s.paused,
    branchMapping: { version: 0, data: s.rollout ? [{ branchId: 'b1', branchMappingLogic: 'x' }, { branchId: 'b2' }] : [{ branchId: 'b1', branchMappingLogic: 'true' }] },
    updateBranches: (s.branches || ['production']).map(n => ({ name: n, updateGroups: [] })),
  } });
} else if (a[0] === 'update:list') {
  const s = load();
  s.listCalls = (s.listCalls || 0) + 1;
  if (s.raceAtList && s.listCalls === s.raceAtList && s.raceGroup) s.groups.unshift(s.raceGroup);
  save(s);
  // Wie die echte CLI: optionale Serverfilter --platform / --runtime-version (neueste zuerst).
  const pf = a.includes('--platform') ? a[a.indexOf('--platform') + 1] : null;
  const rv = a.includes('--runtime-version') ? a[a.indexOf('--runtime-version') + 1] : null;
  const rows = [];
  for (const g of s.groups) {
    const match = s.ignoreListFilters ? g.entries : g.entries.filter(e => (!pf || e.platform === pf) && (!rv || e.runtimeVersion === rv));
    if (!match.length) continue;
    rows.push({ group: g.group, platforms: g.entries.map(e => e.platform).join(', '), runtimeVersion: match[0].runtimeVersion });
  }
  out({ name: 'production', currentPage: rows });
} else if (a[0] === 'build:view') {
  const b = (load().builds || {})[a[1]];
  if (!b) { process.stderr.write('Build not found'); process.exit(1); }
  out(b);
} else if (a[0] === 'update:view') {
  const s = load();
  const g = s.groups.find(x => x.group === a[1]);
  out((g ? g.entries : []).map(e => Object.assign({}, e, { group: g.group, branch: 'production', createdAt: g.createdAt || '2026-10-04T00:00:00.000Z' })));
} else if (a[0] === 'update') {
  let s = load();
  if (s.sleepMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s.sleepMs);
  if (s.failUpdate) process.exit(1);
  s = load();
  const p = a[a.indexOf('--platform') + 1];
  const hash = s.publishHash || process.env.EXPO_PUBLIC_RELEASE_GIT_COMMIT || null;
  const rt = s.publishRuntime || '1.0.3';
  const entries = [{ platform: p, id: 'u-new-' + p, gitCommitHash: hash, runtimeVersion: rt }];
  if (s.publishExtraPlatform) entries.push({ platform: s.publishExtraPlatform, id: 'u-new-x', gitCommitHash: hash, runtimeVersion: rt });
  s.groups.unshift({ group: 'g-new-' + (s.groups.length + 1), entries });
  save(s);
}
`;

const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).trim();

export interface Harness {
  dir: string;
  repo: string;
  base: string;      // aktiver Production-Commit (Vorfahre von release)
  release: string;   // HEAD des Fixture-Repos
  other: string;     // KEIN Vorfahre von release
  lockPath: string;
  fullEnvFile: string;
  envFileWith(content: string): string;
  setState(s: FakeState): void;
  state(): FakeState;
  calls(): string[][];
  updateCalls(): string[][];
  resetCalls(): void;
  run(args: string[], opts?: { envFile?: string; cmd?: string[]; env?: Record<string, string> }): { code: number | null; out: string };
  baseEnv(extra?: Record<string, string>): NodeJS.ProcessEnv;
  defaultState(): FakeState;
}

/** Baut Fixture-Repo + falsches `eas`. Quelle: die echten Wrapper-Dateien dieses Repos. */
export function createHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'anyvo-ota-test-'));
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  for (const f of ['scripts/update-production.mjs', 'scripts/guard-prod-supabase.mjs', 'package.json', 'app.json']) copyFileSync(f, join(repo, f));
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  writeFileSync(join(repo, 'RELEASE.txt'), 'release\n');
  git(repo, 'add', 'RELEASE.txt');
  git(repo, 'commit', '-q', '-m', 'release');
  const release = git(repo, 'rev-parse', 'HEAD');
  const other = git(repo, 'commit-tree', `${base}^{tree}`, '-p', base, '-m', 'other');   // Seitenzweig ohne Checkout

  const callLog = join(dir, 'eas-calls.jsonl');
  const stateFile = join(dir, 'eas-state.json');
  const fakeEas = join(dir, 'eas');
  writeFileSync(fakeEas, FAKE_EAS);
  chmodSync(fakeEas, 0o755);

  let n = 0;
  const envFileWith = (content: string) => { const f = join(dir, `env-${++n}.txt`); writeFileSync(f, content); return f; };
  const fullEnvFile = envFileWith(FULL_ENV);
  const defaultState = (): FakeState => ({
    groups: [{ group: 'g-prod', createdAt: '2026-10-04T14:20:03.537Z', entries: [
      { platform: 'ios', id: 'u-ios', gitCommitHash: base, runtimeVersion: '1.0.3' },
      { platform: 'android', id: 'u-android', gitCommitHash: base, runtimeVersion: '1.0.3' },
    ] }],
  });
  const setState = (s: FakeState) => writeFileSync(stateFile, JSON.stringify(s));
  setState(defaultState());

  const calls = (): string[][] => (existsSync(callLog) ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
  const baseEnv = (extra: Record<string, string> = {}) => ({
    ...process.env, PATH: `${dir}:${process.env.PATH}`,
    FAKE_ENV_FILE: fullEnvFile, FAKE_EAS_LOG: callLog, FAKE_EAS_STATE: stateFile, ...extra,
  });
  const run: Harness['run'] = (args, opts = {}) => {
    const cmd = opts.cmd ?? ['node', 'scripts/update-production.mjs'];
    const a = [...cmd.slice(1), ...args];
    if (opts.envFile) a.push('--env-list-file', opts.envFile);
    const r: SpawnSyncReturns<string> = spawnSync(cmd[0], a, { cwd: repo, encoding: 'utf8', env: baseEnv(opts.env) });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  return {
    dir, repo, base, release, other,
    lockPath: join(repo, '.git', 'anyvo-production-ota.lock'),
    fullEnvFile, envFileWith, setState,
    state: () => JSON.parse(readFileSync(stateFile, 'utf8')),
    calls, updateCalls: () => calls().filter(a => a[0] === 'update'),
    resetCalls: () => rmSync(callLog, { force: true }),
    run, baseEnv, defaultState,
  };
}

export function destroyHarness(h: Harness) {
  rmSync(h.dir, { recursive: true, force: true });
}
