#!/usr/bin/env node
// ANYVO — PRODUCTION EAS Update (abgesichert). Veröffentlicht NICHT automatisch.
//
//   node scripts/update-production.mjs --platform ios --confirm --message "Was wurde geändert"
//   npm run update:production:ios -- --message "Was wurde geändert"
//   npm run update:production:ios -- --message "…" --dry-run      (alle Guards, KEINE Veröffentlichung)
//
// Do not replace this with a direct production `eas update` command.
// ANYVO production OTA requires --environment production.
//
// Diese Datei ist der EINZIGE kanonische Production-OTA-Entry (siehe AGENTS.md /
// CLAUDE.md, Abschnitt „ANYVO Production OTA — zwingende Regel"). Sie führt
// AUSSCHLIESSLICH aus:
//
//   eas update --channel production --environment production --platform <ios|android> --message "<msg>"
//
// und verweigert alles andere:
//   • keine Message            → Abbruch
//   • keine explizite Plattform (ios|android) → Abbruch (nie versehentlich beide)
//   • kein --confirm           → Abbruch (nur Hinweis)
//   • Staging-Supabase im lokalen Env (guard-prod-supabase.mjs) → Abbruch
//   • der EAS-Environment `production` fehlt EXPO_PUBLIC_BACKEND_ENV,
//     EXPO_PUBLIC_SUPABASE_URL oder EXPO_PUBLIC_SUPABASE_ANON_KEY → Abbruch
//     (lib/supabase.ts wirft beim Start ohne diese Werte → expo-updates fiele auf
//      einen älteren Stand zurück; so geschehen bei 2ddc0d7c/67280672)
// Keine Runtime-/Versionsänderung, keine Secrets in der Ausgabe (nur Variablennamen).
//
// ── Race-Schutz (parallele Sessions/Worktrees) ─────────────────────────────────
// Vorfall 2026-10-04: eine OTA aus einem Worktree überschrieb einen 14 Minuten zuvor
// aus einer anderen Session veröffentlichten Production-Fix. Deshalb zusätzlich:
//   1. Gemeinsamer Release-Lock im git-common-dir (für ALLE Worktrees dieses Repos
//      derselbe Pfad), atomar per mkdir. Zweite Session → HARD STOP. Stale Locks
//      werden nie automatisch gelöscht (nur explizit: --clear-stale-lock, und nur
//      wenn der Halter-Prozess auf diesem Rechner nachweislich beendet ist).
//   2. EAS ist die einzige Quelle für den LIVE-Stand: nach Lock-Erwerb frisch lesen
//      (nie ANYVO_MASTER_STATUS.md, nie Erinnerung, nie ein früherer Preflight).
//   3. Ancestry-Guard: aktiver Production-gitCommitHash MUSS Vorfahre des Release-HEAD
//      sein — sonst würde die OTA Production-Fixes zurückrollen. Kein Auto-Rebase.
//   4. Runtime-/Channel-/Plattform-/Clean-Tree-Guard.
//      Runtime-Isolation (mehrere Production-Runtimes gleichzeitig aktiv, z. B. 1.0.3 + 1.0.4):
//      Ziel-Runtime = --runtime bzw. eindeutig aus app.json (sonst STOP). Baseline ist die
//      neueste Production-Group mit GENAU dieser Plattform UND Runtime — nie die global
//      neueste Group. Fehlt sie → STOP (fail closed). Die erste OTA einer neuen Runtime
//      nur ausdrücklich per --initial-runtime-release (nur ohne vorhandene Baseline dieser
//      Runtime; Baseline dann die neueste Group der Plattform, Ancestry bleibt Pflicht).
//   5. ZWEITER EAS-Check unmittelbar vor `eas update`; Änderung → HARD STOP.
//   6. Nachkontrolle: neue Group live, Plattform/Runtime/gitCommitHash exakt — sonst
//      Fehler (Exit 2). KEIN automatischer Rollback, KEINE zweite OTA.
// Grenze: der Lock serialisiert nur Releases aus Worktrees DIESES lokalen Repos. Andere
// Rechner, CI oder manuelle `eas update`-Aufrufe erfasst er nicht — dafür bleibt der
// zweite EAS-Check Pflicht (Restfenster: Bundle-Export innerhalb von `eas update`).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { assertProductionSupabase, PROD_REF } from './guard-prod-supabase.mjs';

export const REQUIRED_PRODUCTION_ENV = Object.freeze([
  'EXPO_PUBLIC_BACKEND_ENV',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
]);
export const ALLOWED_PLATFORMS = Object.freeze(['ios', 'android']);
export const PRODUCTION_CHANNEL = 'production';
export const PRODUCTION_BRANCH = 'production';
export const LOCK_DIR_NAME = 'anyvo-production-ota.lock';
export const PRODUCTION_CHANGED_MESSAGE = 'Production changed during release preparation.';

