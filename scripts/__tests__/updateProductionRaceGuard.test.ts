// Race-sichere Production-OTA (Vorfall 2026-10-04: OTA überschrieb einen parallel
// veröffentlichten Production-Fix). Geprüft: gemeinsamer Lock (git-common-dir, atomar),
// EAS als einzige Live-Quelle, Ancestry-, Runtime-, Channel-, Plattform-Guard, zweiter
// EAS-Check direkt vor dem Publish, Nachkontrolle ohne Auto-Rollback, Dry-Run.
// Alles gegen ein Fixture-Repo + falsches `eas` — nie eine echte OTA.
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';
import { createHarness, destroyHarness, type FakeState } from './otaReleaseHarness';

const h = createHarness();
const confirmIos = (extra: string[] = []) => h.run(['--platform', 'ios', '--confirm', '--message', 'race test', ...extra]);
const dryIos = (extra: string[] = []) => h.run(['--platform', 'ios', '--dry-run', '--message', 'race test', ...extra], { envFile: h.fullEnvFile });
const withState = (patch: Partial<FakeState>) => h.setState({ ...h.defaultState(), ...patch });
const iosOnly = (gitCommitHash: string | null, runtimeVersion = '1.0.3', group = 'g-prod'): FakeState['groups'] =>
  [{ group, entries: [{ platform: 'ios', id: 'u-ios', gitCommitHash, runtimeVersion }] }];
const writeLock = (meta: Record<string, unknown>) => {
  mkdirSync(h.lockPath);
  writeFileSync(join(h.lockPath, 'owner.json'), JSON.stringify(meta));
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => { h.resetCalls(); h.setState(h.defaultState()); spawnSync('rm', ['-rf', h.lockPath]); });
afterAll(() => destroyHarness(h));

describe('Ancestry-Guard (EAS-Stand ⊆ Release-HEAD)', () => {
  it('1. aktive Production ist Vorfahre → Publish, Nachkontrolle grün, Lock danach frei', () => {
    const r = confirmIos();
    expect(r.code).toBe(0);
    expect(r.out).toContain(`ACTIVE PRODUCTION (EAS, frisch): Group g-prod · ios Update u-ios · gitCommitHash ${h.base}`);
    expect(r.out).toContain('Ancestry (aktiver Production-Commit ⊆ Release-HEAD): PASS');
    expect(r.out).toContain('Zweiter EAS-Check: Production unverändert.');
    expect(r.out).toContain('✅ Nachkontrolle');
    expect(h.updateCalls()).toHaveLength(1);
    expect(existsSync(h.lockPath)).toBe(false);                         // 7. Lock nach Erfolg entfernt
  });
  it('2. aktive Production ist KEIN Vorfahre → HARD STOP mit Begründung, keine OTA', () => {
    withState({ groups: iosOnly(h.other) });
    const r = confirmIos();
    expect(r.code).toBe(1);
    expect(r.out).toContain('Ancestry (aktiver Production-Commit ⊆ Release-HEAD): FAIL');
    expect(r.out).toContain(`aktiver Production-Commit ${h.other} ist kein Vorfahre von ${h.release}`);
    expect(r.out).toContain('Veröffentlichung würde bestehende Production-Fixes zurücksetzen');
    expect(r.out).toContain('HARD STOP');
    expect(h.updateCalls()).toEqual([]);
    expect(existsSync(h.lockPath)).toBe(false);                         // 8. Lock auch bei STOP entfernt
  });
  it('aktiver Production-Commit lokal unbekannt → STOP (nicht prüfbar), keine OTA', () => {
    withState({ groups: iosOnly('f'.repeat(40)) });
    const r = confirmIos();
    expect(r.code).toBe(1);
    expect(r.out).toContain('NICHT PRÜFBAR');
    expect(h.updateCalls()).toEqual([]);
  });
  it('kein aktiver Stand für die Plattform / ohne gitCommitHash → STOP', () => {
    withState({ groups: [{ group: 'g-a', entries: [{ platform: 'android', id: 'a', gitCommitHash: h.base, runtimeVersion: '1.0.3' }] }] });
    expect(confirmIos().code).toBe(1);
    withState({ groups: iosOnly(null) });
    expect(confirmIos().code).toBe(1);
    expect(h.updateCalls()).toEqual([]);
  });
  it('iOS-Release wird gegen die neueste iOS-Group geprüft, auch wenn danach nur Android veröffentlicht wurde', () => {
    withState({ groups: [
      { group: 'g-android-newer', entries: [{ platform: 'android', id: 'a', gitCommitHash: h.other, runtimeVersion: '1.0.3' }] },
      ...iosOnly(h.base),
    ] });
    const r = confirmIos();
    expect(r.code).toBe(0);
    expect(r.out).toContain('Group g-prod · ios');
  });
});

