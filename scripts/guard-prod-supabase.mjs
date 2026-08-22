#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// PERMANENTER PRODUCTION-GUARD gegen den wiederkehrenden Staging-Supabase-Leak.
//
// Blockiert (exit 1) einen Production-Release, wenn irgendeine Env-Quelle die
// STAGING-Supabase-Ref (cbhrxkjclakzlvajyvfn) enthält, oder wenn die effektive
// EXPO_PUBLIC_SUPABASE_URL nicht auf Production (axkkhyqrjrtbkumaulta) zeigt.
//
// Grund: `.env.local` (untracked) kann die Staging-URL enthalten; Expo inlined
// EXPO_PUBLIC_* beim Bundlen daraus → OTA würde Staging ausliefern
// ("Unsupported provider: provider is not enabled"). Dieser Guard wird vom
// einzigen Prod-OTA-Entry (scripts/update-production.mjs) VOR jeder
// Veröffentlichung erzwungen und kann zusätzlich standalone laufen.
// ──────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync, readdirSync } from 'node:fs';

export const STAGING_REF = 'cbhrxkjclakzlvajyvfn';
export const PROD_REF = 'axkkhyqrjrtbkumaulta';
const KEY = 'EXPO_PUBLIC_SUPABASE_URL';

function parseEnv(txt) {
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// Prüft die effektive Supabase-Konfiguration. Gibt true zurück, wenn Production
// sicher ist; sonst false (mit erklärender Ausgabe). Wirft nie.
export function assertProductionSupabase({ cwd = process.cwd(), log = console } = {}) {
  const problems = [];
  let effective = process.env[KEY] || null;               // process.env hat Vorrang

  const envFiles = existsSync(cwd)
    ? readdirSync(cwd).filter(f => /^\.env(\..*)?$/.test(f) && !f.endsWith('.example'))
    : [];
  for (const f of envFiles) {
    let txt = '';
    try { txt = readFileSync(`${cwd}/${f}`, 'utf8'); } catch { continue; }
    if (txt.includes(STAGING_REF)) problems.push(`Staging-Ref ${STAGING_REF} in ${f}`);
    const env = parseEnv(txt);
    if (env[KEY]) {
      if (!effective) effective = env[KEY];
      if (env[KEY].includes(STAGING_REF)) problems.push(`${KEY} zeigt auf STAGING in ${f}`);
    }
  }
  if (process.env[KEY]?.includes(STAGING_REF)) problems.push(`${KEY} zeigt auf STAGING in process.env`);

  // Leer ist erlaubt: der Code-Fallback in lib/supabase.ts ist Production.
  if (effective && !effective.includes(PROD_REF)) {
    problems.push(`effektive ${KEY}=${effective} ist nicht Production (${PROD_REF})`);
  }

  if (problems.length) {
    log.error('\n❌ PROD-GUARD: Production-Release BLOCKIERT — Supabase nicht Production:');
    for (const p of problems) log.error('   • ' + p);
    log.error(`\n   Fix: staging .env.local entfernen bzw. ${KEY} auf ${PROD_REF} setzen`);
    log.error('   und mit  --environment production  veröffentlichen.\n');
    return false;
  }
  log.log(`✅ PROD-GUARD OK: keine Staging-Ref (${STAGING_REF}); `
    + `Supabase ${effective ? 'Production' : '(Env leer → Code-Fallback Production)'}.`);
  return true;
}

// Standalone: `node scripts/guard-prod-supabase.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(assertProductionSupabase() ? 0 : 1);
}
