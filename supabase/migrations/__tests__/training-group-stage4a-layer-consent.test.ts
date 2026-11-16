/**
 * Gruppentraining Stufe 4a, Nachtrag (Issue #146) — statische Prüfung. Verhalten gegen PostgreSQL:
 * supabase/local/training_group_stage4a_layer_consent_cases.sql.
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261116230000_training_group_stage4a_layer_consent.sql', 'utf8');
const code = sql.replace(/^--.*$/gm, '');
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');

describe('Zustimmung der Leger:in', () => {
  it('nur additiv: keine Daten löschen oder umschreiben', () => {
    expect(topLevel).not.toMatch(/\b(drop table|truncate|delete from|update public\.|insert into|drop column|alter column)/i);
  });
  it('Zustimmung ohne Standardwert (nicht gefragt = nein), Markierung standardmässig aus', () => {
    expect(code).toMatch(/add column if not exists share_laid_line boolean;/i);
    expect(code).toMatch(/add column if not exists no_evaluation boolean not null default false/i);
  });
  it('gelegte Linie nur für Hundeführer:in, Leger:in oder mit Zustimmung', () => {
    expect(code).toContain("case when full_package and (u in (e.handler_id,e.layer_id) or public.training_private_laid_consent(e.group_id,e.layer_id))");
  });
  it('Markierung setzt nur die Leger:in und nie zurück', () => {
    expect(code).toContain('set no_evaluation=true where id=t and layer_id=u');
    expect(code).not.toMatch(/no_evaluation=false/);
  });
  it('markierte Fährten sind nicht teilbar', () => {
    expect(code).toContain("if tv.status<>'searched' or tv.no_evaluation then");
  });
  it('Mitteilung darf das Teilen nie verhindern und nennt keine Orte', () => {
    expect(code).toMatch(/group_notify_enqueue\(tv\.layer_id,u,'evaluation_shared'[\s\S]*?exception when others then null; end;/);
    const text = /create or replace function public\.group_notify_text[\s\S]*?\$function\$[\s\S]*?\$function\$/i.exec(code)?.[0] ?? '';
    expect(text).not.toMatch(/lat|lng|polygon|center/i);
  });
  it('Zustimmungs-Helfer für App-Rollen geschlossen', () => {
    expect(topLevel).toMatch(/revoke all on function public\.training_private_laid_consent\(uuid, uuid\) from public, anon, authenticated/i);
  });
});