describe('Runtime-, Channel-, Plattform-, Clean-Tree-Guard', () => {
  it('3. Runtime-Mismatch (aktive Production auf anderer Runtime) → STOP', () => {
    withState({ groups: iosOnly(h.base, '1.0.2') });
    const r = confirmIos();
    expect(r.code).toBe(1);
    expect(r.out).toContain('Runtime-Mismatch: Release 1.0.3, erwartet 1.0.2');
    expect(h.updateCalls()).toEqual([]);
  });
  it('3b. --runtime muss zur Release-Runtime passen', () => {
    const r = confirmIos(['--runtime', '1.0.4']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Runtime-Mismatch: Release 1.0.3, erwartet 1.0.4');
  });
  it('4. falscher Channel / falscher Branch / Rollout / pausiert → STOP', () => {
    for (const patch of [{ channelName: 'preview' }, { branches: ['preview'] }, { branches: ['production', 'x'] }, { rollout: true }, { paused: true }] as Partial<FakeState>[]) {
      withState(patch);
      const r = confirmIos();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Channel/);
    }
    expect(h.updateCalls()).toEqual([]);
  });
  it('5. fehlende/ungültige Plattform → STOP, bevor EAS überhaupt gefragt wird', () => {
    for (const extra of [[], ['--platform', 'all']]) {
      expect(h.run([...extra, '--confirm', '--message', 'x']).code).toBe(1);
    }
    expect(h.calls()).toEqual([]);
  });
  it('unsauberer Worktree → STOP (gitCommitHash wäre falsch)', () => {
    writeFileSync(join(h.repo, 'DIRTY.txt'), 'x');
    try {
      const r = confirmIos();
      expect(r.code).toBe(1);
      expect(r.out).toContain('Worktree nicht sauber');
      expect(h.updateCalls()).toEqual([]);
    } finally { spawnSync('rm', ['-f', join(h.repo, 'DIRTY.txt')]); }
  });
});

