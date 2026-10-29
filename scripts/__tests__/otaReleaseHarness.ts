// Test-Harness für den Production-OTA-Wrapper (KEINE echte EAS-/Production-Aktion).
//
// • Fixture-Git-Repo (temp): eigene git-common-dir (Lock), kontrollierte Commits für den
//   Ancestry-Guard (base ⊂ release; `other` ist KEIN Vorfahre), immer sauberer Worktree.
// • Falsches `eas` im PATH mit Zustandsdatei: channel:view, update:list, update:view und
//   `update` (simuliert die Veröffentlichung, indem eine neue Group vorne angefügt wird).
//   Jeder Aufruf wird als JSON-argv protokolliert.
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

// Runtime-Vertrag aus der ECHTEN Production-Konfiguration (app.json, policy appVersion →
// expo.version). Kein fester Wert: eine Versionsanhebung (z. B. 1.0.4) hält die Guard-Tests
// gültig, die Mismatch-Fälle nutzen abgeleitete Nachbar-Runtimes.
const APP_EXPO = JSON.parse(readFileSync('app.json', 'utf8')).expo;
export const RELEASE_RUNTIME: string =
  APP_EXPO.runtimeVersion?.policy === 'appVersion' ? APP_EXPO.version : String(APP_EXPO.runtimeVersion);
const bumpPatch = (v: string, d: number) => { const p = v.split('.').map(Number); p[2] += d; return p.join('.'); };
export const OLDER_RUNTIME = bumpPatch(RELEASE_RUNTIME, -1);
export const NEWER_RUNTIME = bumpPatch(RELEASE_RUNTIME, +1);

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
  failDelivery?: boolean;
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
  // Test-owned barrier: keep the first publisher inside update until the
  // parallel-start assertion has finished, independent of machine speed.
  const barrier = process.env.FAKE_UPDATE_RELEASE_FILE;
  const barrierStart = Date.now();
  while (barrier && !fs.existsSync(barrier)) {
    if (Date.now() - barrierStart > 120000) process.exit(2);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  if (s.sleepMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s.sleepMs);
  if (s.failUpdate) process.exit(1);
  s = load();
  const p = a[a.indexOf('--platform') + 1];
  const hash = s.publishHash || process.env.EXPO_PUBLIC_RELEASE_GIT_COMMIT || null;
  const rt = s.publishRuntime || process.env.FAKE_RELEASE_RUNTIME;
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
  qualityEvidenceFile: string;
  envFileWith(content: string): string;
  setState(s: FakeState): void;
  state(): FakeState;
  calls(): string[][];
  updateCalls(): string[][];
  resetCalls(): void;
  fixtureApproval(args: string[], env?: Record<string, string>): { candidate: string; approval: string };
  run(args: string[], opts?: { envFile?: string; cmd?: string[]; env?: Record<string, string>; qualityEvidence?: boolean; approval?: boolean }): { code: number | null; out: string };
  baseEnv(extra?: Record<string, string>): NodeJS.ProcessEnv;
  defaultState(): FakeState;
}

/**
 * Baut Fixture-Repo + falsches `eas`. Quelle: die echten Wrapper-Dateien dieses Repos.
 * `appVersion`: Release-Runtime des Fixture-Repos überschreiben (policy appVersion → version),
 * z. B. um einen Hotfix für eine ältere, parallel aktive Runtime zu modellieren.
 * `appJson`: komplett eigene app.json (z. B. nicht bestimmbare Runtime).
 */
