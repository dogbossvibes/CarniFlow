#!/usr/bin/env node
// ANYVO — PRODUCTION EAS Update (abgesichert). Veröffentlicht NICHT automatisch.
//
//   node scripts/update-production.mjs --platform ios --confirm --message "Was wurde geändert"
//   npm run update:production:ios -- --message "Was wurde geändert"
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
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { assertProductionSupabase, PROD_REF } from './guard-prod-supabase.mjs';

export const REQUIRED_PRODUCTION_ENV = Object.freeze([
  'EXPO_PUBLIC_BACKEND_ENV',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
]);
export const ALLOWED_PLATFORMS = Object.freeze(['ios', 'android']);

/** Die einzigen Argumente, mit denen eine Production-OTA je gestartet wird. */
export function buildProductionUpdateArgs({ platform, message }) {
  if (!ALLOWED_PLATFORMS.includes(platform)) throw new Error(`platform muss explizit ios oder android sein (war: ${platform ?? '—'})`);
  if (typeof message !== 'string' || !message.trim()) throw new Error('message darf nicht leer sein');
  return [
    'update',
    '--channel', 'production',
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

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');
  const dryRun = args.includes('--dry-run');
  const message = argValue(args, '--message') ?? '';
  const platform = argValue(args, '--platform');
  // Nur für Tests/Dry-Run: Env-Liste aus Datei statt aus EAS. Nie zusammen mit einer echten Veröffentlichung.
  const envListFile = argValue(args, '--env-list-file');

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
    console.log('Kein Update veröffentlicht.');
    console.log('Bewusst bestätigen mit:  node scripts/update-production.mjs --platform ios --confirm --message "…"');
    process.exit(0);
  }

  // 1. Release-Commit sichtbar machen (der Agent prüft, dass es der gewünschte ist).
  let head = '(unbekannt)', dirty = '';
  try { head = sh('git', ['rev-parse', 'HEAD']).trim(); dirty = sh('git', ['status', '--short']).trim(); } catch { /* best-effort */ }
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

  const easArgs = buildProductionUpdateArgs({ platform, message });
  // EINE Argumentliste für Anzeige, Dry-Run und echte Ausführung — keine getrennte Darstellung.
  console.log(`\nCommand: eas ${easArgs.map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  console.log(`argv: ${JSON.stringify(easArgs)}\n`);
  if (dryRun) { console.log('--dry-run: nichts veröffentlicht.'); process.exit(0); }

  console.log(`Bestätigt. Veröffentliche Production-Update (${platform}): "${message}"`);
  execFileSync('eas', easArgs, { stdio: 'inherit' });

  // 4. Nachkontrolle (best-effort, keine Secrets): Channel-Kopf gegen Pflichtfelder prüfen.
  try {
    const raw = sh('eas', ['channel:view', 'production', '--json', '--non-interactive']);
    const j = JSON.parse(raw.slice(raw.indexOf('{')));
    const branch = j.currentPage?.updateBranches?.[0];
    const u = branch?.updateGroups?.[0]?.find(x => x.platform === platform) ?? branch?.updateGroups?.[0]?.[0];
    if (u) {
      console.log('\n── Verifikation ──');
      console.log(`Channel: ${j.currentPage.name}   Branch: ${branch.name}   Environment: ${u.environment ?? '—'}`);
      console.log(`Platform: ${u.platform}   Runtime: ${u.runtimeVersion}`);
      console.log(`Update Group ID: ${u.group}   Platform Update ID: ${u.id}`);
      console.log(`gitCommitHash: ${u.gitCommitHash}   Message: ${u.message}`);
      if (u.environment !== 'production') console.log('❌ WARNUNG: Environment ist NICHT production!');
      if (head !== '(unbekannt)' && u.gitCommitHash !== head) console.log('❌ WARNUNG: gitCommitHash ≠ lokaler HEAD!');
    }
  } catch { console.log('(Nachkontrolle nicht möglich — bitte manuell: eas channel:view production --json)'); }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