describe('Gemeinsamer Release-Lock (git-common-dir)', () => {
  it('Lock liegt im git-common-dir (für alle Worktrees derselbe Pfad)', () => {
    const wt = join(h.dir, 'wt2');
    spawnSync('git', ['worktree', 'add', '-q', '--detach', wt, h.release], { cwd: h.repo });
    const common = (cwd: string) => spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' }).stdout.trim();
    expect(common(wt)).toBe(common(h.repo));
    expect(realpathSync(common(wt))).toBe(realpathSync(join(h.lockPath, '..')));   // macOS: /var ↔ /private/var
    spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: h.repo });
  });
  it('6. Lock einer lebenden Session → LOCKED/HARD STOP, keine EAS-Abfrage des Live-Stands, Lock bleibt unangetastet', () => {
    writeLock({ pid: process.pid, host: hostname(), startedAt: 'x', worktree: '/other', branch: 'b', head: 'h' });
    const r = confirmIos();
    expect(r.code).toBe(1);
    expect(r.out).toContain('HARD STOP: Release-Lock ist belegt');
    expect(r.out).toContain(`PID ${process.pid}`);
    expect(h.calls().some(a => a[0] === 'update:list' || a[0] === 'update')).toBe(false);
    expect(existsSync(h.lockPath)).toBe(true);
  });
  it('6b. echter Parallelstart: zweiter Prozess wird gestoppt, solange der erste veröffentlicht', async () => {
    withState({ sleepMs: 2500 });
    const first = spawn('node', ['scripts/update-production.mjs', '--platform', 'ios', '--confirm', '--message', 'first'], { cwd: h.repo, env: h.baseEnv() });
    let firstOut = '';
    first.stdout.on('data', d => { firstOut += d; });
    for (let i = 0; i < 100 && !h.calls().some(a => a[0] === 'update'); i++) await sleep(50);
    expect(existsSync(h.lockPath)).toBe(true);
    const second = confirmIos();
    expect(second.code).toBe(1);
    expect(second.out).toContain('HARD STOP: Release-Lock ist belegt');
    const code = await new Promise<number | null>(res => first.on('exit', c => res(c)));
    expect(code).toBe(0);
    expect(firstOut).toContain('✅ Nachkontrolle');
    expect(h.updateCalls()).toHaveLength(1);
    expect(existsSync(h.lockPath)).toBe(false);
  }, 20000);
  it('8. Lock wird bei Publish-Fehler entfernt (kein dauerhafter Lock)', () => {
    withState({ failUpdate: true });
    const r = confirmIos();
    expect(r.code).toBe(1);
    expect(r.out).toContain('`eas update` ist fehlgeschlagen');
    expect(existsSync(h.lockPath)).toBe(false);
  });
  it('8b. Lock wird bei Abbruchsignal (SIGTERM an die Prozessgruppe) entfernt', async () => {
    withState({ sleepMs: 4000 });
    const p = spawn('node', ['scripts/update-production.mjs', '--platform', 'ios', '--confirm', '--message', 'sig'], { cwd: h.repo, env: h.baseEnv(), detached: true });
    for (let i = 0; i < 100 && !h.calls().some(a => a[0] === 'update'); i++) await sleep(50);
    expect(existsSync(h.lockPath)).toBe(true);
    process.kill(-p.pid!, 'SIGTERM');
    await new Promise(res => p.on('exit', res));
    for (let i = 0; i < 40 && existsSync(h.lockPath); i++) await sleep(50);
    expect(existsSync(h.lockPath)).toBe(false);
  }, 20000);
  it('Stale Lock (Halter beendet) wird NICHT automatisch gelöscht; nur bewusst per --clear-stale-lock', () => {
    const dead = spawnSync('node', ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    writeLock({ pid: Number(dead.stdout), host: hostname(), startedAt: 'x', worktree: '/w', branch: 'b', head: 'h' });
    const r = confirmIos();
    expect(r.code).toBe(1);
    expect(r.out).toContain('Release-Lock ist STALE');
    expect(existsSync(h.lockPath)).toBe(true);
    const clear = h.run(['--clear-stale-lock']);
    expect(clear.code).toBe(0);
    expect(existsSync(h.lockPath)).toBe(false);
    expect(h.updateCalls()).toEqual([]);
  });
  it('--clear-stale-lock entfernt KEINEN Lock eines lebenden oder fremden Halters', () => {
    writeLock({ pid: process.pid, host: hostname(), startedAt: 'x' });
    expect(h.run(['--clear-stale-lock']).code).toBe(1);
    expect(existsSync(h.lockPath)).toBe(true);
    spawnSync('rm', ['-rf', h.lockPath]);
    writeLock({ pid: 1234567, host: 'anderer-rechner', startedAt: 'x' });
    expect(h.run(['--clear-stale-lock']).code).toBe(1);
    expect(existsSync(h.lockPath)).toBe(true);
  });
});

describe('Zweiter EAS-Check & Nachkontrolle', () => {
  it('9. Production ändert sich zwischen erstem und zweitem Check → HARD STOP, keine OTA', () => {
    withState({ raceAtList: 2, raceGroup: { group: 'g-foreign', entries: [{ platform: 'ios', id: 'u-f', gitCommitHash: h.release, runtimeVersion: '1.0.3' }] } });
    const r = confirmIos();
    expect(r.code).toBe(1);
    expect(r.out).toContain('HARD STOP: Production changed during release preparation.');
    expect(r.out).toContain('vorher: Group g-prod');
    expect(r.out).toContain('jetzt : Group g-foreign');
    expect(h.updateCalls()).toEqual([]);
    expect(existsSync(h.lockPath)).toBe(false);
  });
  it('10. veröffentlichter gitCommitHash ≠ Release-HEAD → Exit 2, KEIN zweiter Publish, KEIN Rollback', () => {
    withState({ publishHash: h.other });
    const r = confirmIos();
    expect(r.code).toBe(2);
    expect(r.out).toContain(`POST-PUBLISH: gitCommitHash ${h.other} ≠ Release-HEAD ${h.release}`);
    expect(r.out).toContain('Kein automatischer Rollback und keine zweite OTA');
    expect(h.updateCalls()).toHaveLength(1);
    expect(h.calls().some(a => a[0] === 'update:republish' || a[0] === 'update:rollback')).toBe(false);
    expect(existsSync(h.lockPath)).toBe(false);
  });
  it('10b. neue Group mit weiterer Plattform oder falscher Runtime → Nachkontrolle schlägt fehl', () => {
    withState({ publishExtraPlatform: 'android' });
    expect(confirmIos().out).toContain('Neue Group enthält weitere Plattformen');
    withState({ publishRuntime: '1.0.4' });
    expect(confirmIos().out).toContain('POST-PUBLISH: Runtime 1.0.4 ≠ 1.0.3');
  });
});

