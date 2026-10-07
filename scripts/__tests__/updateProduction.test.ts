// Production-OTA-Guardrail: der kanonische Wrapper lässt `--environment production`
// nie entfallen und veröffentlicht nie ohne explizite Plattform / Message / Environment.
// Die Prozess-Tests laufen in einem Fixture-Git-Repo mit einem FALSCHEN `eas` im PATH,
// das jeden Aufruf protokolliert (siehe otaReleaseHarness.ts) — es gibt nie eine echte OTA.
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { createHarness, destroyHarness, FULL_ENV, PROD_URL, SECRET } from './otaReleaseHarness';

const h = createHarness();
const envFileWith = h.envFileWith;
const FULL_FILE = h.fullEnvFile;
const easCalls = h.calls;
const updateCalls = h.updateCalls;
beforeEach(() => { h.resetCalls(); h.setState(h.defaultState()); });
afterAll(() => destroyHarness(h));

function run(args: string[], envFile?: string, cmd?: string[]) {
  return h.run(args, { envFile, cmd });
}
const argvLine = (out: string): string[] => JSON.parse((out.match(/^argv: (.*)$/m) ?? [])[1] ?? 'null');

describe('Wrapper verweigert unsichere Aufrufe', () => {
  it('keine Message → Abbruch', () => {
    const r = run(['--platform', 'ios', '--confirm']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/--message fehlt/);
  });
  it('leere Message → Abbruch', () => {
    expect(run(['--platform', 'ios', '--confirm', '--message', '   ']).code).toBe(1);
  });
  it.each([[[]], [['--platform', 'all']], [['--platform', 'web']], [['--platform', '']]])('keine/ungültige Plattform %j → Abbruch (nie beide Plattformen)', extra => {
    const r = run([...extra, '--confirm', '--message', 'x']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/explizit "ios" oder "android"/);
  });
  it('ohne --confirm: nichts veröffentlicht, Hinweis', () => {
    const r = run(['--platform', 'ios', '--message', 'x']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Kein Update veröffentlicht/);
    expect(r.out).not.toMatch(/Command:/);
  });
  it('--env-list-file nur mit --dry-run (keine echte Veröffentlichung mit Test-Env)', () => {
    const r = run(['--platform', 'ios', '--confirm', '--message', 'x'], envFileWith(FULL_ENV));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/nur mit --dry-run/);
  });
});

