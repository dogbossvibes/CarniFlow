#!/usr/bin/env node
// ANYVO Release-Preflight (lokal, ausschliesslich lesend).
// Bündelt die lokalen Vorabprüfungen vor Build/TestFlight/OTA/Store und erzeugt
// einen Bericht für den Task-Report. Veröffentlicht NICHTS, ruft keine EAS-,
// Store-, GitHub- oder Datenbank-Schreibbefehle auf, liest keine Secret-Werte.
// Frische EAS-/Store-Stände (aktive Production-Updates, Builds) sind bewusst
// NICHT Teil dieses Skripts: sie werden unmittelbar vor einer freigegebenen
// Veröffentlichung separat und frisch gelesen (siehe CLAUDE.md, Pflicht-Preflight).
//
//   node scripts/claude/release-preflight.mjs --base <letzter-release-commit> [--platform ios|android]
//
// Exit 0 = keine lokalen Blocker, 1 = Blocker gefunden, 2 = nicht bestimmbar.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (root, ...a) => { try { return git(root, ...a); } catch { return null; } };

export function versionFacts(root) {
  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo || {};
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const rv = app.runtimeVersion;
  const facts = {
    appVersion: app.version ?? null,
    packageVersion: pkg.version ?? null,
    iosBuildNumber: app.ios?.buildNumber ?? null,
    androidVersionCode: app.android?.versionCode ?? null,
    runtimeVersion: rv && typeof rv === 'object' ? `policy:${rv.policy}` : rv ?? null,
    expo: pkg.dependencies?.expo ?? null,
    warnings: [],
  };
  if (!facts.appVersion) facts.warnings.push('expo.version fehlt');
  if (!facts.iosBuildNumber) facts.warnings.push('ios.buildNumber fehlt');
  if (!facts.androidVersionCode) facts.warnings.push('android.versionCode fehlt');
  if (existsSync(join(root, 'app.config.js')) || existsSync(join(root, 'app.config.ts'))) facts.warnings.push('app.config.* vorhanden: effektive Werte mit `npx expo config --type public` prüfen');
  return facts;
}

