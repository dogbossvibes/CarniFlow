// Ebene 2 – Schemaplan und Testsuiten für das lokale Prüfzentrum.
// Pfade mit Präfix `target:` stammen aus dem geprüften Commit, `tool:` aus dem
// Prüfzentrum selbst (rekonstruierte Production-Objekte, Testfälle).
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Nicht-numerierte Root-SQL-Dateien, die vor einer bestimmten Migration nötig sind
// (Reihenfolge wie in supabase/local/README-track-sharing.md dokumentiert).
const INSERT_BEFORE = {
  '20260802100000': ['SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql'],
  '20260913220000': ['TRACK_MODULE_SETUP.sql', 'TRACK_MARKER_ANGLE.sql', 'TRACK_MARKER_MATERIAL.sql', 'TRACK_ENGINE_DATA_SETUP.sql'],
  '20260929080000': ['TRAININGPLAENE_SETUP.sql'],
};

// Bekannte Lücken: Production-Objekte, die nirgends versioniert sind.
export const KNOWN_GAPS = {
  '20260928090000_trainer_profiles_entitlement.sql': 'public.trainer_profiles ist nicht versioniert (nur im Production-Snapshot aa40c4e0).',
  '20260929080000_training_plans_entitlement.sql': 'public.is_trainer_module() ist nicht versioniert.',
};

// Regressionsfälle, die von einer bekannten Lücke abhängen bzw. vorbestehend defekt sind.
export const CASE_BLOCKED_BY = {
  'phase9_generic_connection_cases.sql': ['20260928090000_trainer_profiles_entitlement.sql'],
  'phase10_meine_trainer_cases.sql': ['20260928090000_trainer_profiles_entitlement.sql', '20260929080000_training_plans_entitlement.sql'],
};
export const CASE_KNOWN_BROKEN = {
  'health_sharing_rls_test.sql': 'Vorbestehender Syntaxfehler in der Testdatei (`end;` statt `end if;` im Block "non-owner grant INSERT").',
};

export function schemaPlan(root) {
  const steps = [{ id: 'baseline.sql', path: 'supabase/local/baseline.sql' }];
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort();
  for (const m of migrations) {
    for (const extra of INSERT_BEFORE[m.slice(0, 14)] ?? []) {
      if (existsSync(join(root, extra))) steps.push({ id: extra, path: extra, rootSetup: true });
    }
    steps.push({ id: m, path: `supabase/migrations/${m}`, knownGap: KNOWN_GAPS[m] ?? null });
  }
  return steps;
}

export function regressionCases(root) {
  const dir = join(root, 'supabase/local');
  return readdirSync(dir).filter(f => /(_cases|_rls_test)\.sql$/.test(f)).sort()
    .map(f => ({ id: f, path: `supabase/local/${f}`, blockedBy: CASE_BLOCKED_BY[f] ?? [], knownBroken: CASE_KNOWN_BROKEN[f] ?? null }));
}

export const SUITES = {
  'training-doku-rating-scale': {
    title: 'T-184 rating_scale: Speichern/Laden/Bearbeiten, alte Sterne, ältere App, ungültige Werte, Token, Rückweg',
    // Werden dauerhaft in die Wegwerf-DB eingespielt (Ausgangszustand = Production vor T-184).
    setup: [
      'tool:supabase/local/verify-center/training_document_prereqs.reconstructed.sql',
      'target:supabase/drafts/training_document_v1.production-2026-11-09.sql',
    ],
    draft: 'target:supabase/drafts/20261109190000_training_exercises_rating_scale.sql',
    guardPattern: /keine Ausführungsfreigabe/,
    pre: 'tool:supabase/local/verify-center/training_document_rating_scale_pre_cases.sql',
    post: 'tool:supabase/local/verify-center/training_document_rating_scale_post_cases.sql',
    rollbackDefinition: 'target:supabase/drafts/training_document_v1.production-2026-11-09.sql',
    rollback: 'tool:supabase/local/verify-center/training_document_rating_scale_rollback_cases.sql',
    markers: ['RATING_SCALE_PRE', 'RATING_SCALE_POST', 'RATING_SCALE_ROLLBACK'],
  },
};

/**
 * Entfernt für den LOKALEN Lauf den Abbruchblock (DO-Block mit Guard-Text) sowie
 * eigene begin;/commit;-Zeilen, damit der Runner die Migration in seiner
 * Rollback-Transaktion ausführen kann. Die Originaldatei bleibt unverändert.
 */
export function stripDraftGuard(sql, guardPattern) {
  const lines = sql.split('\n');
  const out = [];
  let removedGuards = 0;
  let removedTx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^do \$\$\s*$/i.test(line.trim()) || /^do \$\$/i.test(line)) {
      const block = [line];
      let j = i;
      // Einzeiliger DO-Block (öffnendes und schliessendes $$ auf derselben Zeile)?
      if (!((line.match(/\$\$/g) ?? []).length >= 2 && /\$\$\s*;\s*$/.test(line))) {
        j = i + 1;
        while (j < lines.length && !/\$\$\s*;\s*$/.test(lines[j])) block.push(lines[j++]);
        if (j < lines.length) block.push(lines[j]);
      }
      if (guardPattern.test(block.join('\n'))) { removedGuards++; i = j; continue; }
      out.push(...block); i = j; continue;
    }
    if (/^\s*(begin|commit)\s*;\s*$/i.test(line)) { removedTx++; continue; }
    out.push(line);
  }
  return { sql: out.join('\n'), removedGuards, removedTx };
}