/** Die einzigen Argumente, mit denen eine Production-OTA je gestartet wird. */
export function buildProductionUpdateArgs({ platform, message }) {
  if (!ALLOWED_PLATFORMS.includes(platform)) throw new Error(`platform muss explizit ios oder android sein (war: ${platform ?? '—'})`);
  if (typeof message !== 'string' || !message.trim()) throw new Error('message darf nicht leer sein');
  return [
    'update',
    '--channel', PRODUCTION_CHANNEL,
    '--environment', 'production',
    '--platform', platform,
    '--message', message,
    '--non-interactive',
  ];
}

/**
 * Parst `eas env:list production --format short` (Zeilen NAME=WERT). Gibt nur
 * Namen/Vorhandensein zurück — Werte verlassen diese Funktion nie.
 */
export function checkProductionEnv(listOutput) {
  const values = new Map();
  for (const line of String(listOutput).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m) values.set(m[1], m[2].trim());
  }
  const missing = REQUIRED_PRODUCTION_ENV.filter(k => !values.get(k));
  const problems = [];
  if (values.get('EXPO_PUBLIC_BACKEND_ENV') && values.get('EXPO_PUBLIC_BACKEND_ENV') !== 'production') {
    problems.push('EXPO_PUBLIC_BACKEND_ENV ist nicht "production"');
  }
  const url = values.get('EXPO_PUBLIC_SUPABASE_URL');
  if (url && !url.includes(PROD_REF)) problems.push('EXPO_PUBLIC_SUPABASE_URL zeigt nicht auf das Production-Projekt');
  return { ok: missing.length === 0 && problems.length === 0, missing, problems, present: REQUIRED_PRODUCTION_ENV.filter(k => values.get(k)) };
}

/** Env für `eas update`: setzt EXPO_PUBLIC_RELEASE_GIT_COMMIT auf den geprüften HEAD (nur gültige SHA). */
export function buildPublishEnv(baseEnv, head) {
  const env = { ...baseEnv };
  if (/^[0-9a-f]{40}$/.test(head ?? '')) env.EXPO_PUBLIC_RELEASE_GIT_COMMIT = head;
  else delete env.EXPO_PUBLIC_RELEASE_GIT_COMMIT;
  return env;
}

// ── Reine Guard-Logik (testbar, ohne I/O) ─────────────────────────────────────

/** Runtime, auf die dieser Release zielt — nur aus der App-Konfiguration (app.json). */
export function resolveReleaseRuntime(appJson) {
  const expo = appJson?.expo ?? appJson ?? {};
  const rv = expo.runtimeVersion;
  if (typeof rv === 'string' && rv.trim()) return rv.trim();
  if (rv && typeof rv === 'object' && rv.policy === 'appVersion' && typeof expo.version === 'string' && expo.version.trim()) return expo.version.trim();
  return null;   // andere Policies (fingerprint/nativeVersion) → nicht sicher vorab bestimmbar → STOP
}

function parseJsonOutput(raw) {
  const s = String(raw ?? '');
  const starts = [s.indexOf('{'), s.indexOf('[')].filter(i => i >= 0);
  if (!starts.length) throw new Error('keine JSON-Ausgabe');
  return JSON.parse(s.slice(Math.min(...starts)));
}

/** Channel → Branch: genau ein Branch `production`, 100 % (kein Rollout), nicht pausiert. */
export function checkChannelMapping(channelJson) {
  const cp = channelJson?.currentPage;
  const problems = [];
  if (!cp) return { ok: false, problems: ['Channel production nicht lesbar'] };
  if (cp.name !== PRODUCTION_CHANNEL) problems.push(`Channel ist "${cp.name}", erwartet "${PRODUCTION_CHANNEL}"`);
  if (cp.isPaused) problems.push('Channel production ist pausiert');
  const branches = (cp.updateBranches ?? []).map(b => b.name);
  if (branches.length !== 1 || branches[0] !== PRODUCTION_BRANCH) problems.push(`Channel production zeigt auf Branch(es) ${JSON.stringify(branches)}, erwartet ["${PRODUCTION_BRANCH}"]`);
  let mapping = cp.branchMapping;
  if (typeof mapping === 'string') { try { mapping = JSON.parse(mapping); } catch { mapping = null; } }
  const rules = mapping?.data ?? [];
  if (rules.length !== 1 || String(rules[0]?.branchMappingLogic) !== 'true') problems.push('Channel production hat ein Rollout-/Mehrfach-Mapping');
  return { ok: problems.length === 0, problems };
}

