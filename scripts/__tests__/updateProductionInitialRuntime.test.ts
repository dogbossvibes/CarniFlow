// Production-OTA-Guard: Runtime-Isolation + erste OTA einer Runtime gegen den NATIVEN Build.
// Reale Lage 2026-10-06: iOS 1.0.4 (04cad8d) und iOS 1.0.3 (968884f) live; Android hat nur eine
// alte 1.0.1-OTA (d9b5a87, Seitenzweig) und noch KEINE OTA für 1.0.3 (Play-Build 44 c2b7ef45 /
// 5a0610b). Die erste Android-1.0.3-OTA darf nur gegen Build 44 geprüft werden — nie gegen die
// 1.0.1-OTA einer fremden Runtime. Alles gegen das Fixture-Repo + falsches `eas` — nie eine echte OTA.
//
// Fixture: base ⊂ release (HEAD); `other` ist KEIN Vorfahre von release.
//   base  ≙ 5a0610b (Build 44) bzw. 968884f (iOS 1.0.3)
//   other ≙ d9b5a87 (Android 1.0.1, Seitenzweig) bzw. 04cad8d (iOS 1.0.4)
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';
import { createHarness, destroyHarness, type FakeGroup, type FakeState } from './otaReleaseHarness';

// app.json auf main ist 1.0.4 (iOS-Linie) → Fixture explizit auf die Android-Runtime 1.0.3.
const h = createHarness({ appVersion: '1.0.3' });
const BUILD_44 = 'c2b7ef45-6d0a-4340-91d4-6f4fefb03418';

