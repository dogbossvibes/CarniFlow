/**
 * Gruppentraining Stufe 2b — statische Prüfung. Verhalten gegen PostgreSQL:
 * supabase/local/training_group_stage2b_cases.sql (42 Fälle, Paket im Übergabe-Format).
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261116100000_training_group_stage2b.sql', 'utf8');
const code = sql.replace(/^--.*$/gm, '');
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');

describe('Stufe 2b', () => {
  it('ändert nur Funktionen, keine Daten und keine Rechte', () => {
    expect(topLevel).not.toMatch(/\b(create table|alter table|drop |truncate|delete from|update public\.|insert into|grant |revoke )/i);
    expect((code.match(/create or replace function public\./gi) ?? []).length).toBe(2);
  });
  it('Paket im Format der Fährten-Übergabe, höchstens 4 MB', () => {
    expect(code).toContain("<>array['distanceM','durationSeconds','finishedAtMs','manualAngleGeometry','markers','points','segments','startedAtMs','version']");
    expect(code).toContain('octet_length(pkg::text)>4000000');
    expect(code).toContain('octet_length(p_request::text)>4200000');
  });
  it('Verlauf weiterhin nur für Leger:in und Hundeführer:in', () => {
    expect(code).toContain("if not found or u not in(tv.layer_id,tv.handler_id) or tv.status not in('lying','searching','searched') then");
  });
});
