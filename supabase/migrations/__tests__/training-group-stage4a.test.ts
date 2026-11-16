/**
 * Gruppentraining Stufe 4a — statische Prüfung. Verhalten gegen PostgreSQL:
 * supabase/local/training_group_stage4a_cases.sql (Teilen, Trainer-Sicht, Rolle, Einstellung, Löschen, Rechte).
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261116210000_training_group_stage4a.sql', 'utf8');
const code = sql.replace(/^--.*$/gm, '');
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');

describe('Stufe 4a', () => {
  it('nur additiv: keine bestehenden Daten löschen oder umschreiben', () => {
    expect(topLevel).not.toMatch(/\b(drop table|truncate|delete from|update public\.|insert into)/i);
    expect(topLevel).not.toMatch(/drop column|alter column/i);
  });
  it('neue Spalten mit sicherem Standard', () => {
    expect(code).toMatch(/add column if not exists share_outside boolean not null default false/i);
    expect(code).toMatch(/add column if not exists is_trainer boolean not null default false/i);
  });
  it('neue Tabellen für App-Rollen geschlossen', () => {
    expect(topLevel).toMatch(/alter table public\.training_private_evaluations enable row level security/i);
    expect(topLevel).toMatch(/alter table public\.training_private_evaluation_grants enable row level security/i);
    expect(topLevel).toMatch(/revoke all on table public\.training_private_evaluations, public\.training_private_evaluation_grants from public, anon, authenticated/i);
  });
  it('Paket nur mit Linien und Kennzahlen', () => {
    expect(code).toContain("<>array['laid','metrics','search','version']");
    expect(code).toContain("<>array['articlesFound','articlesTotal','breaks','deviationAvgM','distanceM','durationS']");
  });
  it('Rolle und Einstellung ändert nur die Inhaberin', () => {
    expect(code).toMatch(/owner_id=u and ended_at is null\) or target=u then/);
    expect(code).toMatch(/set share_outside=\(p_request->>'value'\)::boolean where id=g and owner_id=u/);
  });
  it('Löschen 30 Tage nach dem letzten Teilen; Fährten weiter nach 7 Tagen', () => {
    expect(code).toContain("interval '30 days'");
    expect(code).toContain("interval '7 days'");
  });
  it('Endpunkt nur für angemeldete Personen', () => {
    expect(topLevel).toMatch(/grant execute on function public\.training_group_eval_v1\(text, jsonb\) to authenticated;/);
    expect(topLevel).not.toMatch(/grant execute on function public\.training_private_evaluation_\w+\([^)]*\) to [^;]*authenticated/);
  });
});
