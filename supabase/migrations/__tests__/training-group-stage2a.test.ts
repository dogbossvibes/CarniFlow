/**
 * Gruppentraining Stufe 2a — statische Prüfung der Migration.
 * Verhalten gegen PostgreSQL geprüft mit supabase/local/training_group_stage2a_cases.sql.
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261113090000_training_group_stage2a.sql', 'utf8');
const code = sql.replace(/^--.*$/gm, '');
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');
const body = (name: string) => {
  const start = code.toLowerCase().indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('$function$;', start));
};

describe('Stufe 2a — Daten', () => {
  it('ist additiv: nur ein Index wird ersetzt, keine Daten gelöscht', () => {
    expect(topLevel).not.toMatch(/\b(drop table|drop column|truncate (table )?public\.|delete from public\.|update public\.)/i);
    expect(topLevel).toContain('drop index if exists public.training_private_one_active_participant;');
    expect(topLevel).toMatch(/create unique index if not exists training_private_one_active_dog\s+on public\.training_private_participants using btree \(session_id, user_id, dog_id\) where \(left_at is null\);/);
  });
  it('Fährten-Tabelle: RLS an, kein Zugriff für App-Rollen', () => {
    expect(topLevel).toContain('create table if not exists public.training_private_tracks (');
    expect(topLevel).toContain('alter table public.training_private_tracks enable row level security;');
    expect(topLevel).toContain('revoke all on table public.training_private_tracks from public, anon, authenticated;');
    expect(topLevel).not.toMatch(/create policy/i);
  });
});

describe('Stufe 2a — Sichtbarkeit', () => {
  it('Liste liefert nie das Paket', () => {
    const json = body('training_private_track_json');
    expect(json).not.toMatch(/'package'/);
    expect(json).toContain("'area',case when x.status in('lying','searching','searched') then x.area else null end");
    expect(json).toContain("'distanceM',case when viewer in(x.layer_id,x.handler_id) then x.distance_m else null end");
  });
  it('Verlauf nur für Leger:in und Hundeführer:in', () => {
    expect(body('training_group_tracks_v1')).toContain("if not found or u not in(tv.layer_id,tv.handler_id) or tv.status not in('lying','searching','searched') then");
  });
  it('Fläche ist grob: Mittelpunkt auf 4 Stellen, Radius in 25-m-Schritten, mindestens 50 m', () => {
    const area = body('training_private_track_area');
    expect(area).toContain("'centerLat',round(lat,4)");
    expect(area).toContain("greatest(50,(ceil((half+25)/25)*25)::integer)");
  });
});

describe('Stufe 2a — Abo-Regel', () => {
  it('Standort teilen und Verleitungen in der Gruppe ohne ACTIVE', () => {
    expect(body('training_group_live_v1')).not.toContain('tracking_private_active_initiator');
    expect(body('training_group_distraction_v1')).not.toContain('gd_active');
  });
  it('Gruppentraining starten bleibt bei ACTIVE', () => {
    expect(body('training_group_session_v1')).toMatch(/training_private_manager\(g,u\)[\s\S]*perform public\.gd_active\(\);/);
  });
});

describe('Stufe 2a — Löschung und Rechte', () => {
  it('Server-Kopie 7 Tage nach Ende löschen, stündlich', () => {
    expect(body('training_private_tracks_purge')).toContain("<clock_timestamp()-interval '7 days'");
    expect(topLevel).toContain("if not exists (select 1 from cron.job where jobname = 'anyvo-training-tracks-purge-v1') then");
  });
  it('nur die Fährten-RPC ist für Angemeldete aufrufbar', () => {
    expect(topLevel).toContain('grant execute on function public.training_group_tracks_v1(text, jsonb) to authenticated;');
    expect((topLevel.match(/to authenticated;/g) ?? []).length).toBe(1);
    expect(topLevel).not.toMatch(/to anon;/);
  });
});