const groupPlatforms = g => String(g?.platforms ?? '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * Neueste Update-Group des Branches, die die Zielplattform enthält (aus `eas update:list --json`,
 * neueste zuerst). NUR für --initial-runtime-release; sonst selectBaselineGroupId (runtime-genau).
 */
export function pickActiveGroupId(updateListJson, platform) {
  const page = updateListJson?.currentPage ?? [];
  for (const g of page) {
    if (groupPlatforms(g).includes(platform)) return g.group ?? null;
  }
  return null;
}

/**
 * Baseline-Group für (Plattform, Ziel-Runtime): die neueste Group (Liste ist neueste zuerst),
 * die die Plattform enthält UND exakt diese runtimeVersion trägt. Andere Plattformen und
 * andere Runtimes werden nie gewählt — auch wenn sie global neuer sind. Keine → null.
 */
export function selectBaselineGroupId(updateListJson, { platform, runtime }) {
  if (!ALLOWED_PLATFORMS.includes(platform) || typeof runtime !== 'string' || !runtime) return null;
  const page = updateListJson?.currentPage ?? [];
  for (const g of page) {
    if (groupPlatforms(g).includes(platform) && g.runtimeVersion === runtime) return g.group ?? null;
  }
  return null;
}

/**
 * Ziel-Runtime des Releases. Die Bundle-Runtime kommt aus app.json (resolveReleaseRuntime);
 * --runtime darf sie nur bestätigen, nie ersetzen. Nicht bestimmbar oder widersprüchlich
 * → problems (fail closed) — nie die global neueste Runtime raten.
 */
export function resolveTargetRuntime({ runtimeFlag, releaseRuntime }) {
  const problems = [];
  if (!releaseRuntime) problems.push('Release-Runtime nicht bestimmbar (app.json runtimeVersion) — Ziel-Runtime unklar');
  if (runtimeFlag != null && (typeof runtimeFlag !== 'string' || !runtimeFlag.trim())) problems.push('--runtime ohne Wert');
  else if (runtimeFlag != null && releaseRuntime && runtimeFlag.trim() !== releaseRuntime) {
    problems.push(`Runtime-Mismatch: Release ${releaseRuntime}, erwartet ${runtimeFlag.trim()}`);
  }
  return { runtime: problems.length ? null : releaseRuntime, source: runtimeFlag != null ? '--runtime' : 'app.json', problems };
}

/** Plattform-Eintrag einer Group (aus `eas update:view <group> --json`). */
export function parseActiveFromView(viewJson, platform) {
  const list = Array.isArray(viewJson) ? viewJson : [viewJson];
  const u = list.find(x => x?.platform === platform);
  if (!u) return null;
  return {
    group: u.group ?? null, id: u.id ?? null, platform: u.platform,
    gitCommitHash: u.gitCommitHash ?? null, runtimeVersion: u.runtimeVersion ?? null,
    createdAt: u.createdAt ?? null, branch: u.branch ?? null,
    platforms: [...new Set(list.map(x => x?.platform).filter(Boolean))].sort(),
  };
}

/** Hat sich Production zwischen zwei frischen EAS-Lesungen geändert? */
export function productionChanged(before, after) {
  if (!before || !after) return true;
  return before.group !== after.group || before.gitCommitHash !== after.gitCommitHash || before.runtimeVersion !== after.runtimeVersion;
}