export function createHarness(opts: { appVersion?: string; appJson?: unknown; easJson?: unknown } = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'anyvo-ota-test-'));
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  for (const f of ['scripts/update-production.mjs', 'scripts/guard-prod-supabase.mjs', 'scripts/release-quality-evidence.mjs', 'scripts/check-native-changes.mjs', 'scripts/ota-candidate.mjs', 'scripts/ota-preflight.mjs', 'scripts/ota-delivery.mjs', 'package.json', 'app.json']) copyFileSync(f, join(repo, f));
  if (opts.easJson !== undefined) writeFileSync(join(repo, 'eas.json'), JSON.stringify(opts.easJson, null, 2));
  if (opts.appJson !== undefined) writeFileSync(join(repo, 'app.json'), JSON.stringify(opts.appJson, null, 2));
  else {
    const app = JSON.parse(readFileSync('app.json', 'utf8'));
    // Standard-Fixtures modellieren eine gemeinsame appVersion-Runtime.
    // Plattform-Overrides nur über explizites appJson in den Test aufnehmen.
    if (opts.appVersion) app.expo.version = opts.appVersion;
    delete app.expo.ios?.runtimeVersion;
    delete app.expo.android?.runtimeVersion;
    writeFileSync(join(repo, 'app.json'), JSON.stringify(app, null, 2));
  }
  const releaseRuntime = opts.appVersion ?? RELEASE_RUNTIME;
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

  // Synthetic offline attestations only; these are never production QA receipts.
  const proof = join(dir, 'quality-fixture.log');
  writeFileSync(proof, 'synthetic offline fixture evidence\n');
  const artifact = { path: proof, sha256: createHash('sha256').update(readFileSync(proof)).digest('hex') };
  const fixtureApp = JSON.parse(readFileSync(join(repo, 'app.json'), 'utf8')).expo;
  const qualityPaths: Record<string, string> = {};
  for (const platform of ['ios', 'android']) {
    const rv = fixtureApp[platform]?.runtimeVersion ?? fixtureApp.runtimeVersion;
    const runtime = typeof rv === 'string' ? rv : rv?.policy === 'appVersion' ? (fixtureApp[platform]?.version ?? fixtureApp.version) : 'UNRESOLVED';
    const path = join(dir, `quality-${platform}.json`);
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, source: { commit: release, tree: git(repo, 'rev-parse', 'HEAD^{tree}') }, target: { platform, runtime }, producer: 'fixture-writer',
      checks: { process: { exitCode: 0, evidence: artifact }, typecheck: { exitCode: 0, evidence: artifact }, eslint: { exitCode: 0, errors: 0, warnings: 0, evidence: artifact }, tests: { exitCode: 0, passed: 1, failed: 0, skipped: 0, evidence: artifact }, diff: { exitCode: 0, evidence: artifact } },
      review: { status: 'PASS', sourceCommit: release, reviewer: 'fixture-reviewer', evidence: artifact } }));
    qualityPaths[platform] = path;
  }

  const callLog = join(dir, 'eas-calls.jsonl');
  const stateFile = join(dir, 'eas-state.json');
  const fakeEas = join(dir, 'eas');
  writeFileSync(fakeEas, FAKE_EAS);
  chmodSync(fakeEas, 0o755);

  // Offline network boundary: production code has no test bypass. Node preloads
  // this fixture-only transport; unexpected hosts can never reach the network.
  const fakeNetwork = join(dir, 'offline-network.mjs');
  writeFileSync(fakeNetwork, `import fs from 'node:fs';import {createHash} from 'node:crypto';
    globalThis.fetch=async(url,options={})=>{
      const u=new URL(url),s=JSON.parse(fs.readFileSync(process.env.FAKE_EAS_STATE));
      if(s.failDelivery) throw new Error('synthetic CDN unavailable');
      const bytes=fs.readFileSync(process.env.FAKE_DELIVERY_FILE);
      if(u.hostname==='assets.eascdn.net') return new Response(bytes);
      if(u.hostname!=='u.expo.dev') throw new Error('Fixture network denied');
      const p=options.headers['expo-platform'],r=options.headers['expo-runtime-version'];
      const e=s.groups.flatMap(g=>g.entries).find(e=>e.platform===p&&e.runtimeVersion===r);
      return Response.json({id:e?.id,runtimeVersion:r,launchAsset:{url:'https://assets.eascdn.net/fixture',hash:createHash('sha256').update(bytes).digest('base64url')},assets:[]});
    };`);
  let n = 0;
  const envFileWith = (content: string) => { const f = join(dir, `env-${++n}.txt`); writeFileSync(f, content); return f; };
  const fullEnvFile = envFileWith(FULL_ENV);
  const defaultState = (): FakeState => ({
    groups: [{ group: 'g-prod', createdAt: '2026-10-04T14:20:03.537Z', entries: [
      { platform: 'ios', id: 'u-ios', gitCommitHash: base, runtimeVersion: releaseRuntime },
      { platform: 'android', id: 'u-android', gitCommitHash: base, runtimeVersion: releaseRuntime },
    ] }],
  });
  const syntheticBuilds = Object.fromEntries(['ios', 'android'].map(platform => {
    const rv = fixtureApp[platform]?.runtimeVersion ?? fixtureApp.runtimeVersion;
    const runtime = typeof rv === 'string' ? rv : fixtureApp.version;
    return [`fixture-native-${platform}`, { id: `fixture-native-${platform}`, status: 'FINISHED', platform, runtimeVersion: runtime,
      appVersion: fixtureApp[platform]?.version ?? fixtureApp.version, channel: 'production', buildProfile: 'production', gitCommitHash: base }];
  }));
  const setState = (s: FakeState) => writeFileSync(stateFile, JSON.stringify({ ...s, builds: { ...syntheticBuilds, ...s.builds } }));
  setState(defaultState());

  const calls = (): string[][] => (existsSync(callLog) ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
  const baseEnv = (extra: Record<string, string> = {}) => ({
    ...process.env, PATH: `${dir}:${process.env.PATH}`, NODE_OPTIONS: `--import=${fakeNetwork}`, FAKE_DELIVERY_FILE: proof,
    FAKE_ENV_FILE: fullEnvFile, FAKE_EAS_LOG: callLog, FAKE_EAS_STATE: stateFile, FAKE_RELEASE_RUNTIME: releaseRuntime, ...extra,
  });
  // Explicitly synthetic test attestations. Production has no auto-approval flag.
  const fixtureApproval = (args: string[], extra: Record<string, string> = {}) => {
    const platform = args[args.indexOf('--platform') + 1] || 'ios';
    const qualityFile = qualityPaths[platform] ?? qualityPaths.ios;
    const candidate = join(dir, `candidate-${platform}.json`), approval = join(dir, `approval-${platform}.json`);
    const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const hash = (v: any) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(canon(v))).digest('hex');
    const environmentDigest = hash({ remote: readFileSync(fullEnvFile, 'utf8').trim().split(/\r?\n/).sort(),
      local: readdirSync(repo).filter(n => /^\.env(\..*)?$/.test(n) && !n.endsWith('.example')).sort().map(n => [n, hash(readFileSync(join(repo, n), 'utf8'))]),
      process: Object.entries(baseEnv(extra)).filter(([k]) => k.startsWith('EXPO_PUBLIC_') && k !== 'EXPO_PUBLIC_RELEASE_GIT_COMMIT').sort(([a], [b]) => a.localeCompare(b)) });
    const input = { repo, dir, platform, qualityFile, candidate, approval, stateFile, fullEnvFile, base, release, artifact, environmentDigest, message: args.includes('--message') ? args[args.indexOf('--message') + 1] ?? '' : '',
      initial: args.includes('--initial-runtime-release'), buildId: args[args.indexOf('--initial-runtime-build-id') + 1] };
    const code = `import fs from 'node:fs';import {createCandidate,writeNew,digest,riskFor} from './scripts/ota-candidate.mjs';
      import {resolveReleaseRuntime,parseActiveFromView,parseNativeBuild,nativeBaseline} from './scripts/update-production.mjs';
      import {execFileSync} from 'node:child_process';
      const p=JSON.parse(process.argv[1]),s=JSON.parse(fs.readFileSync(p.stateFile)),app=JSON.parse(fs.readFileSync('app.json')).expo;
      const runtime=resolveReleaseRuntime({expo:app},p.platform)||'UNRESOLVED';
      const view=g=>g?parseActiveFromView(g.entries.map(e=>({...e,group:g.group,branch:'production',createdAt:g.createdAt||'2026-10-04T00:00:00.000Z'})),p.platform):null;
      const active=s.groups.find(g=>g.entries.some(e=>e.platform===p.platform&&e.runtimeVersion===runtime));
      const otherPlatform=p.platform==='ios'?'android':'ios',og=s.groups.find(g=>g.entries.some(e=>e.platform===otherPlatform));
      const other=og?parseActiveFromView(og.entries.map(e=>({...e,group:og.group,branch:'production',createdAt:og.createdAt||'2026-10-04T00:00:00.000Z'})),otherPlatform):null;
      const nb=JSON.parse(fs.readFileSync(p.stateFile)).builds['fixture-native-'+p.platform];
      const baseline=p.initial&&s.builds[p.buildId]?nativeBaseline(parseNativeBuild(s.builds[p.buildId])):view(active);
      const paths=(()=>{try{return baseline?.gitCommitHash?execFileSync('git',['diff','--name-only','--no-renames','-z',baseline.gitCommitHash,p.release,'--'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\\0').filter(Boolean).sort():[];}catch{return [];}})();
      const plan={bundle:{status:'PASS',sourceCommit:p.release,platform:p.platform,runtime,environment:'production',evidence:p.artifact,launchAsset:p.artifact,assets:[]},nativeBuildId:nb.id,producer:'fixture-writer',changes:[{description:'Synthetic fixture only',risk:'low',areas:['ui']}],regressions:['Synthetic UI regression'],testRationale:'Synthetic fake EAS guard tests',sourceBackup:{status:'PASS',commit:p.release,repository:'dogbossvibes/CarniFlow',ref:'fixture-only',evidence:p.artifact}};
      const context={source:{commit:p.release,tree:execFileSync('git',['rev-parse',p.release+'^{tree}'],{encoding:'utf8'}).trim(),branch:'main'},target:{platform:p.platform,runtime,appVersion:app[p.platform]?.version??app.version,channel:'production',environment:'production',message:p.message,updatesUrl:app.updates?.url??null},native:{buildId:nb.id,commit:nb.gitCommitHash,runtime:nb.runtimeVersion,platform:p.platform},production:{baseline},environmentDigest:p.environmentDigest,changedPaths:paths,risk:riskFor(paths,plan.changes)};
      // Deliberately malformed fixtures must reach the old guard, not the factory.
      let c;try{c=createCandidate({context,plan,qualityFile:p.qualityFile,root:p.repo});}catch{const body={schemaVersion:1,context,plan,quality:{path:p.qualityFile,sha256:'invalid'},recommendation:'READY',problems:[]};c={...body,digest:digest(body)};}
      fs.writeFileSync(p.candidate,JSON.stringify(c));fs.writeFileSync(p.approval,JSON.stringify({schemaVersion:1,kind:'human-production-approval',decision:'PUBLISH_PRODUCTION_ONCE',scope:'production-ota-only',candidateDigest:c.digest,commit:p.release,platform:p.platform,runtime,humanMessageReference:'synthetic-fixture-not-a-human-approval',explicitStatement:'synthetic test only',approvedAt:new Date().toISOString()}));`;
    try { execFileSync('node', ['--input-type=module', '-e', code, JSON.stringify(input)], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { throw new Error('Synthetic candidate factory failed; arguments redacted.'); }
    return { candidate, approval };
  };
  const run: Harness['run'] = (args, opts = {}) => {
    const cmd = opts.cmd ?? ['node', 'scripts/update-production.mjs'];
    const a = [...cmd.slice(1), ...args];
    if (opts.qualityEvidence !== false && !args.includes('--quality-evidence')) a.push('--quality-evidence', qualityPaths[args[args.indexOf('--platform') + 1]] ?? qualityPaths.ios);
    if (opts.envFile) a.push('--env-list-file', opts.envFile);
    if (opts.approval !== false && opts.qualityEvidence !== false && args.includes('--confirm') && !args.includes('--dry-run') && !args.includes('--candidate') && ['ios', 'android'].includes(args[args.indexOf('--platform') + 1])) {
      const f = fixtureApproval(args, opts.env);a.push('--candidate', f.candidate, '--approval', f.approval);
    }
    const r: SpawnSyncReturns<string> = spawnSync(cmd[0], a, { cwd: repo, encoding: 'utf8', env: baseEnv(opts.env) });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  return {
    dir, repo, base, release, other,
    lockPath: join(repo, '.git', 'anyvo-production-ota.lock'),
    fullEnvFile, qualityEvidenceFile: qualityPaths.ios, envFileWith, setState, fixtureApproval,
    state: () => JSON.parse(readFileSync(stateFile, 'utf8')),
    calls, updateCalls: () => calls().filter(a => a[0] === 'update'),
    resetCalls: () => { rmSync(callLog, { force: true });rmSync(join(repo, '.git/anyvo-ota-attempts'), { recursive: true, force: true }); },
    run, baseEnv, defaultState,
  };
}

export function destroyHarness(h: Harness) {
  rmSync(h.dir, { recursive: true, force: true });
}
