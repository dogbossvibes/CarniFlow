import { readFileSync } from 'fs';

// Statischer Vertrag der Gruppen-Mantrailing-Migration (Spec 02, PR B2): rein additiv und
// gegenüber der bisherigen Fassung (20261116230000) nur an den vorgesehenen Stellen geändert.
const strip = (sql: string) => sql.replace(/--.*$/gm, '');
const sql = strip(readFileSync('supabase/migrations/20261125200000_training_group_mantrail.sql', 'utf8'));
const before = strip(readFileSync('supabase/migrations/20261116230000_training_group_own_track.sql', 'utf8'));
const fn = (src: string) => { const start = src.indexOf('create or replace function public.training_group_tracks_v1'); return src.slice(start, src.indexOf('end $function$;', start)); };
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
        || line.startsWith("perform public.training_private_request(p_request,array['sessionId','trackId','handlerParticipationId','blind'])")
        || line.startsWith("or (select coalesce(array_agg(k order by k),'{}') from jsonb_object_keys(p_request) k)<>array['package','trackId']")
        || line.startsWith("update public.training_private_tracks set status='lying'")
        || line.startsWith("body:=jsonb_build_object('track',public.training_private_track_json(t,u),'package',tv.package);")) continue;
      expect(now).toContain(line);
    }
  });
  it('Trails nur für Apps mit includeMantrail; assign nur mit kind=mantrail', () => {
    const body = fn(sql);
    expect(body).toContain("and (mantrail_too or x.kind='track')");
    expect(body).toContain(`p_request->'kind' is distinct from '"mantrail"'::jsonb`);
    expect(body).toContain('values(t,s,u,hpart.user_id,hp,hpart.dog_id,(p_request->>\'blind\')::boolean,p_request,k);');
  });
  it('Trail-Angaben: nur bei Trails, nur bekannte Schlüssel, klein, nur an Leger:in/Hundeführer:in', () => {
    const body = fn(sql);
    expect(body).toContain("not in (array['package','trackId'],array['mantrail','package','trackId'])");
    expect(body).toContain("if tv.kind<>'mantrail' then raise exception");
    expect(body).toContain("perform public.training_private_mantrail_details(p_request->'mantrail');");
    expect(sql).toContain("octet_length(d::text)>4096");
    expect(sql).toContain("('version','scentArticle','scentArticleLabel','scentContaminated','environment','surface','negative','windLay')");
    expect(sql).toContain('revoke all on function public.training_private_mantrail_details(jsonb) from public, anon, authenticated;');
    // 'fetch' bleibt auf Leger:in und Hundeführer:in beschränkt; die Angaben hängen nur dort an.
    const fetch = body.slice(body.indexOf("when 'fetch' then"), body.indexOf("when 'search_start'"));
    expect(fetch).toContain('u not in(tv.layer_id,tv.handler_id)');
    expect(fetch).toContain("jsonb_build_object('mantrail',tv.mantrail_details)");
  });
});