function main() {
  const args = process.argv.slice(2);
  const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const base = val('--base');
  const platform = val('--platform');
  if (!base) { console.error('STOP: --base <letzter Release-Commit> ist Pflicht (keine stille Basis).'); process.exit(2); }
  if (platform && !['ios', 'android'].includes(platform)) { console.error('STOP: --platform nur ios oder android.'); process.exit(2); }
  let root;
  try { root = git(process.cwd(), 'rev-parse', '--show-toplevel'); } catch { console.error('STOP: kein Git-Repository.'); process.exit(2); }

  const blockers = [];
  const notes = [];
  const line = (k, v) => console.log(`| ${k} | ${v} |`);
  const branch = tryGit(root, 'branch', '--show-current') || '(detached)';
  const head = tryGit(root, 'rev-parse', 'HEAD');
  const baseSha = tryGit(root, 'rev-parse', '--verify', `${base}^{commit}`);
  if (!baseSha) { console.error(`STOP: Basis ${base} nicht auflösbar.`); process.exit(2); }
  const dirty = (tryGit(root, 'status', '--porcelain') || '').split('\n').filter(Boolean);
  const isAncestor = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', baseSha, 'HEAD']).status === 0;
  const counts = tryGit(root, 'rev-list', '--left-right', '--count', 'origin/main...HEAD');
  const upstream = tryGit(root, 'rev-parse', '--abbrev-ref', '@{upstream}');
  const unpushed = upstream ? tryGit(root, 'rev-list', '--count', `${upstream}..HEAD`) : null;

  if (dirty.length) blockers.push(`Worktree nicht sauber (${dirty.length} Einträge): Release nur aus committetem Stand`);
  if (!isAncestor) blockers.push(`Basis ${base} ist kein Vorfahre von HEAD (Ancestry-Bruch → kein OTA)`);
  if (/^(main)$/.test(branch)) notes.push('Release direkt von main: nur mit dokumentierter Freigabe');

  let v;
  try { v = versionFacts(root); } catch { blockers.push('app.json/package.json nicht lesbar'); v = { warnings: [] }; }
  if (v.appVersion && v.packageVersion && v.appVersion !== v.packageVersion) notes.push(`Version app.json ${v.appVersion} ≠ package.json ${v.packageVersion}`);
  notes.push(...v.warnings);

  // Native Änderungen gegen die Basis (bestehender Projekt-Guard, lesend)
  let native = { label: 'nicht geprüft' };
  if (existsSync(join(root, 'scripts/check-native-changes.mjs'))) {
    const r = spawnSync('node', ['scripts/check-native-changes.mjs', baseSha], { cwd: root, encoding: 'utf8' });
    if (r.status === 0) native = { label: 'nur JS/Assets (OTA technisch möglich)' };
    else if (r.status === 1) {
      let hits = [];
      try { hits = JSON.parse(r.stdout).hits.map((h) => `${h.path} (${h.platform})`); } catch { /* Ausgabe unbekannt */ }
      native = { label: `NATIVE Änderung → neuer nativer Build nötig, kein OTA: ${hits.slice(0, 8).join(', ')}` };
      blockers.push('Native Änderungen gegenüber Basis: OTA unzulässig, nativer Build erforderlich');
    } else { native = { label: 'nicht bestimmbar' }; blockers.push('Native Kompatibilität nicht bestimmbar'); }
  }

  // Production-Supabase-Guard (bestehender Projekt-Guard; gibt nur Projekt-Refs aus)
  let supa = 'nicht vorhanden';
  if (existsSync(join(root, 'scripts/guard-prod-supabase.mjs'))) {
    const r = spawnSync('node', ['scripts/guard-prod-supabase.mjs'], { cwd: root, encoding: 'utf8' });
    supa = r.status === 0 ? 'Production-Supabase bestätigt (lokale Env-Quellen)' : 'BLOCKIERT: Staging-Ref oder fehlende Production-URL in lokaler Env';
    if (r.status !== 0) notes.push('Supabase-Guard lokal rot: vor Production-OTA klären (EAS-Environment production ist massgeblich)');
  }

  const changed = (tryGit(root, 'diff', '--name-only', baseSha, 'HEAD') || '').split('\n').filter(Boolean);
  const migrations = changed.filter((f) => /^supabase\/migrations\/|\.sql$/.test(f));
  if (migrations.length) notes.push(`DB-Migrationen im Release-Diff (${migrations.length}): separate ausdrückliche Production-Freigabe nötig`);
  const tracking = changed.filter((f) => /(track|faehrte|gps|sensor|location)/i.test(f));
  if (tracking.length) notes.push(`Tracking-relevante Dateien geändert (${tracking.length}): Feldtest-Beleg erforderlich`);

  console.log('# ANYVO Release-Preflight (lokal)\n');
  console.log('| Prüfpunkt | Ergebnis |\n|---|---|');
  line('Worktree', root);
  line('Branch / HEAD', `${branch} @ ${head?.slice(0, 12)}`);
  line('Basis', `${base} = ${baseSha.slice(0, 12)} · Vorfahre von HEAD: ${isAncestor ? 'ja' : 'NEIN'}`);
  line('Worktree sauber', dirty.length ? `NEIN (${dirty.length})` : 'ja');
  line('Upstream / ungepusht', upstream ? `${upstream} · ${unpushed} Commit(s) nicht gepusht` : 'kein Upstream');
  if (counts) { const [b, a] = counts.split(/\s+/); line('origin/main (lokaler Stand)', `${b} zurück · ${a} voraus`); }
  line('Version / Runtime', `${v.appVersion} · runtime ${v.runtimeVersion} · Expo ${v.expo}`);
  line('Build-Nummern', `iOS ${v.iosBuildNumber} · Android ${v.androidVersionCode}`);
  line('Plattform', platform || 'nicht angegeben (für OTA Pflicht)');
  line('Native Änderungen', native.label);
  line('Supabase-Guard', supa);
  line('Geänderte Dateien seit Basis', String(changed.length));
  console.log('\n## Blocker');
  console.log(blockers.length ? blockers.map((b) => `- ${b}`).join('\n') : '- keine lokalen Blocker');
  console.log('\n## Hinweise');
  console.log(notes.length ? notes.map((n) => `- ${n}`).join('\n') : '- keine');
  console.log('\n## Nicht Teil dieses Preflights (separat, frisch, vor Freigabe)');
  console.log('- Aktiven Production-Stand frisch aus EAS lesen; dessen gitCommitHash muss Vorfahre von HEAD sein');
  console.log('- Typecheck/Lint/Tests: node scripts/claude/quality-check.mjs --base <basis> --full');
  console.log('- Geräteabnahme iOS/Android und bei Tracking Feldtest');
  console.log('- Veröffentlichung nur mit ausdrücklicher Freigabe; Production-OTA nur über den Wrapper mit --environment production');
  console.log('\nKein Build, kein OTA, kein Submit, kein Push ausgeführt.');
  process.exit(blockers.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
