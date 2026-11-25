import { readFileSync } from 'fs';

// Statischer Vertrag der Gruppen-Mantrailing-Migration (Spec 02, PR B2): rein additiv und
// gegenüber der bisherigen Fassung (20261116230000) nur an den vorgesehenen Stellen geändert.
const strip = (sql: string) => sql.replace(/--.*$/gm, '');
const sql = strip(readFileSync('supabase/migrations/20261125200000_training_group_mantrail.sql', 'utf8'));
const before = strip(readFileSync('supabase/migrations/20261116230000_training_group_own_track.sql', 'utf8'));
const fn = (src: string) => src.slice(src.indexOf('create or replace function public.training_group_tracks_v1'), src.indexOf('end $function$;'));
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('Migration training_group_mantrail', () => {
  it('ändert keine Daten: nur neue Spalte mit Standard, kein delete/update/drop table', () => {
    expect(sql).toMatch(/add column if not exists kind text not null default 'track'/);
    expect(sql).toContain("check (kind in ('track', 'mantrail'))");
    expect(sql).not.toMatch(/\b(delete\s+from|truncate|drop\s+table|drop\s+function|drop\s+column)\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.training_private_tracks\s+set\s+kind/i);
  });
  it('Rechte bleiben: track_json nur service_role, RPC nur authenticated', () => {
    expect(sql).toContain('grant execute on function public.training_private_track_json(uuid, uuid) to service_role;');
    expect(sql).toContain('grant execute on function public.training_group_tracks_v1(text, jsonb) to authenticated;');
    expect(sql).not.toMatch(/to anon\b|grant execute[^;]*to public\b/i);
    expect(sql).toMatch(/security definer\s+set search_path to ''/);
  });
  it('alle bisherigen Prüfungen bleiben wortgleich erhalten', () => {
    const now = norm(fn(sql));
    for (const line of fn(before).split('\n').map(norm).filter(Boolean)) {
      if (line.startsWith('insert into public.training_private_tracks') || line.startsWith('values(t,s,u,hpart.user_id')
        || line.startsWith('pkg jsonb; h text;') || line.startsWith('from public.training_private_tracks x where x.session_id=s')
        || line.startsWith("perform public.training_private_request(p_request,array['sessionId','trackId','handlerParticipationId','blind'])")) continue;
      expect(now).toContain(line);
    }
  });
  it('Trails nur für Apps mit includeMantrail; assign nur mit kind=mantrail', () => {
    const body = fn(sql);
    expect(body).toContain("and (mantrail_too or x.kind='track')");
    expect(body).toContain(`p_request->'kind' is distinct from '"mantrail"'::jsonb`);
    expect(body).toContain('values(t,s,u,hpart.user_id,hp,hpart.dog_id,(p_request->>\'blind\')::boolean,p_request,k);');
  });
});