describe('Dry-Run (Preflight) und Quellen', () => {
  it('11. Dry-Run zeigt alle Guards, veröffentlicht nichts und hält keinen Lock', () => {
    const r = dryIos();
    expect(r.code).toBe(0);
    for (const needle of [`RELEASE HEAD: ${h.release}`, `gitCommitHash ${h.base}`, 'Ancestry (aktiver Production-Commit ⊆ Release-HEAD): PASS',
      'Runtime: Release 1.0.3 · erwartet 1.0.3', 'Platform: ios only · Channel/Branch: production/production', 'Release-Lock (', ': frei', 'Publish würde ERLAUBT.', '--dry-run: nichts veröffentlicht.']) {
      expect(r.out).toContain(needle);
    }
    expect(h.updateCalls()).toEqual([]);
    expect(existsSync(h.lockPath)).toBe(false);
  });
  it('11b. Dry-Run meldet VERWEIGERT bei Ancestry-Fehler und bei belegtem Lock', () => {
    withState({ groups: iosOnly(h.other) });
    const a = dryIos();
    expect(a.code).toBe(1);
    expect(a.out).toContain('Publish würde VERWEIGERT');
    h.setState(h.defaultState());
    writeLock({ pid: process.pid, host: hostname(), startedAt: 'x' });
    const b = dryIos();
    expect(b.code).toBe(1);
    expect(b.out).toContain('GESPERRT');
    expect(h.updateCalls()).toEqual([]);
  });
  it('12. Der Live-Stand kommt ausschliesslich aus EAS — nie aus ANYVO_MASTER_STATUS.md', () => {
    const src = readFileSync('scripts/update-production.mjs', 'utf8');
    // Erwähnt wird die Datei nur im Kommentar („nie …"); keine Code-Zeile liest oder nennt sie.
    const codeLines = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));
    expect(codeLines.join('\n')).not.toMatch(/MASTER_STATUS|ANYVO_MASTER/);
    expect(src).toContain("['update:list', '--branch', PRODUCTION_BRANCH");
    expect(src).toContain("['update:view', group, '--json']");
    // Ein „falscher" Master-Status im Repo beeinflusst die Entscheidung nicht.
    const doc = join(h.repo, 'ANYVO_MASTER_STATUS.md');
    writeFileSync(doc, `Production HEAD: ${h.other}\n`);
    try {
      const r = dryIos();
      expect(r.out).toContain(`gitCommitHash ${h.base}`);
      expect(r.out).not.toContain(`gitCommitHash ${h.other}`);
    } finally { spawnSync('rm', ['-f', doc]); }
  });
  it('Reihenfolge: Lock → EAS-Check 1 → (Guards) → EAS-Check 2 → update → EAS-Nachkontrolle', () => {
    expect(confirmIos().code).toBe(0);
    const seq = h.calls().map(a => a[0]).filter(c => c !== 'env:list');
    expect(seq).toEqual(['channel:view', 'update:list', 'update:view', 'update:list', 'update:view', 'update', 'update:list', 'update:view']);
  });
  it('12b. Doku: Master-Status ist nur Snapshot, EAS ist die Live-Quelle; Multi-Dog ist NICHT Production', () => {
    const ms = readFileSync('docs/agent/ANYVO_MASTER_STATUS.md', 'utf8');
    expect(ms).toContain('**EAS is the only binding source for what is live right now.**');
    expect(ms).toContain('must **never** be used on its own as a release source');
    expect(ms).toContain('| Production HEAD (iOS) | `34e618519b2da670fc5e7efd4ec43e08afc4ed53` |');
    expect(ms).toContain('**Not in Production:** Multi-Dog Track Overlays (`78322cfe65a3d5a95bf59edc33b651a896f6c9f8`');
    for (const f of ['AGENTS.md', 'CLAUDE.md']) expect(readFileSync(f, 'utf8')).toContain('Aktiven Production-Stand unmittelbar vor dem Publish FRISCH aus EAS lesen');
    const wf = readFileSync('docs/DEVELOPMENT_WORKFLOW.md', 'utf8');
    expect(wf).toContain('<git-common-dir>/anyvo-production-ota.lock');
    expect(wf).toContain('Andere Rechner, CI oder manuelle `eas update`-Aufrufe erfasst er nicht');
  });
});
