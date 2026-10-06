// Production-OTA-Guard mit mehreren gleichzeitig aktiven Production-Runtimes
// (Stand 2026-10-06: iOS 1.0.3 → Group 455dc249 / 968884f, iOS 1.0.4 → Group fcd879d9 / 04cad8d).
// Baseline = neueste Group mit GENAU (Plattform, Ziel-Runtime) — nie die global neueste.
// Fail closed bei fehlender Baseline / unklarer Runtime. Alle übrigen Guards bleiben.
// Alles gegen Fixture-Repos + falsches `eas` — nie eine echte OTA.
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createHarness, destroyHarness, type FakeGroup, type Harness } from './otaReleaseHarness';

// Das Wrapper-Modul ist ESM (.mjs) — reine Funktionen wie in updateProduction.test.ts über
// einen Node-Subprozess aufrufen (Argumente/Ergebnis als JSON).
function call(fn: string, ...args: unknown[]): any {
  const js = `import * as m from './scripts/update-production.mjs'; process.stdout.write(JSON.stringify(m[${JSON.stringify(fn)}](...${JSON.stringify(args)})) ?? 'null');`;
  const r = spawnSync('node', ['--input-type=module', '-e', js], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}
const selectBaselineGroupId = (l: unknown, q: unknown) => call('selectBaselineGroupId', l, q);
const resolveTargetRuntime = (q: unknown) => call('resolveTargetRuntime', q);
const resolveReleaseRuntime = (a: unknown) => call('resolveReleaseRuntime', a);
const evaluatePublishGuards = (q: unknown): string[] => call('evaluatePublishGuards', q);

type Row = { group: string; platforms: string; runtimeVersion: string };
const list = (...rows: Row[]) => ({ name: 'production', currentPage: rows });
const row = (group: string, platforms: string, runtimeVersion: string): Row => ({ group, platforms, runtimeVersion });

describe('Baseline-Auswahl (rein): Plattform UND Runtime, neueste passende Group', () => {
  const older103 = row('g-455-103', 'ios', '1.0.3');
  const newer104 = row('g-fcd-104', 'ios', '1.0.4');
  it('A. iOS 1.0.3 älter, iOS 1.0.4 neuer, Ziel 1.0.3 → 1.0.3 gewählt', () => {
    expect(selectBaselineGroupId(list(newer104, older103), { platform: 'ios', runtime: '1.0.3' })).toBe('g-455-103');
  });
  it('B. gleiche Lage, Ziel 1.0.4 → 1.0.4 gewählt', () => {
    expect(selectBaselineGroupId(list(newer104, older103), { platform: 'ios', runtime: '1.0.4' })).toBe('g-fcd-104');
  });
  it('C. global neueste Group ist Android 1.0.4, Ziel iOS 1.0.4 → Android ignoriert (und umgekehrt)', () => {
    const l = list(row('g-android', 'android', '1.0.4'), row('g-ios', 'ios', '1.0.4'));
    expect(selectBaselineGroupId(l, { platform: 'ios', runtime: '1.0.4' })).toBe('g-ios');
    expect(selectBaselineGroupId(l, { platform: 'android', runtime: '1.0.4' })).toBe('g-android');
    expect(selectBaselineGroupId(list(row('g-ios', 'ios', '1.0.4')), { platform: 'android', runtime: '1.0.4' })).toBeNull();
  });
  it('D. nur iOS 1.0.4 vorhanden, Ziel 1.0.3 → keine Baseline (nicht 1.0.4 übernehmen) → fail closed', () => {
    expect(selectBaselineGroupId(list(newer104), { platform: 'ios', runtime: '1.0.3' })).toBeNull();
    const p = evaluatePublishGuards({ platform: 'ios', active: null, releaseHead: 'a'.repeat(40), releaseRuntime: '1.0.3', expectedRuntime: '1.0.3', isAncestor: null, dirty: false });
    expect(p.join('\n')).toMatch(/Kein aktiver Production-Stand für ios \/ Runtime 1\.0\.3 .*fail closed/);
  });
  it('G. zwei 1.0.3-Groups (dazwischen 1.0.4) → neuere 1.0.3', () => {
    expect(selectBaselineGroupId(list(row('g-103-new', 'ios', '1.0.3'), newer104, row('g-103-old', 'ios', '1.0.3')), { platform: 'ios', runtime: '1.0.3' })).toBe('g-103-new');
  });
  it('H. zwei 1.0.4-Groups → neuere 1.0.4', () => {
    expect(selectBaselineGroupId(list(row('g-104-new', 'ios', '1.0.4'), older103, row('g-104-old', 'ios', '1.0.4')), { platform: 'ios', runtime: '1.0.4' })).toBe('g-104-new');
  });
  it('Group mit mehreren Plattformen zählt für jede enthaltene Plattform (runtime-genau)', () => {
    expect(selectBaselineGroupId(list(row('g-both', 'android, ios', '1.0.3')), { platform: 'ios', runtime: '1.0.3' })).toBe('g-both');
  });
  it('ohne gültige Plattform/Runtime → null (nie raten)', () => {
    for (const q of [{ platform: 'all', runtime: '1.0.4' }, { platform: 'ios', runtime: '' }, { platform: 'ios', runtime: undefined as unknown as string }]) {
      expect(selectBaselineGroupId(list(newer104), q)).toBeNull();
    }
  });
});

describe('Ziel-Runtime (rein)', () => {
  it('I. --runtime fehlt, app.json eindeutig 1.0.4 → 1.0.4 aus app.json', () => {
    expect(resolveTargetRuntime({ runtimeFlag: undefined, releaseRuntime: '1.0.4' })).toEqual({ runtime: '1.0.4', source: 'app.json', problems: [] });
  });
  it('--runtime bestätigt nur; Widerspruch zur Bundle-Runtime → Mismatch', () => {
    expect(resolveTargetRuntime({ runtimeFlag: '1.0.4', releaseRuntime: '1.0.4' }).runtime).toBe('1.0.4');
    const r = resolveTargetRuntime({ runtimeFlag: '1.0.3', releaseRuntime: '1.0.4' });
    expect(r.runtime).toBeNull();
    expect(r.problems).toEqual(['Runtime-Mismatch: Release 1.0.4, erwartet 1.0.3']);
  });
  it('J. Runtime nicht eindeutig bestimmbar → fail closed (auch --runtime rettet das nicht)', () => {
    expect(resolveReleaseRuntime({ expo: { version: '1.0.4', runtimeVersion: { policy: 'fingerprint' } } })).toBeNull();
    expect(resolveReleaseRuntime({ expo: { runtimeVersion: { policy: 'appVersion' } } })).toBeNull();
    expect(resolveTargetRuntime({ runtimeFlag: undefined, releaseRuntime: null }).runtime).toBeNull();
    expect(resolveTargetRuntime({ runtimeFlag: '1.0.4', releaseRuntime: null }).runtime).toBeNull();
    expect(resolveTargetRuntime({ runtimeFlag: '', releaseRuntime: '1.0.4' }).problems).toEqual(['--runtime ohne Wert']);
  });
});

describe('Ancestry bleibt Pflicht (rein)', () => {
  const active = { group: 'g', id: 'u', platform: 'ios', gitCommitHash: 'b'.repeat(40), runtimeVersion: '1.0.3' };
  const base = { platform: 'ios', active, releaseHead: 'a'.repeat(40), releaseRuntime: '1.0.3', expectedRuntime: '1.0.3', dirty: false };
  it('E. 1.0.3-Baseline vorhanden, Release kein Nachfahre → BLOCK', () => {
    expect(evaluatePublishGuards({ ...base, isAncestor: false }).join('\n')).toContain('ist kein Vorfahre');
  });
  it('F. 1.0.4-Baseline vorhanden, Release korrekter Nachfahre → PASS', () => {
    expect(evaluatePublishGuards({ ...base, active: { ...active, runtimeVersion: '1.0.4' }, releaseRuntime: '1.0.4', expectedRuntime: '1.0.4', isAncestor: true })).toEqual([]);
  });
  it('Baseline mit anderer Runtime als Ziel wird nie stillschweigend akzeptiert', () => {
    expect(evaluatePublishGuards({ ...base, active: { ...active, runtimeVersion: '1.0.4' }, isAncestor: true }).join('\n')).toContain('Baseline-Runtime 1.0.4 ≠ Ziel-Runtime 1.0.3');
  });
});

// ── End-to-End gegen Fixture-Repos ────────────────────────────────────────────
// Fixture-Repo: base ⊂ release; `other` zweigt von base ab (kein Vorfahre von release).
// Reales Modell: base = 968884f (1.0.3-Production), release = 1.0.3-Hotfix auf Basis 968884f,
// other = 04cad8d (1.0.4-Linie: global neuer, aber NICHT im Hotfix enthalten).
const ios = (group: string, gitCommitHash: string | null, runtimeVersion: string): FakeGroup =>
  ({ group, entries: [{ platform: 'ios', id: `u-${group}`, gitCommitHash, runtimeVersion }] });
const android = (group: string, gitCommitHash: string | null, runtimeVersion: string): FakeGroup =>
  ({ group, entries: [{ platform: 'android', id: `u-${group}`, gitCommitHash, runtimeVersion }] });
const listCalls = (h: Harness) => h.calls().filter(a => a[0] === 'update:list');

describe('E2E: Hotfix für die ältere Runtime 1.0.3 (reale Regression 968884f ↔ 04cad8d)', () => {
  let h: Harness;
  beforeAll(() => { h = createHarness({ appVersion: '1.0.3' }); });
  afterAll(() => destroyHarness(h));
  beforeEach(() => h.resetCalls());

  it('global neuere 1.0.4-Group (04cad8d-Linie) blockiert einen legitimen 1.0.3-Hotfix auf Basis 968884f NICHT', () => {
    h.setState({ groups: [ios('g-fcd879d9-104', h.other, '1.0.4'), ios('g-455dc249-103', h.base, '1.0.3')] });
    const dry = h.run(['--platform', 'ios', '--runtime', '1.0.3', '--dry-run', '--message', 'hotfix 1.0.3'], { envFile: h.fullEnvFile });
    expect(dry.code).toBe(0);
    expect(dry.out).toContain('Baseline-Auswahl: neueste Production-Group mit Plattform ios UND Runtime 1.0.3');
    expect(dry.out).toContain(`ACTIVE PRODUCTION (EAS, frisch): Group g-455dc249-103 · ios Update u-g-455dc249-103 · gitCommitHash ${h.base} · Runtime 1.0.3`);
    expect(dry.out).not.toMatch(/ACTIVE PRODUCTION[^\n]*g-fcd879d9-104/);
    expect(dry.out).toContain('Ancestry (aktiver Production-Commit ⊆ Release-HEAD): PASS');
    expect(dry.out).toContain('Runtime: Release 1.0.3 · erwartet 1.0.3 (--runtime)');
    expect(dry.out).toContain('Publish würde ERLAUBT.');
    // EAS wird serverseitig auf Plattform + Runtime gefiltert (ältere Runtimes fallen nicht aus der 50er-Seite)
    expect(listCalls(h)[0]).toEqual(expect.arrayContaining(['--platform', 'ios', '--runtime-version', '1.0.3']));
    expect(h.updateCalls()).toEqual([]);
  });
  it('echter (Fake-)Publish: neue 1.0.3-Group, Nachkontrolle grün, 1.0.4-Group unberührt, Lock frei', () => {
    h.setState({ groups: [ios('g-fcd879d9-104', h.other, '1.0.4'), ios('g-455dc249-103', h.base, '1.0.3')] });
    const r = h.run(['--platform', 'ios', '--runtime', '1.0.3', '--confirm', '--message', 'hotfix 1.0.3']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Zweiter EAS-Check: Production unverändert.');
    expect(r.out).toContain('✅ Nachkontrolle');
    expect(h.updateCalls()).toHaveLength(1);
    const st = h.state();
    expect(st.groups[0].entries[0]).toMatchObject({ platform: 'ios', runtimeVersion: '1.0.3', gitCommitHash: h.release });
    expect(st.groups.find(g => g.group === 'g-fcd879d9-104')!.entries[0].gitCommitHash).toBe(h.other);
    expect(existsSync(h.lockPath)).toBe(false);
  });
  it('1.0.3-Hotfix, der NICHT von der aktiven 1.0.3-Baseline abstammt → weiterhin BLOCK', () => {
    h.setState({ groups: [ios('g-104', h.base, '1.0.4'), ios('g-103', h.other, '1.0.3')] });
    const r = h.run(['--platform', 'ios', '--runtime', '1.0.3', '--confirm', '--message', 'bad hotfix']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Ancestry (aktiver Production-Commit ⊆ Release-HEAD): FAIL');
    expect(r.out).toContain('HARD STOP');
    expect(h.updateCalls()).toEqual([]);
  });
  it('D. keine 1.0.3-Baseline (nur 1.0.4) → fail closed, 1.0.4 wird NICHT übernommen', () => {
    h.setState({ groups: [ios('g-104', h.base, '1.0.4')] });
    const r = h.run(['--platform', 'ios', '--runtime', '1.0.3', '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Kein aktiver Production-Stand für ios / Runtime 1.0.3');
    expect(r.out).toContain('ACTIVE PRODUCTION (EAS, frisch): — (kein Stand gefunden)');
    expect(h.updateCalls()).toEqual([]);
  });
  it('--runtime 1.0.4 auf einem 1.0.3-Bundle → Mismatch, STOP vor jeder EAS-Baseline-Abfrage', () => {
    const r = h.run(['--platform', 'ios', '--runtime', '1.0.4', '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Runtime-Mismatch: Release 1.0.3, erwartet 1.0.4');
    expect(listCalls(h)).toEqual([]);
    expect(h.updateCalls()).toEqual([]);
  });
  it('C (E2E). neueste globale Group ist Android → iOS-Baseline unberührt davon', () => {
    h.setState({ groups: [android('g-android', h.other, '1.0.3'), ios('g-ios-103', h.base, '1.0.3')] });
    const r = h.run(['--platform', 'ios', '--runtime', '1.0.3', '--dry-run', '--message', 'x'], { envFile: h.fullEnvFile });
    expect(r.code).toBe(0);
    expect(r.out).toContain('ACTIVE PRODUCTION (EAS, frisch): Group g-ios-103');
  });
});

describe('E2E: Release auf der neueren Runtime (aus app.json)', () => {
  let h: Harness;
  beforeAll(() => { h = createHarness({ appVersion: '1.0.4' }); });
  afterAll(() => destroyHarness(h));
  beforeEach(() => h.resetCalls());

  it('I. ohne --runtime: Ziel = app.json 1.0.4; eine global NEUERE 1.0.3-Group ändert daran nichts', () => {
    h.setState({ groups: [ios('g-103-hotfix', h.other, '1.0.3'), ios('g-104', h.base, '1.0.4')] });
    const r = h.run(['--platform', 'ios', '--dry-run', '--message', 'x'], { envFile: h.fullEnvFile });
    expect(r.code).toBe(0);
    expect(r.out).toContain('Ziel: ios · Runtime 1.0.4 (app.json)');
    expect(r.out).toContain(`ACTIVE PRODUCTION (EAS, frisch): Group g-104 · ios Update u-g-104 · gitCommitHash ${h.base} · Runtime 1.0.4`);
    expect(r.out).toContain('Runtime: Release 1.0.4 · erwartet 1.0.4 (app.json)');
  });
  it('F (E2E). 1.0.4-Baseline + korrekter Nachfahre → Publish, Nachkontrolle grün', () => {
    h.setState({ groups: [ios('g-104', h.base, '1.0.4'), ios('g-103', h.other, '1.0.3')] });
    const r = h.run(['--platform', 'ios', '--runtime', '1.0.4', '--confirm', '--message', 'x']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('✅ Nachkontrolle');
  });
  it('H (E2E). zwei 1.0.4-Groups → neuere ist Baseline; ihr Commit muss Vorfahre sein', () => {
    h.setState({ groups: [ios('g-104-new', h.other, '1.0.4'), ios('g-104-old', h.base, '1.0.4')] });
    const r = h.run(['--platform', 'ios', '--dry-run', '--message', 'x'], { envFile: h.fullEnvFile });
    expect(r.code).toBe(1);
    expect(r.out).toContain('ACTIVE PRODUCTION (EAS, frisch): Group g-104-new');
    expect(r.out).toContain('Ancestry (aktiver Production-Commit ⊆ Release-HEAD): FAIL');
  });
  it('Race in der Ziel-Runtime zwischen Check 1 und 2 → HARD STOP', () => {
    h.setState({ groups: [ios('g-104', h.base, '1.0.4')], raceAtList: 2, raceGroup: ios('g-104-foreign', h.release, '1.0.4') });
    const r = h.run(['--platform', 'ios', '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('HARD STOP: Production changed during release preparation.');
    expect(h.updateCalls()).toEqual([]);
  });
});

// Erste OTA einer Runtime: Basis ist der NATIVE Production-Build derselben Plattform+Runtime
// (--initial-runtime-build-id), nie die OTA einer anderen Runtime. Fixture: Build b-ios-105 ≙ base.
const IOS_BUILD = 'b-ios-105';
const iosBuild = (h: Harness, patch: Record<string, unknown> = {}) => ({
  id: IOS_BUILD, status: 'FINISHED', platform: 'IOS', runtime: { version: '1.0.5' }, appVersion: '1.0.5', appBuildVersion: '50',
  updateChannel: { name: 'production' }, buildProfile: 'production', gitCommitHash: h.base, ...patch,
});
const INITIAL_IOS = ['--platform', 'ios', '--initial-runtime-release', '--initial-runtime-build-id', IOS_BUILD];

describe('E2E: erste OTA einer neuen Runtime (--initial-runtime-release, ausdrücklich)', () => {
  let h: Harness;
  beforeAll(() => { h = createHarness({ appVersion: '1.0.5' }); });
  afterAll(() => destroyHarness(h));
  beforeEach(() => h.resetCalls());

  it('ohne Flag: noch keine 1.0.5-Group → fail closed', () => {
    h.setState({ groups: [ios('g-104', h.base, '1.0.4')], builds: { [IOS_BUILD]: iosBuild(h) } });
    const r = h.run(['--platform', 'ios', '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Kein aktiver Production-Stand für ios / Runtime 1.0.5');
    expect(h.updateCalls()).toEqual([]);
  });
  it('mit Flag + Build-ID: Basis = nativer 1.0.5-Build (nicht die neueste iOS-Group), Ancestry Pflicht → Publish, Nachkontrolle auf 1.0.5', () => {
    h.setState({ groups: [android('g-a', h.other, '1.0.5'), ios('g-104', h.other, '1.0.4')], builds: { [IOS_BUILD]: iosBuild(h) } });
    const r = h.run([...INITIAL_IOS, '--confirm', '--message', 'x']);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`ERSTE OTA dieser Runtime (--initial-runtime-release, Basis-Build ${IOS_BUILD})`);
    expect(r.out).toContain(`ACTIVE PRODUCTION (EAS, frisch): NATIVER BUILD ${IOS_BUILD} · ios · gitCommitHash ${h.base} · Runtime 1.0.5`);
    expect(r.out).not.toMatch(/ACTIVE PRODUCTION[^\n]*g-104/);
    expect(r.out).toContain('✅ Nachkontrolle');
    expect(h.state().groups[0].entries[0]).toMatchObject({ platform: 'ios', runtimeVersion: '1.0.5' });
  });
  it('mit Flag, aber 1.0.5-Group existiert bereits → unzulässig, STOP', () => {
    h.setState({ groups: [ios('g-105', h.base, '1.0.5'), ios('g-104', h.base, '1.0.4')], builds: { [IOS_BUILD]: iosBuild(h) } });
    const r = h.run([...INITIAL_IOS, '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('--initial-runtime-release unzulässig');
    expect(h.updateCalls()).toEqual([]);
  });
  it('mit Flag: Ancestry gegen den nativen Basis-Build bleibt Pflicht', () => {
    h.setState({ groups: [ios('g-104', h.base, '1.0.4')], builds: { [IOS_BUILD]: iosBuild(h, { gitCommitHash: h.other }) } });
    const r = h.run([...INITIAL_IOS, '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Ancestry (nativer Basis-Build-Commit ⊆ Release-HEAD): FAIL');
    expect(h.updateCalls()).toEqual([]);
  });
});

describe('E2E: Runtime nicht bestimmbar (J)', () => {
  let h: Harness;
  beforeAll(() => { h = createHarness({ appJson: { expo: { version: '1.0.4', runtimeVersion: { policy: 'fingerprint' }, ios: { bundleIdentifier: 'com.anyvo.app' } } } }); });
  afterAll(() => destroyHarness(h));
  it('fingerprint-Policy → fail closed, keine Baseline-Abfrage, kein Publish (auch mit --runtime)', () => {
    for (const extra of [[], ['--runtime', '1.0.4']]) {
      h.resetCalls();
      const r = h.run(['--platform', 'ios', ...extra, '--confirm', '--message', 'x']);
      expect(r.code).toBe(1);
      expect(r.out).toContain('Release-Runtime nicht bestimmbar');
      expect(listCalls(h)).toEqual([]);
      expect(h.updateCalls()).toEqual([]);
      expect(existsSync(h.lockPath)).toBe(false);
    }
  });
});

describe('Härtung: erste OTA einer Runtime (--initial-runtime-release)', () => {
  let h: Harness;
  beforeAll(() => { h = createHarness({ appVersion: '1.0.5' }); });
  afterAll(() => destroyHarness(h));
  beforeEach(() => h.resetCalls());
  const setup = (groups: FakeGroup[], build: Record<string, unknown> | null = iosBuild(h)) =>
    h.setState({ groups, builds: build ? { [IOS_BUILD]: build } : {} });
  const confirm = (extra: string[] = []) => h.run([...INITIAL_IOS, '--confirm', '--message', 'first 1.0.5', ...extra]);
  const dry = () => h.run([...INITIAL_IOS, '--dry-run', '--message', 'first 1.0.5'], { envFile: h.fullEnvFile });

  it('A. keine 1.0.5-Group + Schalter OHNE --confirm → STOP (Exit 1), keinerlei EAS-Aufruf', () => {
    setup([ios('g-104', h.base, '1.0.4')]);
    const r = h.run([...INITIAL_IOS, '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('STOP: --initial-runtime-release ohne --confirm. Kein Update veröffentlicht.');
    expect(h.calls()).toEqual([]);
  });
  it('B. + --confirm + Build gültig + Ancestry PASS → Publish erlaubt, Nachkontrolle grün', () => {
    setup([ios('g-104', h.base, '1.0.4')]);
    const r = confirm();
    expect(r.code).toBe(0);
    expect(r.out).toContain('Ancestry (nativer Basis-Build-Commit ⊆ Release-HEAD): PASS');
    expect(h.updateCalls()).toHaveLength(1);
    expect(r.out).toContain('✅ Nachkontrolle');
  });
  it('C. + --confirm + Ancestry FAIL → BLOCK (kein „erste Runtime, also egal")', () => {
    setup([ios('g-104', h.base, '1.0.4')], iosBuild(h, { gitCommitHash: h.other }));
    const r = confirm();
    expect(r.code).toBe(1);
    expect(r.out).toContain('ist kein Vorfahre');
    expect(h.updateCalls()).toEqual([]);
  });
  it('D. Ziel-Runtime-Group existiert bereits → BLOCK (nicht still ignoriert)', () => {
    setup([ios('g-105', h.base, '1.0.5'), ios('g-104', h.base, '1.0.4')]);
    const r = confirm();
    expect(r.code).toBe(1);
    expect(r.out).toContain('--initial-runtime-release unzulässig: für ios / Runtime 1.0.5 existiert bereits Production-Group g-105');
    expect(r.out).not.toContain('FIRST OTA FOR RUNTIME');
    expect(h.updateCalls()).toEqual([]);
  });
  it('E. keine Ziel-Runtime-Group und KEIN Schalter → fail closed', () => {
    setup([ios('g-104', h.base, '1.0.4')]);
    const r = h.run(['--platform', 'ios', '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Kein aktiver Production-Stand für ios / Runtime 1.0.5');
    expect(h.updateCalls()).toEqual([]);
  });
  it('F. Basis = nativer Build der Ziel-Runtime — weder die neueste iOS-Group noch eine Android-Group', () => {
    setup([android('g-android-104', h.other, '1.0.4'), ios('g-ios-104', h.other, '1.0.4'), ios('g-ios-103', h.other, '1.0.3')]);
    const r = dry();
    expect(r.code).toBe(0);
    expect(r.out).toContain(`ACTIVE PRODUCTION (EAS, frisch): NATIVER BUILD ${IOS_BUILD} · ios · gitCommitHash ${h.base} · Runtime 1.0.5`);
    expect(r.out).not.toMatch(/ACTIVE PRODUCTION[^\n]*g-(android|ios)-/);
    expect(r.out).toContain('Publish würde ERLAUBT.');
    expect(h.updateCalls()).toEqual([]);
  });
  it('G. kein gültiger nativer Basis-Build (unbekannt / andere Plattform) → fail closed, keine Ersatz-Basis', () => {
    setup([ios('g-ios-104', h.base, '1.0.4')], null);
    const r = confirm();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`EAS-Build ${IOS_BUILD} nicht gefunden/lesbar`);
    expect(r.out).toContain('Kein gültiger nativer Basis-Build für die erste OTA von ios / Runtime 1.0.5');
    expect(r.out).not.toContain('FIRST OTA FOR RUNTIME');
    h.resetCalls();
    setup([ios('g-ios-104', h.base, '1.0.4')], iosBuild(h, { platform: 'ANDROID' }));
    expect(confirm().out).toContain('Plattform android ≠ Ziel ios');
    expect(h.updateCalls()).toEqual([]);
  });
  it('H. Logging: FIRST OTA FOR RUNTIME mit Plattform, Ziel-Runtime/-Commit und nativem Basis-Build', () => {
    setup([ios('g-ios-104', h.other, '1.0.4')]);
    const r = dry();
    const banner = r.out.slice(r.out.indexOf('FIRST OTA FOR RUNTIME'));
    for (const needle of ['FIRST OTA FOR RUNTIME', 'Platform: ios', 'Target Runtime: 1.0.5', `Target Commit: ${h.release}`,
      'No existing production group for ios / runtime 1.0.5.', `Build: ${IOS_BUILD}`, 'Runtime: 1.0.5', `Commit: ${h.base}`]) {
      expect(banner).toContain(needle);
    }
    expect(r.out).toMatch(/={66}\nFIRST OTA FOR RUNTIME/);
  });
  it('I. Nachkontrolle akzeptiert nur die neue Group mit korrekter Runtime UND Production-Zuordnung', () => {
    setup([ios('g-104', h.base, '1.0.4')]);
    const r = confirm();
    expect(r.code).toBe(0);
    const seq = h.calls().map(a => a[0]).filter(c => c !== 'env:list');
    // neueste Plattform-Group, aktive Group der Release-Runtime, neueste Group der anderen Plattform
    expect(seq.slice(seq.indexOf('update') + 1)).toEqual(['update:list', 'update:view', 'update:list', 'update:view', 'update:list']);
    expect(h.state().groups[0].entries[0]).toMatchObject({ runtimeVersion: '1.0.5', gitCommitHash: h.release });
  });
  it('J. Nachkontrolle blockiert falsche Runtime der neuen Group (Exit 2, kein Rollback, keine zweite OTA)', () => {
    h.setState({ groups: [ios('g-104', h.base, '1.0.4')], builds: { [IOS_BUILD]: iosBuild(h) }, publishRuntime: '1.0.6' });
    const r = confirm();
    expect(r.code).toBe(2);
    expect(r.out).toContain('POST-PUBLISH: Runtime 1.0.6 ≠ 1.0.5');
    expect(r.out).toContain('ist nicht die aktive Production-Group für ios / Runtime 1.0.5');
    expect(h.updateCalls()).toHaveLength(1);
  });
});

describe('Härtung (rein): Banner, Zuordnungs-Nachkontrolle, Initial-Basis', () => {
  it('formatFirstRuntimeBanner enthält alle Pflichtangaben', () => {
    const b: string = call('formatFirstRuntimeBanner', { platform: 'ios', targetRuntime: '1.0.5', targetCommit: 'abc123', baseline: { buildId: 'b-1', runtimeVersion: '1.0.5', gitCommitHash: 'def456' } });
    expect(b.split('\n')).toEqual(expect.arrayContaining(['FIRST OTA FOR RUNTIME', 'Platform: ios', 'Target Runtime: 1.0.5', 'Target Commit: abc123', '  Build: b-1', '  Runtime: 1.0.5', '  Commit: def456']));
  });
  it('verifyPostPublish: neue Group muss die aktive Group der Release-Runtime sein', () => {
    const after = { group: 'g-new', platform: 'ios', platforms: ['ios'], runtimeVersion: '1.0.5', gitCommitHash: 'a'.repeat(40) };
    const base = { before: { group: 'g-old' }, after, platform: 'ios', releaseHead: 'a'.repeat(40), releaseRuntime: '1.0.5' };
    expect(call('verifyPostPublish', { ...base, afterForRuntime: { group: 'g-new' } })).toEqual([]);
    expect((call('verifyPostPublish', { ...base, afterForRuntime: null }) as string[]).join('\n')).toContain('nicht die aktive Production-Group');
    expect((call('verifyPostPublish', { ...base, afterForRuntime: { group: 'g-other' } }) as string[]).join('\n')).toContain('gefunden: g-other');
  });
  it('erste OTA: Basis muss der native Build der Ziel-Runtime sein — nie eine OTA-Group, nie eine fremde Runtime', () => {
    const base = { platform: 'ios', releaseHead: 'a'.repeat(40), releaseRuntime: '1.0.5', expectedRuntime: '1.0.5', isAncestor: true, dirty: false, initialRuntimeRelease: true };
    const ota = evaluatePublishGuards({ ...base, active: { group: 'g', platform: 'ios', gitCommitHash: 'b'.repeat(40), runtimeVersion: '1.0.5' } });
    expect(ota.join('\n')).toContain('--initial-runtime-release unzulässig: Basis ist eine OTA-Group (g)');
    const foreign = evaluatePublishGuards({ ...base, active: { source: 'native-build', buildId: 'b', group: null, platform: 'ios', gitCommitHash: 'b'.repeat(40), runtimeVersion: '1.0.4' } });
    expect(foreign.join('\n')).toContain('Baseline-Runtime 1.0.4 ≠ Ziel-Runtime 1.0.5');
    expect(evaluatePublishGuards({ ...base, active: { source: 'native-build', buildId: 'b', group: null, platform: 'ios', gitCommitHash: 'b'.repeat(40), runtimeVersion: '1.0.5' } })).toEqual([]);
  });
});
