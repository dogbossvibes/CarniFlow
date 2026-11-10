// Ebene 2 – Datenbank: frische Wegwerf-Supabase in lokalem Docker (eigenes
// project_id, eigene Ports). Alle SQL-Befehle laufen per `docker exec` über den
// Unix-Socket IM Container. Keine Verbindung zu Staging/Production, keine
// Verwendung von Projekt-URLs/Keys aus .env-Dateien.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run, safeEnv, writeFile, log } from './lib.mjs';
import { schemaPlan, regressionCases, SUITES, stripDraftGuard } from './db-plan.mjs';

export const PROJECT_ID = 'anyvo-verify-center';
const CONTAINER = `supabase_db_${PROJECT_ID}`;
const PORT_BASE = 55420;

function configToml() {
  return `# Generiert vom ANYVO-Prüfzentrum. Nur lokale Wegwerf-Instanz.
project_id = "${PROJECT_ID}"
[api]
enabled = false
port = ${PORT_BASE + 1}
[db]
port = ${PORT_BASE + 2}
shadow_port = ${PORT_BASE}
major_version = 17
[db.seed]
enabled = false
[db.pooler]
enabled = false
[studio]
enabled = false
port = ${PORT_BASE + 3}
[local_smtp]
enabled = false
port = ${PORT_BASE + 4}
[analytics]
enabled = false
port = ${PORT_BASE + 7}
[storage]
enabled = true
[realtime]
enabled = false
[edge_runtime]
enabled = false
[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
`;
}

function psql(sql, { single = false, timeoutMs = 10 * 60 * 1000 } = {}) {
  const args = ['exec', '-i', CONTAINER, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'];
  if (single) args.push('-1');
  args.push('-f', '-');
  const r = run('docker', args, { input: sql, timeoutMs, env: safeEnv() });
  const firstError = (r.stderr.match(/ERROR:.*$/m) ?? [null])[0];
  return { ...r, firstError };
}

export function dockerStatus() {
  const r = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 20000, env: safeEnv() });
  return r.code === 0 ? { ok: true, version: r.stdout.trim() } : { ok: false, error: r.stderr.trim().split('\n')[0] };
}

function resolvePath(spec, targetDir, toolDir) {
  const [kind, rel] = spec.split(/:(.*)/s);
  return join(kind === 'tool' ? toolDir : targetDir, rel);
}

