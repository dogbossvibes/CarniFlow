/**
 * Gruppentraining Stufe 3 — statische Prüfung. Verhalten gegen PostgreSQL:
 * supabase/local/training_group_stage3_cases.sql (Mitteilungen, Einstellungen, kantige Fläche).
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261116170000_training_group_stage3.sql', 'utf8');
const code = sql.replace(/^--.*$/gm, '');
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');

describe('Stufe 3', () => {
  it('löscht und verändert keine bestehenden Daten', () => {
    expect(topLevel).not.toMatch(/\b(drop table|truncate|alter table public\.training_private_\w+ drop|delete from public\.training_private)/i);
    expect(topLevel).not.toMatch(/\bupdate public\.training_private/i);
  });
  it('neue Tabellen sind für App-Rollen geschlossen', () => {
    for (const table of ['group_notify_settings', 'group_notify_outbox']) {
      expect(topLevel).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(topLevel).toMatch(new RegExp(`revoke all on table [^;]*public\\.${table}[^;]* from [^;]*authenticated`, 'i'));
    }
  });
  it('Standard: Gruppentraining gestartet ist aus, der Rest an', () => {
    expect(code).toMatch(/training_started boolean not null default false/i);
    expect(code).toMatch(/track_ready boolean not null default true/i);
  });
  it('Mitteilungen enthalten keine Orte', () => {
    const text = /create or replace function public\.group_notify_text[\s\S]*?\$function\$[\s\S]*?\$function\$/i.exec(code)?.[0] ?? '';
    expect(text).not.toMatch(/lat|lng|polygon|center/i);
  });
  it('Trigger lassen Gruppenaktionen nie scheitern', () => {
    expect((code.match(/exception when others then return null;/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('Versand nur für service_role', () => {
    expect(topLevel).toMatch(/grant execute on function public\.group_notify_send\(\) to service_role/i);
    expect(topLevel).not.toMatch(/grant execute on function public\.group_notify_send\(\) to [^;]*authenticated/i);
  });
  it('Fläche wird kantig (Rechteck) und auf ein Raster gerundet', () => {
    expect(code).toContain("'polygon'");
    expect(code).toMatch(/0\.0005/);
  });
});
