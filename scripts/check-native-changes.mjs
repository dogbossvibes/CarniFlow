#!/usr/bin/env node
// ANYVO — Build-Entscheidung: prüft, ob seit einer Basis native-relevante Dateien
// geändert wurden. Startet NIEMALS selbst einen Build. Reine Analyse.
//
//   node scripts/check-native-changes.mjs [<basis-ref>]
//
// Basis-Ref optional (Default: letzter Git-Tag, sonst erster Commit). Berücksichtigt
// committete Änderungen seit der Basis UND uncommittete Änderungen im Arbeitsbaum.
import { execSync } from 'node:child_process';

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
function safe(fn, fallback = '') { try { return fn(); } catch { return fallback; } }

// Kein Git → nicht abstürzen.
if (!safe(() => git('rev-parse --is-inside-work-tree')) ) {
  console.log('ℹ️  Kein Git-Repository gefunden. Build-Entscheidung nicht möglich.');
  console.log('   Lege eine Basis an (z. B. git init + erster Commit) oder prüfe manuell.');
  process.exit(0);
}

// Basis: expliziter Ref → letzter Tag → letzter Release-Bump-Commit → erster Commit.
const base =
  process.argv[2] ||
  safe(() => git('describe --tags --abbrev=0')) ||
  safe(() => git('log --grep="bump to build" -1 --format=%H')) ||
  safe(() => git('rev-list --max-parents=0 HEAD').split('\n')[0]) ||
  'HEAD';

const committed = safe(() => git(`diff --name-only ${base} HEAD`), '').split('\n').filter(Boolean);
const uncommitted = safe(() => git('status --porcelain'), '')
  .split('\n').filter(Boolean).map(l => l.slice(3).trim());
const files = [...new Set([...committed, ...uncommitted])];

// Native-relevante Muster → (Grund, Plattform)
const RULES = [
  { re: /(^|\/)package-lock\.json$|(^|\/)yarn\.lock$|(^|\/)pnpm-lock\.yaml$/, why: 'Abhängigkeiten installiert/geändert (native Autolinking möglich)', plat: 'beide' },
  { re: /(^|\/)app\.(json|config\.(js|ts))$/, why: 'App-Config (Plugins/Permissions/Version/native Optionen)', plat: 'beide' },
  { re: /(^|\/)eas\.json$/, why: 'EAS-Build-Konfiguration', plat: 'beide' },
  { re: /^ios\//, why: 'iOS-Nativprojekt', plat: 'iOS' },
  { re: /^android\//, why: 'Android-Nativprojekt', plat: 'Android' },
  { re: /^plugins\//, why: 'Expo Config Plugin (greift in den nativen Build ein)', plat: 'beide' },
  { re: /^patches\//, why: 'Patch an einem Paket', plat: 'beide' },
  { re: /Info\.plist$|\.entitlements$|Podfile(\.lock)?$/, why: 'iOS native Config', plat: 'iOS' },
  { re: /AndroidManifest\.xml$|\.gradle$|gradle\.properties$|gradle-wrapper/, why: 'Android native Config', plat: 'Android' },
];

const hits = [];
for (const f of files) {
  for (const r of RULES) {
    if (r.re.test(f)) { hits.push({ file: f, why: r.why, plat: r.plat }); break; }
  }
}

// Sonderfall: package.json ohne Lockfile-Änderung = i. d. R. nur Scripts/Meta → KEIN Build.
const pkgOnly = files.includes('package.json') && !hits.some(h => /package-lock|yarn\.lock|pnpm-lock/.test(h.file));

console.log(`\nBasis:        ${base}`);
console.log(`Dateien seit Basis (inkl. Arbeitsbaum): ${files.length}`);

if (hits.length === 0) {
  console.log('\n✅ ERGEBNIS A: KEIN neuer nativer Build erforderlich.');
  console.log('   JS/TS/Styling/Assets → per EAS Update ausrollbar (sobald expo-updates eingerichtet ist)');
  console.log('   oder lokal via Dev-Client/Metro testen.');
  console.log('   Empfohlener nächster Befehl:  npm run dev   (oder:  npm run update:preview -- "msg")');
  if (pkgOnly) console.log('   Hinweis: package.json geändert, aber keine Abhängigkeiten (Lockfile unverändert) → unkritisch.');
  process.exit(0);
}

const plats = new Set(hits.map(h => h.plat));
const platform = plats.has('beide') || (plats.has('iOS') && plats.has('Android')) ? 'iOS + Android'
  : [...plats][0];

console.log('\n🔴 ERGEBNIS B: NEUER nativer Build erforderlich.');
console.log(`   Plattform: ${platform}`);
console.log('   Betroffene Dateien / Gründe:');
for (const h of hits.slice(0, 40)) console.log(`     • ${h.file}  →  ${h.why} [${h.plat}]`);
console.log('\n   Empfohlener nächster Befehl (MANUELL ausführen, nie automatisch):');
console.log('     lokal & kostenlos:  npm run build:local:ios:dev   /   npm run build:local:android:dev');
console.log('     oder Cloud:         eas build --profile production --platform all');
console.log('\n   (Dieses Skript startet NIEMALS selbst einen Build.)');
process.exit(0);