/** Alle Publish-Guards auf einen Blick. Leere Liste = Publish erlaubt. */
export function evaluatePublishGuards({ platform, active, releaseHead, releaseRuntime, expectedRuntime, isAncestor, dirty, initialRuntimeRelease = false }) {
  const problems = [];
  if (!ALLOWED_PLATFORMS.includes(platform)) problems.push('Plattform nicht explizit ios/android');
  if (!/^[0-9a-f]{40}$/.test(releaseHead ?? '')) problems.push('Release-HEAD unbekannt');
  if (dirty) problems.push('Worktree nicht sauber (uncommittete Änderungen würden ins Bundle gelangen; gitCommitHash wäre falsch)');
  if (!releaseRuntime) problems.push('Release-Runtime nicht bestimmbar (app.json runtimeVersion)');
  if (!active) {
    problems.push(initialRuntimeRelease
      ? `Keine Production-Group der Plattform ${platform} vorhanden — keine Fallback-Baseline für die erste OTA von Runtime ${expectedRuntime ?? '—'} (fail closed; nie eine plattformfremde Baseline)`
      : `Kein aktiver Production-Stand für ${platform} / Runtime ${expectedRuntime ?? '—'} in EAS gefunden — keine Baseline (fail closed; erste OTA einer neuen Runtime nur bewusst mit --initial-runtime-release)`);
  } else {
    if (!active.gitCommitHash) problems.push('Aktiver Production-Stand hat keinen gitCommitHash');
    if (active.platform !== platform) problems.push(`Aktiver Stand gehört zu Plattform ${active.platform}, erwartet ${platform}`);
    if (!initialRuntimeRelease && expectedRuntime && active.runtimeVersion !== expectedRuntime) {
      problems.push(`Baseline-Runtime ${active.runtimeVersion ?? '—'} ≠ Ziel-Runtime ${expectedRuntime}`);
    }
    // Erste OTA: Fallback-Baseline gehört per Definition zu einer ANDEREN Runtime derselben Plattform.
    if (initialRuntimeRelease && expectedRuntime && active.runtimeVersion === expectedRuntime) {
      problems.push(`--initial-runtime-release unzulässig: Baseline ist bereits eine Group der Ziel-Runtime ${expectedRuntime}`);
    }
    if (isAncestor === false) {
      problems.push(`Release basiert NICHT auf aktuellem Production: aktiver Production-Commit ${active.gitCommitHash} ist kein Vorfahre von ${releaseHead}. Veröffentlichung würde bestehende Production-Fixes zurücksetzen.`);
    } else if (isAncestor == null) problems.push(`Aktiver Production-Commit ${active.gitCommitHash ?? '—'} ist lokal nicht vorhanden (git fetch?) — Ancestry nicht prüfbar`);
  }
  if (releaseRuntime && expectedRuntime && releaseRuntime !== expectedRuntime) {
    problems.push(`Runtime-Mismatch: Release ${releaseRuntime}, erwartet ${expectedRuntime}`);
  }
  return problems;
}

/**
 * Unübersehbarer Hinweis für die erste OTA einer Runtime (--initial-runtime-release):
 * Ziel und die plattformgleiche Fallback-Baseline, gegen die die Ancestry geprüft wird.
 */
export function formatFirstRuntimeBanner({ platform, targetRuntime, targetCommit, baseline }) {
  const bar = '='.repeat(66);
  return [
    bar,
    'FIRST OTA FOR RUNTIME',
    `Platform: ${platform}`,
    `Target Runtime: ${targetRuntime}`,
    `Target Commit: ${targetCommit}`,
    `No existing production group for ${platform} / runtime ${targetRuntime}.`,
    'Fallback ancestry baseline (newest production group of the SAME platform):',
    `  Group: ${baseline?.group ?? '—'}`,
    `  Runtime: ${baseline?.runtimeVersion ?? '—'}`,
    `  Commit: ${baseline?.gitCommitHash ?? '—'}`,
    bar,
  ].join('\n');
}

/**
 * Nachkontrolle nach dem Publish. Leere Liste = verifiziert. `afterForRuntime`: aktive Group
 * für (Plattform, Release-Runtime) frisch aus EAS — muss GENAU die neue Group sein
 * (Production-Zuordnung, auch für die erste OTA einer Runtime).
 */
export function verifyPostPublish({ before, after, platform, releaseHead, releaseRuntime, afterForRuntime }) {
  const problems = [];
  if (!after) return ['Kein aktiver Production-Stand nach dem Publish lesbar'];
  if (before && after.group === before.group) problems.push('Keine neue Update-Group auf production aktiv');
  if (after.platform !== platform) problems.push(`Plattform ${after.platform} ≠ ${platform}`);
  if ((after.platforms ?? []).some(p => p !== platform)) problems.push(`Neue Group enthält weitere Plattformen: ${after.platforms.join(', ')}`);
  if (after.runtimeVersion !== releaseRuntime) problems.push(`Runtime ${after.runtimeVersion} ≠ ${releaseRuntime}`);
  if (after.gitCommitHash !== releaseHead) problems.push(`gitCommitHash ${after.gitCommitHash} ≠ Release-HEAD ${releaseHead}`);
  if (afterForRuntime !== undefined && afterForRuntime?.group !== after.group) {
    problems.push(`Neue Group ${after.group} ist nicht die aktive Production-Group für ${platform} / Runtime ${releaseRuntime} (gefunden: ${afterForRuntime?.group ?? '—'})`);
  }
  return problems;
}

// ── Gemeinsamer Release-Lock (git-common-dir, atomar per mkdir) ───────────────