describe('Production-Environment-Preflight', () => {
  it.each(['EXPO_PUBLIC_BACKEND_ENV', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'])('fehlendes %s → STOP, keine OTA', name => {
    const content = FULL_ENV.split('\n').filter(l => !l.startsWith(`${name}=`)).join('\n');
    const r = run(['--platform', 'ios', '--dry-run', '--message', 'x'], envFileWith(content));
    expect(r.code).toBe(1);
    expect(r.out).toContain(`Fehlend: ${name}`);
    expect(r.out).toMatch(/Abbruch: Ohne vollständige Production-Environment/);
    expect(r.out).not.toMatch(/Command:/);
  });
  it('leerer Wert zählt als fehlend', () => {
    const r = run(['--platform', 'ios', '--dry-run', '--message', 'x'], envFileWith(FULL_ENV.replace(`ANON_KEY=${SECRET}`, 'ANON_KEY=')));
    expect(r.code).toBe(1);
    expect(r.out).toContain('Fehlend: EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });
  it('BACKEND_ENV=staging oder Staging-Supabase → STOP', () => {
    expect(run(['--platform', 'ios', '--dry-run', '--message', 'x'], envFileWith(FULL_ENV.replace('BACKEND_ENV=production', 'BACKEND_ENV=staging'))).code).toBe(1);
    expect(run(['--platform', 'ios', '--dry-run', '--message', 'x'], envFileWith(FULL_ENV.replace('axkkhyqrjrtbkumaulta', 'cbhrxkjclakzlvajyvfn'))).code).toBe(1);
  });
  it('vollständige Environment → Dry-Run zeigt EXAKT das sichere Kommando; keine Veröffentlichung; keine Secrets in der Ausgabe', () => {
    const r = run(['--platform', 'ios', '--dry-run', '--message', 'fix: test'], envFileWith(FULL_ENV));
    expect(r.code).toBe(0);
    expect(r.out).toContain('Command: eas update --channel production --environment production --platform ios --message "fix: test" --non-interactive');
    expect(r.out).toMatch(/vorhanden: EXPO_PUBLIC_BACKEND_ENV, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY/);
    expect(r.out).toContain('--dry-run: nichts veröffentlicht');
    expect(r.out).not.toContain(SECRET);
    expect(r.out).not.toContain(PROD_URL);
    expect(r.out).toMatch(/git HEAD: [0-9a-f]{40}/);
  });
  it('Android nur explizit, mit denselben Pflichtargumenten', () => {
    const r = run(['--platform', 'android', '--dry-run', '--message', 'x'], envFileWith(FULL_ENV));
    expect(r.code).toBe(0);
    expect(r.out).toContain('--channel production --environment production --platform android');
    expect(r.out).not.toContain('--platform ios');
  });
});

describe('`--environment production` kann nicht entfallen', () => {
  const lib = (js: string) => spawnSync('node', ['--input-type=module', '-e', `import * as m from './scripts/update-production.mjs'; ${js}`], { encoding: 'utf8' });
  it('buildProductionUpdateArgs enthält IMMER channel production + environment production + explizite Plattform', () => {
    const r = lib(`console.log(JSON.stringify(m.buildProductionUpdateArgs({platform:'ios',message:'m'})))`);
    const a = JSON.parse(r.stdout) as string[];
    expect(a.slice(0, 7)).toEqual(['update', '--channel', 'production', '--environment', 'production', '--platform', 'ios']);
    expect(a).toContain('--message');
  });
  it('lehnt Plattform "all"/leer/undefined und leere Message ab', () => {
    for (const js of [
      `m.buildProductionUpdateArgs({platform:'all',message:'m'})`,
      `m.buildProductionUpdateArgs({platform:undefined,message:'m'})`,
      `m.buildProductionUpdateArgs({platform:'ios',message:''})`,
    ]) expect(lib(`try{${js};console.log('NO')}catch(e){console.log('THROWS')}`).stdout.trim()).toBe('THROWS');
  });
  it('die Quelle führt `eas` an genau EINER Stelle aus (mit buildProductionUpdateArgs), kein shell-String', () => {
    const src = readFileSync('scripts/update-production.mjs', 'utf8');
    expect(src.match(/execFileSync\('eas', easArgs/g)?.length).toBe(1);
    expect(src).not.toMatch(/execSync\(/);
    expect(src).toContain('Do not replace this with a direct production `eas update` command.');
    expect(src).toContain('ANYVO production OTA requires --environment production.');
  });
  it('buildPublishEnv setzt EXPO_PUBLIC_RELEASE_GIT_COMMIT nur für eine gültige HEAD-SHA', () => {
    const sha = '1f791707dd838983a324f72d32c61f786bbbf642';
    const ok = JSON.parse(lib(`console.log(JSON.stringify(m.buildPublishEnv({A:'1'},'${sha}')))`).stdout);
    expect(ok).toEqual({ A: '1', EXPO_PUBLIC_RELEASE_GIT_COMMIT: sha });
    const bad = JSON.parse(lib(`console.log(JSON.stringify(m.buildPublishEnv({A:'1',EXPO_PUBLIC_RELEASE_GIT_COMMIT:'stale'},'(unbekannt)')))`).stdout);
    expect(bad).toEqual({ A: '1' });
  });
  it('package.json enthält keinen direkten Production-`eas update`', () => {
    const pkg = readFileSync('package.json', 'utf8');
    expect(pkg).not.toMatch(/eas update[^"]*--channel production/);
    expect(pkg).toContain('"update:production:ios": "node ./scripts/update-production.mjs --platform ios --confirm"');
  });
});

const MUST = (platform: string) => ['--channel', 'production', '--environment', 'production', '--platform', platform];
const hasPair = (argv: string[], flag: string, value: string) => argv.some((a, i) => a === flag && argv[i + 1] === value);

describe('Verschärft: argv, Dry-Run == echte Ausführung, npm-Script', () => {
  it('iOS: Dry-Run-argv UND echter eas-Aufruf enthalten channel/environment/platform — und sind IDENTISCH', () => {
    const dry = run(['--platform', 'ios', '--dry-run', '--message', 'msg one'], FULL_FILE);
    expect(dry.code).toBe(0);
    const dryArgv = argvLine(dry.out);
    expect(updateCalls()).toEqual([]);                                    // Dry-Run ruft `eas update` nicht auf
    const real = run(['--platform', 'ios', '--confirm', '--message', 'msg one']);   // echte Ausführung (falsches eas)
    expect(real.code).toBe(0);
    const calls = updateCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(dryArgv);                                    // exakt dieselben Args
    expect(argvLine(real.out)).toEqual(dryArgv);
    for (const [f, v] of [['--channel', 'production'], ['--environment', 'production'], ['--platform', 'ios']]) expect(hasPair(calls[0], f, v)).toBe(true);
    expect(hasPair(calls[0], '--message', 'msg one')).toBe(true);
    expect(calls[0]).toContain('--non-interactive');
    expect(dry.out).toContain('--channel production --environment production --platform ios --message "msg one"');
  });
  it('Android: argv enthält channel/environment/platform android (nur explizit)', () => {
    const real = run(['--platform', 'android', '--confirm', '--message', 'a']);
    expect(real.code).toBe(0);
    const [call] = updateCalls();
    for (const [f, v] of [['--channel', 'production'], ['--environment', 'production'], ['--platform', 'android']]) expect(hasPair(call, f, v)).toBe(true);
    expect(call).not.toContain('ios');
  });
  it('niemals "all"/web; fehlende oder ungültige Plattform → eas update wird NICHT aufgerufen', () => {
    for (const extra of [[], ['--platform', 'all'], ['--platform', 'web'], ['--platform', 'IOS']]) {
      expect(run([...extra, '--confirm', '--message', 'x']).code).toBe(1);
    }
    expect(updateCalls()).toEqual([]);
  });
  it('leere Message → Abbruch, eas update nicht aufgerufen', () => {
    expect(run(['--platform', 'ios', '--confirm', '--message', '']).code).toBe(1);
    expect(updateCalls()).toEqual([]);
  });
  it('Production-Supabase-Variable fehlt → eas update wird NICHT aufgerufen (auch mit --confirm)', () => {
    for (const name of ['EXPO_PUBLIC_BACKEND_ENV', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
      const f = envFileWith(FULL_ENV.split('\n').filter(l => !l.startsWith(`${name}=`)).join('\n'));
      const r = spawnSync('node', ['scripts/update-production.mjs', '--platform', 'ios', '--confirm', '--message', 'x'], {
        cwd: h.repo, encoding: 'utf8', env: h.baseEnv({ FAKE_ENV_FILE: f }),
      });
      expect(r.status).toBe(1);
    }
    expect(updateCalls()).toEqual([]);
    expect(easCalls().every(a => a[0] === 'env:list')).toBe(true);        // gelesen, aber nie veröffentlicht
  });
  it('falsches BACKEND_ENV bzw. nicht-Production-Supabase-URL → eas update wird NICHT aufgerufen (echte Ausführung, --confirm)', () => {
    for (const bad of [FULL_ENV.replace('BACKEND_ENV=production', 'BACKEND_ENV=staging'), FULL_ENV.replace('axkkhyqrjrtbkumaulta', 'cbhrxkjclakzlvajyvfn')]) {
      const r = spawnSync('node', ['scripts/update-production.mjs', '--platform', 'ios', '--confirm', '--message', 'x'], {
        cwd: h.repo, encoding: 'utf8', env: h.baseEnv({ FAKE_ENV_FILE: envFileWith(bad) }),
      });
      expect(r.status).toBe(1);
      expect(`${r.stdout}${r.stderr}`).not.toContain(SECRET);
    }
    expect(updateCalls()).toEqual([]);
  });
  it('`npm run update:production:ios -- --message "Test"` genügt: --platform ios und --confirm setzt das Script selbst', () => {
    const r = run(['--', '--message', 'Test'], undefined, ['npm', 'run', 'update:production:ios']);
    expect(r.code).toBe(0);
    const calls = updateCalls();
    expect(calls).toHaveLength(1);
    for (const [f, v] of [['--channel', 'production'], ['--environment', 'production'], ['--platform', 'ios'], ['--message', 'Test']]) expect(hasPair(calls[0], f, v)).toBe(true);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    expect(pkg['update:production:ios']).toContain('--platform ios');
    expect(pkg['update:production:ios']).toContain('--confirm');
    expect(pkg['update:production:ios']).not.toContain('android');
  });
  it('npm-Script mit --dry-run: zeigt die vollständig gerenderte Zeile inkl. --environment production', () => {
    const r = run(['--', '--message', 'dry run only', '--dry-run'], undefined, ['npm', 'run', 'update:production:ios']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Command: eas update --channel production --environment production --platform ios --message "dry run only" --non-interactive');
    expect(updateCalls()).toEqual([]);
  });
  it('Android nur über einen ausdrücklich getrennten Befehl (kein Android-npm-Script, der iOS-Script setzt nie android)', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
    expect(Object.keys(scripts).filter(k => /update:production/.test(k)).sort()).toEqual(['update:production', 'update:production:ios']);
    expect(scripts['update:production']).not.toContain('--platform');   // ohne Plattform bricht der Wrapper ab
  });
  it('alle Pflichtflags stehen in jedem argv (Hilfsmatrix)', () => {
    for (const platform of ['ios', 'android']) {
      const argv = JSON.parse(spawnSync('node', ['--input-type=module', '-e', `import * as m from './scripts/update-production.mjs'; console.log(JSON.stringify(m.buildProductionUpdateArgs({platform:'${platform}',message:'m'})))`], { encoding: 'utf8' }).stdout) as string[];
      for (let i = 0; i < MUST(platform).length; i += 2) expect(hasPair(argv, MUST(platform)[i], MUST(platform)[i + 1])).toBe(true);
    }
  });
});

describe('Agentenregeln (AGENTS.md = CLAUDE.md)', () => {
  const section = (f: string) => {
    const s = readFileSync(f, 'utf8');
    const i = s.indexOf('## ANYVO Production OTA — zwingende Regel');
    expect(i).toBeGreaterThanOrEqual(0);
    return s.slice(i);
  };
  it('beide Dateien enthalten dieselbe Regel', () => {
    expect(section('CLAUDE.md')).toBe(section('AGENTS.md'));
  });
  it('die Regel nennt Pflichtargumente, Verbotsmuster, Preflight, Verifikation, Android und Priorität', () => {
    const s = section('AGENTS.md');
    for (const needle of [
      '--environment production', 'EXPO_PUBLIC_BACKEND_ENV', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'VERBOTEN', 'Pflicht-Preflight', 'Nach jeder Production-OTA verifizieren', 'gitCommitHash', 'Platform Update ID',
      'Nie unbeabsichtigt beide Plattformen', 'Priorität', 'scripts/update-production.mjs', 'npm run update:production:ios',
      'Direkter `eas update` ist nur zulässig, wenn er exakt dieselben Pflichtargumente enthält',
      'Wenn ein Prompt eine Production-OTA ohne',
    ]) expect(s).toContain(needle);
  });
  it('bestehende Regeln blieben erhalten', () => {
    const a = readFileSync('AGENTS.md', 'utf8');
    expect(a).toMatch(/^# Agent Handoff Protocol\b/m);
    expect(a).toContain('publish an OTA, start a build, or release to a store without explicit user permission');
    expect(a).toContain('## NEVER');
    expect(readFileSync('CLAUDE.md', 'utf8')).toContain('@AGENTS.md');
  });
});
