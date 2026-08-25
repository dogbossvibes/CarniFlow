#!/usr/bin/env node
// ANYVO — Release-Guard: Supabase-Projekt-Ref im JS-Bundle.
//
// Stellt sicher, dass ein exportiertes JS-Bundle das PRODUCTION-Supabase-Projekt
// enthält und NICHT das Staging-Projekt. Verhindert die versehentliche Auslieferung
// eines Staging-Bundles als Production-OTA/-Build (siehe Vorfall: Client zeigte auf
// Staging, Auth/Provider/SMTP fehlten → alle Auth-Flows „kaputt").
//
// Verwendung:
//   node scripts/verify-bundle-supabase.mjs [distDir]     # vorhandenes dist prüfen (Default: dist)
//   node scripts/verify-bundle-supabase.mjs --export      # frisch exportieren (ios+android) + prüfen
//
// Exit 0  = ok (nur Production-Ref, kein Staging)
// Exit 1  = Staging gefunden ODER Production-Ref fehlt ODER kein Bundle gefunden
//
// Es werden nur die (öffentlichen) Projekt-Refs geprüft — keine Keys/Secrets.

import { readdirSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const PROD_REF = 'axkkhyqrjrtbkumaulta';       // ANYVO Production
const STAGING_REF = 'cbhrxkjclakzlvajyvfn';    // ANYVO Staging (darf NIE im Prod-Bundle sein)

const args = process.argv.slice(2);
const doExport = args.includes('--export');
let distDir = args.find((a) => !a.startsWith('--')) || 'dist';

if (doExport) {
  distDir = mkdtempSync(join(tmpdir(), 'anyvo-bundle-check-'));
  console.log('▶ Exportiere Bundle (ios,android) nach', distDir, '…');
  // Gleiche Runtime wie ein Production-Export; Web wird bewusst ausgelassen
  // (react-native-maps bricht den Web-Export ab und ist für den Ref-Check irrelevant).
  execSync(`npx expo export --platform ios --platform android --output-dir ${distDir}`, { stdio: 'inherit' });
}

const jsDir = join(distDir, '_expo', 'static', 'js');
if (!existsSync(jsDir)) {
  console.error(`❌ Kein JS-Bundle unter ${jsDir} gefunden. Zuerst exportieren (--export) oder distDir angeben.`);
  process.exit(1);
}

// Rekursiv alle Bundle-Dateien (.hbc / .js) sammeln.
function collect(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (/\.(hbc|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const bundles = collect(jsDir);
if (bundles.length === 0) {
  console.error(`❌ Keine .hbc/.js-Bundles unter ${jsDir}.`);
  process.exit(1);
}

let prodFound = false;
const stagingHits = [];
for (const file of bundles) {
  const content = readFileSync(file, 'latin1'); // Bytes als String, findet String-Literale auch im Hermes-Bytecode
  if (content.includes(PROD_REF)) prodFound = true;
  if (content.includes(STAGING_REF)) stagingHits.push(file);
}

console.log(`\nGeprüfte Bundles: ${bundles.length}`);
console.log(`Production-Ref (${PROD_REF}) vorhanden: ${prodFound ? 'JA' : 'NEIN'}`);
console.log(`Staging-Ref (${STAGING_REF}) vorhanden: ${stagingHits.length ? 'JA' : 'NEIN'}`);

if (stagingHits.length) {
  console.error('\n❌ ABBRUCH: Staging-Ref im Bundle gefunden:');
  for (const f of stagingHits) console.error('   -', f);
  process.exit(1);
}
if (!prodFound) {
  console.error('\n❌ ABBRUCH: Production-Ref NICHT im Bundle gefunden (falsche/fehlende EXPO_PUBLIC_SUPABASE_URL?).');
  process.exit(1);
}

console.log('\n✅ OK: Bundle zeigt auf Production, kein Staging enthalten.');
process.exit(0);
