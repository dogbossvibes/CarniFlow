#!/usr/bin/env node
// ANYVO — Preflight: bündelt alle KOSTENLOSEN lokalen Prüfungen vor Build/Update.
// Löst KEINE Cloud-Builds, Submits oder Updates aus. `npm run check`.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const results = [];
function step(name, fn, { critical = true } = {}) {
  process.stdout.write(`\n▶ ${name}\n`);
  try { fn(); results.push({ name, ok: true, critical }); process.stdout.write(`  ✓ ok\n`); }
  catch (e) {
    results.push({ name, ok: false, critical });
    const msg = (e.stdout?.toString() || e.message || '').split('\n').slice(-15).join('\n');
    process.stdout.write(`  ✗ ${critical ? 'FEHLER' : 'Warnung'}\n${msg}\n`);
  }
}
const run = (cmd) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });

// 1–4: TypeScript / Lint / Doctor / Tests
step('TypeScript (tsc --noEmit)', () => run('npx tsc --noEmit'));
// Lint als Warnung: Style-/Lint-Fehler blockieren keinen Build/Update. Neue
// Dateien sollten dennoch lint-sauber sein (im PR prüfen).
step('ESLint (expo lint)', () => run('npx expo lint'), { critical: false });
step('Expo Doctor', () => run('npx expo-doctor'), { critical: false });
step('Tests (jest)', () => run('npx jest --runInBand'));

// 5: App-Config lädt sauber
step('App-Config (expo config)', () => {
  const json = run('npx expo config --type public --json');
  const c = JSON.parse(json.slice(json.indexOf('{')));
  if (!c.ios?.buildNumber || !c.android?.versionCode) throw new Error('buildNumber/versionCode fehlen');
});

// 6: Pflicht-Env vorhanden (OHNE Werte auszugeben)
step('Environment-Variablen (ohne Werte)', () => {
  const need = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const missing = need.filter(k => !process.env[k] && !new RegExp(`^${k}=`, 'm').test(env));
  if (missing.length) throw new Error(`fehlend: ${missing.join(', ')} (setze sie in .env / EAS-Secrets)`);
});

// 7: ANYVO CONNECT im Production-Profil deaktiviert
step('ANYVO CONNECT in Production deaktiviert', () => {
  const eas = existsSync('eas.json') ? readFileSync('eas.json', 'utf8') : '';
  const dotenv = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const enabledInEas = /EXPO_PUBLIC_FEATURE_CONNECT_ENABLED"\s*:\s*"true"/.test(eas);
  const enabledInEnv = /^EXPO_PUBLIC_FEATURE_CONNECT_ENABLED=true\s*$/m.test(dotenv);
  if (enabledInEas || enabledInEnv) {
    throw new Error('CONNECT ist aktiviert! Für Production muss EXPO_PUBLIC_FEATURE_CONNECT_ENABLED aus sein.');
  }
});

// Zusammenfassung
const failedCritical = results.filter(r => !r.ok && r.critical);
const warned = results.filter(r => !r.ok && !r.critical);
console.log('\n──────────────────────────────────────────');
console.log(`Preflight: ${results.filter(r => r.ok).length}/${results.length} ok` +
  (warned.length ? `, ${warned.length} Warnung(en)` : '') +
  (failedCritical.length ? `, ${failedCritical.length} FEHLER` : ''));
if (failedCritical.length) { console.log('❌ Kritische Fehler — kein Build/Update.'); process.exit(1); }
console.log('✅ Bereit. (Kein Cloud-Build/Submit/Update ausgelöst.)');