export function lockPathFor(gitCommonDir) {
  return join(gitCommonDir, LOCK_DIR_NAME);
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

export function readLockMeta(lockPath) {
  try { return JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8')); } catch { return null; }
}

/**
 * Zustand eines vorhandenen Locks: 'free' | 'held' (Halter lebt oder nicht prüfbar) |
 * 'stale' (gleicher Rechner, Halter-PID nachweislich beendet). Unklare Fälle gelten als 'held'.
 */
export function inspectLock(lockPath, { host = hostname(), alive = isPidAlive } = {}) {
  if (!existsSync(lockPath)) return { state: 'free', meta: null };
  const meta = readLockMeta(lockPath);
  if (meta && meta.host === host && Number.isInteger(meta.pid) && !alive(meta.pid)) return { state: 'stale', meta };
  return { state: 'held', meta };
}

/** Atomarer Erwerb: mkdir schlägt fehl, wenn der Lock existiert (EEXIST). */
export function acquireReleaseLock(lockPath, meta) {
  try {
    mkdirSync(lockPath);
  } catch (e) {
    if (e?.code === 'EEXIST') return { ok: false, ...inspectLock(lockPath) };
    throw e;
  }
  try { writeFileSync(join(lockPath, 'owner.json'), JSON.stringify(meta, null, 2)); } catch { /* Lock gehalten, Metadaten best-effort */ }
  let released = false;
  return {
    ok: true,
    release() {
      if (released) return;
      released = true;
      // Nur den EIGENEN Lock entfernen (Schutz, falls jemand ihn manuell ersetzt hat).
      const current = readLockMeta(lockPath);
      if (!current || (current.pid === meta.pid && current.startedAt === meta.startedAt)) {
        try { rmSync(lockPath, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    },
  };
}

function describeLock(meta) {
  if (!meta) return '(keine lesbaren Metadaten)';
  return `PID ${meta.pid} auf ${meta.host} · seit ${meta.startedAt} · Worktree ${meta.worktree} · Branch ${meta.branch} · HEAD ${meta.head}`;
}

// ── I/O ───────────────────────────────────────────────────────────────────────

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitCommonDir() {
  const out = sh('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  return isAbsolute(out) ? out : resolve(process.cwd(), out);
}

function gitIsAncestor(ancestor, head) {
  try { sh('git', ['cat-file', '-e', `${ancestor}^{commit}`]); } catch { return null; }   // lokal unbekannt
  try { sh('git', ['merge-base', '--is-ancestor', ancestor, head]); return true; } catch { return false; }
}

function viewActive(group, platform) {
  const view = parseJsonOutput(sh('eas', ['update:view', group, '--json']));
  return parseActiveFromView(view, platform);
}

/**
 * Frisch aus EAS: aktiver Production-Stand für GENAU (Plattform, Runtime) — nie aus
 * Doku/Erinnerung, nie die global neueste Group. EAS filtert serverseitig (--platform,
 * --runtime-version, damit ältere Runtimes nicht aus der 50er-Seite fallen); zusätzlich
 * wird clientseitig gefiltert und der Plattform-Eintrag der Group nachgeprüft.
 */
function readActiveProduction(platform, runtime) {
  const list = parseJsonOutput(sh('eas', ['update:list', '--branch', PRODUCTION_BRANCH, '--platform', platform, '--runtime-version', runtime, '--limit', '50', '--json', '--non-interactive']));
  const group = selectBaselineGroupId(list, { platform, runtime });
  if (!group) return null;
  const active = viewActive(group, platform);
  return active && active.platform === platform && active.runtimeVersion === runtime ? active : null;
}

/** Nur --initial-runtime-release: neueste Production-Group der Plattform (beliebige Runtime). */
function readNewestPlatformProduction(platform) {
  const list = parseJsonOutput(sh('eas', ['update:list', '--branch', PRODUCTION_BRANCH, '--platform', platform, '--limit', '50', '--json', '--non-interactive']));
  const group = pickActiveGroupId(list, platform);
  return group ? viewActive(group, platform) : null;
}

/**
 * Baseline für den Release. Normal: runtime-genau. Initial: nur zulässig, solange für die
 * Ziel-Runtime KEINE Group existiert; dann Vergleich gegen die neueste Group der Plattform.
 */
function readBaseline(platform, runtime, initial) {
  const own = readActiveProduction(platform, runtime);
  if (!initial) return { active: own, problem: null };
  if (own) return { active: own, problem: `--initial-runtime-release unzulässig: für ${platform} / Runtime ${runtime} existiert bereits Production-Group ${own.group}` };
  return { active: readNewestPlatformProduction(platform), problem: null };
}

function readChannel() {
  return checkChannelMapping(parseJsonOutput(sh('eas', ['channel:view', PRODUCTION_CHANNEL, '--json', '--non-interactive'])));
}

function printActive(label, a) {
  if (!a) { console.log(`${label}: — (kein Stand gefunden)`); return; }
  console.log(`${label}: Group ${a.group} · ${a.platform} Update ${a.id} · gitCommitHash ${a.gitCommitHash} · Runtime ${a.runtimeVersion} · ${a.createdAt}`);
}

function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');
  const dryRun = args.includes('--dry-run');
  const clearStale = args.includes('--clear-stale-lock');
  const message = argValue(args, '--message') ?? '';
  const platform = argValue(args, '--platform');
  const runtimeFlag = argValue(args, '--runtime');
  const initialRuntimeRelease = args.includes('--initial-runtime-release');
  // Nur für Tests/Dry-Run: Env-Liste aus Datei statt aus EAS. Nie zusammen mit einer echten Veröffentlichung.
  const envListFile = argValue(args, '--env-list-file');

  if (clearStale) {
    // Konservativ: nur ein Lock dieses Rechners, dessen Halter-PID nachweislich beendet ist.
    const lockPath = lockPathFor(gitCommonDir());
    const st = inspectLock(lockPath);
    if (st.state === 'free') { console.log(`Kein Release-Lock vorhanden (${lockPath}).`); process.exit(0); }
    if (st.state !== 'stale') {
      console.log(`❌ Lock wird NICHT entfernt — Halter lebt oder ist nicht prüfbar: ${describeLock(st.meta)}`);
      process.exit(1);
    }
    rmSync(lockPath, { recursive: true, force: true });
    console.log(`Stale Release-Lock entfernt (${describeLock(st.meta)}). Release bitte neu starten.`);
    process.exit(0);
  }

  console.log('\n⚠️  PRODUCTION EAS UPDATE (Channel: production, Environment: production)\n');

  const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};
  const hasUpdates = !!(pkg.dependencies?.['expo-updates'] || pkg.devDependencies?.['expo-updates']);
  if (!hasUpdates) {
    console.log('❌ expo-updates ist NICHT installiert. OTA-Updates sind aktuell nicht möglich. Abbruch.');
    process.exit(1);
  }

  if (!message.trim()) { console.log('❌ --message fehlt oder ist leer. Kein Update veröffentlicht.'); process.exit(1); }
  if (!ALLOWED_PLATFORMS.includes(platform)) {
    console.log(`❌ --platform muss explizit "ios" oder "android" sein (war: ${platform ?? '—'}). Nie beide Plattformen unbeabsichtigt. Kein Update veröffentlicht.`);
    process.exit(1);
  }
  if (envListFile && !dryRun) { console.log('❌ --env-list-file ist nur mit --dry-run erlaubt. Kein Update veröffentlicht.'); process.exit(1); }
  if (!confirmed && !dryRun) {
    if (args.includes('--initial-runtime-release')) {
      // Erste OTA einer Runtime: nie durch bloßes Setzen des Schalters — nur mit --confirm.
      console.log('❌ STOP: --initial-runtime-release ohne --confirm. Kein Update veröffentlicht.');
      console.log('Vorab prüfen:  … --initial-runtime-release --dry-run   ·   Veröffentlichen nur mit:  … --initial-runtime-release --confirm');
      process.exit(1);
    }
    console.log('Kein Update veröffentlicht.');
    console.log('Bewusst bestätigen mit:  node scripts/update-production.mjs --platform ios --confirm --message "…"');
    process.exit(0);
  }

  // 1. Release-Commit sichtbar machen (der Agent prüft, dass es der gewünschte ist).
  let head = '(unbekannt)', dirty = '', branch = '';
  try {
    head = sh('git', ['rev-parse', 'HEAD']).trim();
    dirty = sh('git', ['status', '--short']).trim();
    branch = sh('git', ['branch', '--show-current']).trim();
  } catch { /* best-effort */ }
  console.log(`git HEAD: ${head}`);
  console.log(`git status --short: ${dirty ? '\n' + dirty : '(sauber)'}`);

  // 2. Staging-Leak-Guard (lokale Env-Quellen).
  if (!assertProductionSupabase()) {
    console.log('Abbruch: Production-Guard fehlgeschlagen. Kein Update veröffentlicht.');
    process.exit(1);
  }

  // 3. Die EAS-Environment `production` muss die Pflichtvariablen enthalten (nur Namen prüfen/ausgeben).
  let listing;
  try {
    listing = envListFile ? readFileSync(envListFile, 'utf8') : sh('eas', ['env:list', 'production', '--format', 'short']);
  } catch {
    console.log('❌ EAS-Environment `production` konnte nicht gelesen werden (eas login / Netz?). Kein Update veröffentlicht.');
    process.exit(1);
  }
  const envCheck = checkProductionEnv(listing);
  console.log(`EAS-Environment production — vorhanden: ${envCheck.present.join(', ') || '—'}`);
  if (!envCheck.ok) {
    if (envCheck.missing.length) console.log(`❌ Fehlend: ${envCheck.missing.join(', ')}`);
    for (const p of envCheck.problems) console.log(`❌ ${p}`);
    console.log('Abbruch: Ohne vollständige Production-Environment darf keine OTA veröffentlicht werden.');
    process.exit(1);
  }

  // 4. Gemeinsamer Release-Lock (alle Worktrees dieses Repos). Dry-Run prüft nur die Verfügbarkeit.
  let lockPath;
  try { lockPath = lockPathFor(gitCommonDir()); } catch {
    console.log('❌ git-common-dir nicht bestimmbar — kein Release-Lock möglich. Kein Update veröffentlicht.');
    process.exit(1);
  }
  if (dryRun) {
    const st = inspectLock(lockPath);
    console.log(`Release-Lock (${lockPath}): ${st.state === 'free' ? 'frei' : st.state === 'stale' ? `STALE — ${describeLock(st.meta)}` : `GESPERRT — ${describeLock(st.meta)}`}`);
    if (st.state !== 'free') { console.log('Publish würde VERWEIGERT (Lock). --dry-run: nichts veröffentlicht.'); process.exit(1); }
  } else {
    const startedAt = new Date().toISOString();
    const meta = { pid: process.pid, host: hostname(), startedAt, worktree: process.cwd(), branch, head, platform };
    const got = acquireReleaseLock(lockPath, meta);
    if (!got.ok) {
      console.log(`❌ HARD STOP: Release-Lock ist ${got.state === 'stale' ? 'STALE' : 'belegt'} — ${describeLock(got.meta)}`);
      if (got.state === 'stale') console.log('   Der Halter-Prozess ist beendet. Erst prüfen, dann bewusst: node scripts/update-production.mjs --clear-stale-lock');
      else console.log('   Eine andere Production-OTA-Session läuft. Warten, bis sie beendet ist.');
      console.log('Kein Update veröffentlicht.');
      process.exit(1);
    }
    // Lock bei JEDEM Ende freigeben: normales Ende, Fehler (process.exit), Abbruchsignal.
    process.on('exit', () => got.release());
    for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
      process.on(sig, () => { got.release(); process.exit(code); });
    }
    console.log(`Release-Lock erworben: ${lockPath}`);
  }

  // 5. Ziel-Runtime (fail closed) + EAS = Source of Truth: frischer Live-Stand nach Lock-Erwerb,
  //    runtime-genau für (Plattform, Ziel-Runtime).
  const releaseRuntime = resolveReleaseRuntime(existsSync('app.json') ? JSON.parse(readFileSync('app.json', 'utf8')) : null);
  const target = resolveTargetRuntime({ runtimeFlag, releaseRuntime });
  if (!target.runtime) {
    for (const p of target.problems) console.log(`❌ ${p}`);
    console.log(dryRun ? 'Publish würde VERWEIGERT. --dry-run: nichts veröffentlicht.' : 'HARD STOP. Kein Update veröffentlicht.');
    process.exit(1);
  }
  let channel, baseline;
  try {
    channel = readChannel();
    baseline = readBaseline(platform, target.runtime, initialRuntimeRelease);
  } catch {
    console.log('❌ Aktiver Production-Stand konnte nicht aus EAS gelesen werden (eas login / Netz?). Kein Update veröffentlicht.');
    process.exit(1);
  }
  const active = baseline.active;
  console.log(`Ziel: ${platform} · Runtime ${target.runtime} (${target.source})${initialRuntimeRelease ? ' · ERSTE OTA dieser Runtime (--initial-runtime-release)' : ''}`);
  console.log(`Baseline-Auswahl: neueste Production-Group mit Plattform ${platform} UND ${initialRuntimeRelease ? 'beliebiger Runtime (erste OTA der Ziel-Runtime)' : `Runtime ${target.runtime}`}`);
  printActive('ACTIVE PRODUCTION (EAS, frisch)', active);
  if (initialRuntimeRelease && active && !baseline.problem) {
    console.log(`\n${formatFirstRuntimeBanner({ platform, targetRuntime: target.runtime, targetCommit: head, baseline: active })}\n`);
  }
  const expectedRuntime = target.runtime;
  const isAncestor = active?.gitCommitHash ? gitIsAncestor(active.gitCommitHash, head) : null;
  const problems = [
    ...channel.problems,
    ...(baseline.problem ? [baseline.problem] : []),
    ...evaluatePublishGuards({ platform, active, releaseHead: head, releaseRuntime, expectedRuntime, isAncestor, dirty: !!dirty, initialRuntimeRelease }),
  ];
  console.log(`RELEASE HEAD: ${head}`);
  console.log(`Ancestry (aktiver Production-Commit ⊆ Release-HEAD): ${isAncestor === true ? 'PASS' : isAncestor === false ? 'FAIL' : 'NICHT PRÜFBAR'}`);
  console.log(`Runtime: Release ${releaseRuntime ?? '—'} · erwartet ${expectedRuntime ?? '—'} (${target.source})`);
  console.log(`Platform: ${platform} only · Channel/Branch: ${PRODUCTION_CHANNEL}/${PRODUCTION_BRANCH} · Environment: production`);

  const easArgs = buildProductionUpdateArgs({ platform, message });
  // EINE Argumentliste für Anzeige, Dry-Run und echte Ausführung — keine getrennte Darstellung.
  console.log(`\nCommand: eas ${easArgs.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  console.log(`argv: ${JSON.stringify(easArgs)}\n`);

  if (problems.length) {
    for (const p of problems) console.log(`❌ ${p}`);
    console.log(dryRun ? 'Publish würde VERWEIGERT. --dry-run: nichts veröffentlicht.' : 'HARD STOP. Kein Update veröffentlicht. (Kein Auto-Rebase/-Merge — bewusst integrieren.)');
    process.exit(1);
  }
  if (dryRun) { console.log('Publish würde ERLAUBT.'); console.log('--dry-run: nichts veröffentlicht.'); process.exit(0); }

  // 6. Zweiter EAS-Check DIREKT vor dem Publish — Production darf sich nicht verändert haben.
  let recheck;
  try {
    const rb = readBaseline(platform, target.runtime, initialRuntimeRelease);
    recheck = rb.problem ? null : rb.active;
  } catch { recheck = null; }
  if (productionChanged(active, recheck)) {
    console.log(`❌ HARD STOP: ${PRODUCTION_CHANGED_MESSAGE}`);
    printActive('   vorher', active);
    printActive('   jetzt ', recheck);
    console.log('Kein Update veröffentlicht.');
    process.exit(1);
  }
  console.log('Zweiter EAS-Check: Production unverändert.');

  console.log(`Bestätigt. Veröffentliche Production-Update (${platform}): "${message}"`);
  // Release-Commit als NICHT geheimer Build-Metadatenwert ins OTA-Bundle (nur Anzeige in der Fährten-Diagnose).
  try {
    execFileSync('eas', easArgs, { stdio: 'inherit', env: buildPublishEnv(process.env, head) });
  } catch {
    console.log('❌ `eas update` ist fehlgeschlagen. Kein automatischer Neuversuch.');
    process.exit(1);
  }

  // 7. Nachkontrolle: frisch aus EAS. Bei Abweichung Fehler — KEIN automatischer Rollback, KEINE zweite OTA.
  let after = null;
  // Bewusst die neueste Group der PLATTFORM (jede Runtime): genau das, was eben veröffentlicht
  // wurde — so fällt auch eine falsche Runtime der neuen Group explizit auf.
  let afterForRuntime = null;
  try { after = readNewestPlatformProduction(platform); } catch { /* unten als Fehler gemeldet */ }
  try { afterForRuntime = readActiveProduction(platform, target.runtime); } catch { /* unten als Fehler gemeldet */ }
  console.log('\n── Verifikation ──');
  console.log(`Channel: ${PRODUCTION_CHANNEL}   Branch: ${PRODUCTION_BRANCH}   Environment: production`);
  if (after) {
    console.log(`Platform: ${after.platform}   Runtime: ${after.runtimeVersion}`);
    console.log(`Update Group ID: ${after.group}   Platform Update ID: ${after.id}`);
    console.log(`gitCommitHash: ${after.gitCommitHash}   Message: ${message}`);
  }
  const post = verifyPostPublish({ before: active, after, platform, releaseHead: head, releaseRuntime, afterForRuntime });
  if (post.length) {
    for (const p of post) console.log(`❌ POST-PUBLISH: ${p}`);
    console.log('❌ Nachkontrolle FEHLGESCHLAGEN. Kein automatischer Rollback und keine zweite OTA — Rollback ist eine bewusste Freigabeentscheidung.');
    process.exit(2);
  }
  console.log('✅ Nachkontrolle: neue Group live, Plattform/Runtime/gitCommitHash exakt.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