export async function runDbLayer({ targetDir, toolDir, out, suites = [], keepDb = false, startDocker = false }) {
  const result = { layer: 'db', steps: [], cases: [], suites: [], notes: [] };
  const ev = join(out, 'evidence', 'db');
  let docker = dockerStatus();
  if (!docker.ok && startDocker) {
    log('DB: starte Colima');
    run('colima', ['start', '--cpu', '4', '--memory', '6', '--disk', '40'], { timeoutMs: 10 * 60 * 1000, env: process.env });
    docker = dockerStatus();
  }
  if (!docker.ok) {
    result.verdict = 'FAIL';
    result.notes.push(`Docker nicht erreichbar (${docker.error}). Colima starten: \`colima start\` oder --start-docker.`);
    return result;
  }
  result.docker = docker.version;

  const work = join(tmpdir(), PROJECT_ID);
  mkdirSync(join(work, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(join(work, 'supabase', 'config.toml'), configToml());
  log('DB: frische Wegwerf-Instanz (alte eigene Instanz wird ohne Backup verworfen)');
  run('supabase', ['stop', '--workdir', work, '--no-backup'], { cwd: work, timeoutMs: 5 * 60 * 1000, env: safeEnv() });
  const st = run('supabase', ['start', '--workdir', work], { cwd: work, timeoutMs: 15 * 60 * 1000, env: safeEnv() });
  writeFile(join(ev, 'supabase-start.log'), (st.stdout + st.stderr).replace(/(key|secret|jwt|token)[^\n]*/gi, '$1: <entfernt>'));
  if (st.code !== 0) { result.verdict = 'FAIL'; result.notes.push('supabase start fehlgeschlagen, siehe evidence/db/supabase-start.log'); return result; }

  try {
    // Sicherheitsnetz: nur eine nachweislich frische, lokale DB wird befüllt
    // (Root-Setup-Dateien enthalten DROP-Anweisungen).
    const fresh = psql(`do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
select count(*) from pg_tables where schemaname='public';`);
    if (fresh.code !== 0 || fresh.stdout.trim().split('\n').pop() !== '0') throw new Error('DB ist nicht frisch/lokal – Abbruch vor dem Schemaaufbau.');

    // Schema
    for (const step of schemaPlan(targetDir)) {
      const r = psql(readFileSync(join(targetDir, step.path), 'utf8'), { single: true });
      const status = r.code === 0 ? (step.knownGap ? 'PASS_UNEXPECTED' : 'PASS') : (step.knownGap ? 'KNOWN_GAP' : 'FAIL');
      result.steps.push({ id: step.id, rootSetup: Boolean(step.rootSetup), status, error: r.firstError, reason: step.knownGap ?? undefined, ms: r.ms });
    }
    const failedSteps = new Set(result.steps.filter(s => s.status !== 'PASS' && s.status !== 'PASS_UNEXPECTED').map(s => s.id));

    // Regressionsfälle des Ziels
    for (const c of regressionCases(targetDir)) {
      const sql = readFileSync(join(targetDir, c.path), 'utf8');
      if (/^\\ir\s/m.test(sql)) { result.cases.push({ id: c.id, status: 'SKIP', reason: 'Einstiegsdatei mit \\ir (Fälle laufen separat)' }); continue; }
      const blocked = c.blockedBy.filter(s => failedSteps.has(s));
      if (blocked.length) { result.cases.push({ id: c.id, status: 'SKIP', reason: `blockiert durch Schemalücke ${blocked.join(', ')}` }); continue; }
      const ownTx = /^\s*begin\s*;/im.test(sql);
      const r = psql(ownTx ? sql : `begin;\n${sql}\nrollback;\n`);
      const pass = r.code === 0 && /\|PASS/.test(r.stdout + r.stderr);
      const status = pass ? 'PASS' : (c.knownBroken ? 'KNOWN_BROKEN' : 'FAIL');
      writeFile(join(ev, `case-${c.id}.log`), r.stdout + r.stderr);
      result.cases.push({ id: c.id, status, error: pass ? undefined : r.firstError, reason: status === 'KNOWN_BROKEN' ? c.knownBroken : undefined, marker: ((r.stdout + r.stderr).match(/[A-Z0-9_]+\|PASS[^\n]*/) ?? [null])[0] });
    }

    // Suiten (Migration unter Test)
    for (const name of suites) {
      const suite = SUITES[name];
      if (!suite) { result.suites.push({ name, verdict: 'FAIL', error: 'unbekannte Suite' }); continue; }
      result.suites.push(runSuite(name, suite, targetDir, toolDir, ev));
    }
  } finally {
    if (!keepDb) {
      log('DB: Wegwerf-Instanz stoppen (ohne Backup)');
      run('supabase', ['stop', '--workdir', work, '--no-backup'], { cwd: work, timeoutMs: 5 * 60 * 1000, env: safeEnv() });
    } else {
      result.notes.push(`Instanz läuft weiter (--keep-db): docker exec -it ${CONTAINER} psql -U postgres`);
    }
  }

  const schemaOk = result.steps.every(s => s.status !== 'FAIL');
  const casesOk = result.cases.every(c => c.status !== 'FAIL');
  const suitesOk = result.suites.every(s => s.verdict === 'PASS');
  result.verdict = schemaOk && casesOk && suitesOk ? 'PASS' : 'FAIL';
  return result;
}

function runSuite(name, suite, targetDir, toolDir, ev) {
  const res = { name, title: suite.title, verdict: 'FAIL', phases: [], info: [], checks: {} };
  const missing = [suite.draft, suite.pre, suite.post, ...suite.setup].map(p => resolvePath(p, targetDir, toolDir)).filter(p => !existsSync(p));
  if (missing.length) { res.error = `Dateien fehlen: ${missing.join(', ')}`; return res; }
  const read = spec => readFileSync(resolvePath(spec, targetDir, toolDir), 'utf8');

  for (const s of suite.setup) {
    const r = psql(read(s), { single: true });
    res.phases.push({ phase: `setup ${s}`, status: r.code === 0 ? 'PASS' : 'FAIL', error: r.firstError });
    if (r.code !== 0) return res;
  }

  // 1. Der Abbruchblock der Originaldatei muss greifen.
  const original = read(suite.draft);
  const guard = psql(`begin;\n${original}\nrollback;\n`);
  res.checks.guardActive = guard.code !== 0 && suite.guardPattern.test(guard.stderr);
  const stripped = stripDraftGuard(original, suite.guardPattern);
  res.checks.guardStrippedLocally = stripped.removedGuards;
  writeFile(join(ev, `${name}-draft-local.sql`), stripped.sql);

  // 2. Hauptlauf: PRE → Migration → Migration erneut (Idempotenz) → POST → Rückweg → ROLLBACK-Fälle; immer ROLLBACK.
  const main = ['begin;', read(suite.pre), stripped.sql, stripped.sql, read(suite.post),
    read(suite.rollbackDefinition), read(suite.rollback), 'rollback;'].join('\n');
  const r = psql(main);
  writeFile(join(ev, `${name}.log`), r.stdout + '\n--- stderr ---\n' + r.stderr);
  const outText = r.stdout + r.stderr;
  for (const m of suite.markers) {
    const hit = outText.match(new RegExp(`${m}\\|PASS\\|assertions=(\\d+)`));
    res.phases.push({ phase: m, status: hit ? 'PASS' : 'FAIL', assertions: hit ? Number(hit[1]) : 0 });
  }
  res.info = [...outText.matchAll(/^INFO\|([^|]+)\|(.*)$/gm)].map(m => ({ id: m[1], detail: m[2] }));
  res.error = r.code !== 0 ? (outText.match(/ERROR:.*$/m) ?? ['unbekannter Fehler'])[0] : undefined;

  // 3. Negativkontrolle: POST ohne Migration muss scheitern (Tests sind trennscharf).
  const neg = psql(['begin;', read(suite.pre), read(suite.post), 'rollback;'].join('\n'));
  res.checks.negativeControlFails = neg.code !== 0;
  res.checks.negativeControlError = (neg.stderr.match(/ERROR:.*$/m) ?? [null])[0];

  // 4. Nach dem Lauf ist nichts zurückgeblieben.
  const left = psql(`select (select count(*) from auth.users where email like '%@verify.local')
    + (select count(*) from information_schema.columns where table_name='training_exercises' and column_name='rating_scale');`);
  res.checks.noResidue = left.code === 0 && left.stdout.trim().split('\n').pop() === '0';

  res.assertions = res.phases.reduce((n, p) => n + (p.assertions ?? 0), 0);
  res.verdict = r.code === 0 && res.phases.every(p => p.status === 'PASS') && res.checks.guardActive
    && res.checks.negativeControlFails && res.checks.noResidue ? 'PASS' : 'FAIL';
  return res;
}
