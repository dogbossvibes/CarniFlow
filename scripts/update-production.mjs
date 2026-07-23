#!/usr/bin/env node
// ANYVO — PRODUCTION EAS Update (abgesichert). Veröffentlicht NICHT automatisch.
// Erfordert bewusste Bestätigung UND eine Nachricht:
//
//   node scripts/update-production.mjs --confirm --message "Was wurde geändert"
//
// Ohne --confirm passiert nichts außer einer Warnung. Dieses Skript ist bewusst
// die einzige Production-Update-Stelle, damit ein Dev-Befehl Production nie
// versehentlich überschreibt.
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');
const mi = args.indexOf('--message');
const message = mi >= 0 ? args[mi + 1] : '';

console.log('\n⚠️  PRODUCTION EAS UPDATE (Channel: production)\n');

// Voraussetzung: expo-updates muss installiert + in einem Store-Build aktiv sein.
const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};
const hasUpdates = !!(pkg.dependencies?.['expo-updates'] || pkg.devDependencies?.['expo-updates']);
if (!hasUpdates) {
  console.log('❌ expo-updates ist NICHT installiert. OTA-Updates sind aktuell nicht möglich.');
  console.log('   Zuerst expo-updates einrichten (native Änderung → ein neuer Store-Build nötig),');
  console.log('   danach kann dieser Kanal Updates empfangen. Abbruch.');
  process.exit(1);
}

if (!confirmed || !message) {
  console.log('Kein Update veröffentlicht.');
  console.log('Bewusst bestätigen mit:  node scripts/update-production.mjs --confirm --message "…"');
  process.exit(confirmed ? 1 : 0);
}

console.log(`Bestätigt. Veröffentliche Production-Update: "${message}"`);
execSync(`eas update --channel production --message ${JSON.stringify(message)}`, { stdio: 'inherit' });