function call(fn: string, ...args: unknown[]): any {
  const js = `import * as m from './scripts/update-production.mjs'; process.stdout.write(JSON.stringify(m[${JSON.stringify(fn)}](...${JSON.stringify(args)})) ?? 'null');`;
  const r = spawnSync('node', ['--input-type=module', '-e', js], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

const group = (g: string, platform: string, gitCommitHash: string | null, runtimeVersion: string): FakeGroup =>
  ({ group: g, entries: [{ platform, id: `u-${g}`, gitCommitHash, runtimeVersion }] });
const reality = (): FakeGroup[] => [
  group('g-ios-104', 'ios', h.other, '1.0.4'),
  group('g-ios-103', 'ios', h.base, '1.0.3'),
  group('g-android-101', 'android', h.other, '1.0.1'),
];
const build44 = (patch: Record<string, unknown> = {}) => ({
  id: BUILD_44, status: 'FINISHED', platform: 'ANDROID', runtime: { version: '1.0.3' }, appVersion: '1.0.3',
  appBuildVersion: '44', updateChannel: { name: 'production' }, buildProfile: 'production', gitCommitHash: h.base, ...patch,
});
const withState = (patch: Partial<FakeState>) => h.setState({ ...h.defaultState(), groups: reality(), builds: { [BUILD_44]: build44() }, ...patch });

const INITIAL = ['--platform', 'android', '--initial-runtime-release', '--initial-runtime-build-id', BUILD_44];
const dryInitial = (extra: string[] = []) => h.run([...INITIAL, '--dry-run', '--message', 'android 1.0.3', ...extra], { envFile: h.fullEnvFile });
const confirmInitial = (extra: string[] = []) => h.run([...INITIAL, '--confirm', '--message', 'android 1.0.3', ...extra]);
const updateCalls = () => h.updateCalls();

beforeEach(() => { h.resetCalls(); withState({}); spawnSync('rm', ['-rf', h.lockPath]); });
afterAll(() => destroyHarness(h));

describe('Baseline-Auswahl: genau Plattform + Runtime', () => {
  const rows = (...r: [string, string, string][]) => ({ currentPage: r.map(([g, platforms, runtimeVersion]) => ({ group: g, platforms, runtimeVersion })) });
  it('1. bestehende OTA derselben Plattform + Runtime → neueste passende OTA ist Basis (E2E)', () => {
    withState({ groups: [group('g-a-104', 'android', h.other, '1.0.4'), group('g-a-103-new', 'android', h.base, '1.0.3'), group('g-a-103-old', 'android', h.other, '1.0.3'), ...reality()] });
    const r = h.run(['--platform', 'android', '--dry-run', '--message', 'x'], { envFile: h.fullEnvFile });
    expect(r.code).toBe(0);
    expect(r.out).toContain('Baseline-Auswahl: neueste Production-Group mit Plattform android UND Runtime 1.0.3');
    expect(r.out).toMatch(/ACTIVE PRODUCTION \(EAS, frisch\): Group g-a-103-new · android/);
    expect(r.out).toContain('Ancestry (aktiver Production-Commit ⊆ Release-HEAD): PASS');
    expect(r.out).toContain('Publish würde ERLAUBT');
  });
  it('2. neuere OTA derselben Plattform, andere Runtime → ignoriert', () => {
    expect(call('selectBaselineGroupId', rows(['g-104', 'android', '1.0.4'], ['g-103', 'android', '1.0.3']), { platform: 'android', runtime: '1.0.3' })).toBe('g-103');
    withState({ groups: [group('g-a-104', 'android', h.other, '1.0.4'), group('g-a-103', 'android', h.base, '1.0.3')] });
    const r = h.run(['--platform', 'android', '--dry-run', '--message', 'x'], { envFile: h.fullEnvFile });
    expect(r.out).not.toMatch(/ACTIVE PRODUCTION[^\n]*g-a-104/);
  });
  it('3. OTA einer anderen Plattform → ignoriert (iOS 1.0.3 ist keine Android-Basis)', () => {
    expect(call('selectBaselineGroupId', rows(), { platform: 'android', runtime: '1.0.3' })).toBeNull();
    withState({ groups: [group('g-ios-103', 'ios', h.base, '1.0.3')] });
    const r = h.run(['--platform', 'android', '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Kein aktiver Production-Stand für android / Runtime 1.0.3 in EAS gefunden');
    expect(updateCalls()).toEqual([]);
  });
  it('Fail-safe: unwirksamer EAS-Filter → STOP, keine OTA', () => {
    withState({ ignoreListFilters: true });
    expect(confirmInitial().code).toBe(1);
    expect(updateCalls()).toEqual([]);
  });
});

describe('Initial-Runtime-Modus: Anforderung', () => {
  it('4. keine OTA für android 1.0.3, ohne Initial-Flag → BLOCK; Android-1.0.1-OTA wird NICHT Basis', () => {
    const r = h.run(['--platform', 'android', '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Kein aktiver Production-Stand für android / Runtime 1.0.3 in EAS gefunden — keine Baseline (fail closed');
    expect(r.out).not.toMatch(/ACTIVE PRODUCTION[^\n]*g-android-101/);
    expect(updateCalls()).toEqual([]);
  });
  it('5. Initial-Flag ohne Build-ID (bzw. Build-ID ohne Flag) → BLOCK, bevor EAS gefragt wird', () => {
    for (const args of [
      ['--platform', 'android', '--initial-runtime-release', '--confirm', '--message', 'x'],
      ['--platform', 'android', '--initial-runtime-build-id', BUILD_44, '--confirm', '--message', 'x'],
    ]) {
      const r = h.run(args);
      expect(r.code).toBe(1);
    }
    expect(h.run(['--platform', 'android', '--initial-runtime-release', '--confirm', '--message', 'x']).out).toContain('verlangt --initial-runtime-build-id');
    expect(h.calls()).toEqual([]);
  });
  it('bestehende OTA für Plattform+Runtime + Initial-Flag → BLOCK (kein Bypass, normaler Guard gilt)', () => {
    withState({ groups: [group('g-a-103', 'android', h.base, '1.0.3'), ...reality()] });
    const r = confirmInitial();
    expect(r.code).toBe(1);
    expect(r.out).toContain('--initial-runtime-release unzulässig: für android / Runtime 1.0.3 existiert bereits Production-Group g-a-103');
    expect(updateCalls()).toEqual([]);
  });
});

describe('Initial-Runtime-Modus: Validierung des nativen Basis-Builds', () => {
  const blocked = (patch: Partial<FakeState>, text: string) => {
    withState(patch);
    const r = confirmInitial();
    expect(r.code).toBe(1);
    expect(r.out).toContain(text);
    expect(updateCalls()).toEqual([]);
  };
  it('6. Build-ID existiert nicht → BLOCK', () => blocked({ builds: {} }, `EAS-Build ${BUILD_44} nicht gefunden/lesbar`));
  it('7. Build nicht FINISHED → BLOCK', () => blocked({ builds: { [BUILD_44]: build44({ status: 'ERRORED' }) } }, 'Status ERRORED ≠ FINISHED'));
  it('8. Build-Plattform ios, Ziel android → BLOCK', () => blocked({ builds: { [BUILD_44]: build44({ platform: 'IOS' }) } }, 'Plattform ios ≠ Ziel android'));
  it('9. Build-Runtime 1.0.1, Ziel 1.0.3 → BLOCK', () => blocked({ builds: { [BUILD_44]: build44({ runtime: { version: '1.0.1' }, appVersion: '1.0.1' }) } }, 'Runtime 1.0.1 ≠ Ziel-Runtime 1.0.3'));
  it('App-Version / Channel / Profil müssen zur Production-Runtime passen', () => {
    blocked({ builds: { [BUILD_44]: build44({ appVersion: '1.0.4' }) } }, 'App-Version 1.0.4 passt nicht zur Ziel-Runtime 1.0.3');
    h.resetCalls();
    blocked({ builds: { [BUILD_44]: build44({ updateChannel: { name: 'preview' } }) } }, 'Channel preview ≠ production');
    h.resetCalls();
    blocked({ builds: { [BUILD_44]: build44({ buildProfile: 'preview' }) } }, 'Profil preview ≠ production');
  });
  it('10. Build ohne gitCommitHash → BLOCK', () => blocked({ builds: { [BUILD_44]: build44({ gitCommitHash: null }) } }, 'kein gültiger gitCommitHash'));
  it('11. nativer Build-Commit kein Vorfahre von HEAD → BLOCK', () => {
    withState({ builds: { [BUILD_44]: build44({ gitCommitHash: h.other }) } });
    const r = confirmInitial();
    expect(r.code).toBe(1);
    expect(r.out).toContain('Ancestry (nativer Basis-Build-Commit ⊆ Release-HEAD): FAIL');
    expect(updateCalls()).toEqual([]);
  });
  it('nativer Build-Commit lokal unbekannt → BLOCK (nicht prüfbar)', () => {
    withState({ builds: { [BUILD_44]: build44({ gitCommitHash: 'f'.repeat(40) }) } });
    const r = confirmInitial();
    expect(r.code).toBe(1);
    expect(r.out).toContain('Ancestry (nativer Basis-Build-Commit ⊆ Release-HEAD): NICHT PRÜFBAR');
  });
});

describe('Initial-Runtime-Modus: Android Build 44 (PASS) und Sicherheitsmechanismen', () => {
  it('12. Build 44 / Runtime 1.0.3 / HEAD Nachfahre → Dry-Run ERLAUBT; Android 1.0.1 und iOS nie Basis', () => {
    const r = dryInitial();
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Baseline-Auswahl: nativer Production-Build ${BUILD_44} (Plattform android, Runtime 1.0.3)`);
    expect(r.out).toContain('Bestehende Production-OTA für android / 1.0.3 (EAS, frisch): — (kein Stand gefunden)');
    expect(r.out).toContain(`ACTIVE PRODUCTION (EAS, frisch): NATIVER BUILD ${BUILD_44} · android · gitCommitHash ${h.base} · Runtime 1.0.3`);
    expect(r.out).toContain('Ancestry (nativer Basis-Build-Commit ⊆ Release-HEAD): PASS');
    expect(r.out).not.toMatch(/ACTIVE PRODUCTION[^\n]*(g-android-101|g-ios-)/);
    expect(r.out).toContain('Publish würde ERLAUBT');
    expect(updateCalls()).toEqual([]);
  });
  it('12b/17/20. echter Lauf: genau EIN android-Publish, Runtime 1.0.3, gitCommitHash = HEAD, iOS unverändert', () => {
    const r = confirmInitial();
    expect(r.code).toBe(0);
    const ups = updateCalls();
    expect(ups).toHaveLength(1);
    expect(ups[0]).toEqual(expect.arrayContaining(['--channel', 'production', '--environment', 'production', '--platform', 'android']));
    expect(ups[0]).not.toContain('ios');
    expect(r.out).toContain('✅ Nachkontrolle: neue Group live, Plattform/Runtime/gitCommitHash exakt; ios unverändert.');
    const st = h.state();
    expect(st.groups[0].entries).toEqual([expect.objectContaining({ platform: 'android', runtimeVersion: '1.0.3', gitCommitHash: h.release })]);
    expect(st.groups.filter(g => g.entries.some(e => e.platform === 'ios')).map(g => g.group)).toEqual(['g-ios-104', 'g-ios-103']);
    // 19. zweiter Check + erneute Build-Validierung vor dem Publish
    const seq = h.calls().map(a => a[0]).filter(c => c !== 'env:list');
    expect(seq.slice(0, seq.indexOf('update'))).toEqual(['channel:view', 'update:list', 'build:view', 'update:list', 'update:view', 'update:list', 'build:view']);
  });
  it('17. normaler Pfad nach dem Erst-Publish: Ancestry gegen die neue Android-1.0.3-OTA', () => {
    withState({ groups: [group('g-a-103', 'android', h.base, '1.0.3'), ...reality()] });
    const r = h.run(['--platform', 'android', '--confirm', '--message', 'hotfix']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Ancestry (aktiver Production-Commit ⊆ Release-HEAD): PASS');
  });
  it('13. Race: zwischen Preflight und Publish erscheint eine Android-1.0.3-OTA → HARD STOP, kein Umschalten', () => {
    // update:list #1 eigene Runtime, #2 andere Plattform, #3 Recheck eigene Runtime ← hier erscheint die fremde OTA
    withState({ raceAtList: 3, raceGroup: group('g-race-103', 'android', h.base, '1.0.3') });
    const r = confirmInitial();
    expect(r.code).toBe(1);
    expect(r.out).toContain('Production changed during release preparation.');
    expect(updateCalls()).toEqual([]);
  });
  it('14. dirty Worktree → BLOCK', () => {
    writeFileSync(join(h.repo, 'DIRTY.txt'), 'x');
    try {
      const r = confirmInitial();
      expect(r.code).toBe(1);
      expect(r.out).toContain('Worktree nicht sauber');
      expect(updateCalls()).toEqual([]);
    } finally { spawnSync('rm', ['-f', join(h.repo, 'DIRTY.txt')]); }
  });
  it('15. --platform all bzw. zwei Plattformen im Initial-Modus → BLOCK, bevor EAS gefragt wird', () => {
    const rest = ['--initial-runtime-release', '--initial-runtime-build-id', BUILD_44, '--confirm', '--message', 'x'];
    for (const p of [['--platform', 'all'], ['--platform', 'android', '--platform', 'ios'], ['--platform', 'ios', '--platform', 'android']]) {
      expect(h.run([...p, ...rest]).code).toBe(1);
    }
    expect(h.calls()).toEqual([]);
  });
  it('16. iOS-Initial-Release mit Android-Build-ID → BLOCK', () => {
    withState({ groups: [group('g-ios-104', 'ios', h.other, '1.0.4')] });   // keine iOS-1.0.3-OTA → Initial wäre formal zulässig
    const r = h.run(['--platform', 'ios', '--initial-runtime-release', '--initial-runtime-build-id', BUILD_44, '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Plattform android ≠ Ziel ios');
    expect(updateCalls()).toEqual([]);
  });
  it('18. Release-Lock bleibt: lebender Halter → HARD STOP, kein Live-Read, keine OTA', () => {
    mkdirSync(h.lockPath);
    writeFileSync(join(h.lockPath, 'owner.json'), JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }));
    try {
      const r = confirmInitial();
      expect(r.code).toBe(1);
      expect(r.out).toContain('HARD STOP: Release-Lock ist belegt');
      expect(h.calls().filter(a => a[0] !== 'env:list')).toEqual([]);
    } finally { spawnSync('rm', ['-rf', h.lockPath]); }
  });
  it('20. Nachkontrolle bleibt: falsche Runtime / fremder Hash / zweite Plattform / andere Plattform verändert → Exit 2', () => {
    for (const patch of [{ publishRuntime: '1.0.1' }, { publishHash: 'b'.repeat(40) }, { publishExtraPlatform: 'ios' }] as Partial<FakeState>[]) {
      h.resetCalls(); withState(patch);
      const r = confirmInitial();
      expect(r.code).toBe(2);
      expect(updateCalls()).toHaveLength(1);
    }
    // update:list #4 neueste Plattform-Group, #5 aktive Group der Runtime, #6 andere Plattform → dort erscheint eine neue iOS-Group
    h.resetCalls(); withState({ raceAtList: 6, raceGroup: group('g-ios-new', 'ios', h.base, '1.0.3') });
    const r = confirmInitial();
    expect(r.code).toBe(2);
    expect(r.out).toContain('Neueste Group der anderen Plattform hat sich geändert (g-ios-104 → g-ios-new)');
  });
});

describe('Reine Logik', () => {
  it('evaluateInitialRuntimeRequest', () => {
    expect(call('evaluateInitialRuntimeRequest', { initialRuntimeRelease: true, buildId: BUILD_44 })).toEqual([]);
    expect(call('evaluateInitialRuntimeRequest', { initialRuntimeRelease: false })).toEqual([]);
    expect(call('evaluateInitialRuntimeRequest', { initialRuntimeRelease: true, buildId: '' }).join()).toContain('verlangt --initial-runtime-build-id');
  });
  it('evaluateNativeBaseBuild: Build 44 gültig; parseNativeBuild normalisiert die EAS-Felder', () => {
    const b = call('parseNativeBuild', build44());
    expect(b).toEqual({ id: BUILD_44, status: 'FINISHED', platform: 'android', runtimeVersion: '1.0.3', appVersion: '1.0.3', appBuildVersion: '44', channel: 'production', buildProfile: 'production', gitCommitHash: h.base });
    expect(call('evaluateNativeBaseBuild', { build: b, buildId: BUILD_44, platform: 'android', runtime: '1.0.3' })).toEqual([]);
    expect(call('parseNativeBuild', null)).toBeNull();
  });
  it('productionChanged erkennt auch einen anderen nativen Basis-Build', () => {
    const a = { group: null, gitCommitHash: 'a', runtimeVersion: '1.0.3', buildId: 'b1' };
    expect(call('productionChanged', a, { ...a })).toBe(false);
    expect(call('productionChanged', a, { ...a, buildId: 'b2' })).toBe(true);
    expect(call('productionChanged', a, null)).toBe(true);
  });
});
