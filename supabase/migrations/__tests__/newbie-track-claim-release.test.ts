import { readFileSync } from 'fs';

// Statischer Vertrag der Migration: rein additiv, nur eigene, frische Fährten-Buchung
// ohne zugehörige Fährte, keine Trainings, keine Rechte für anon/public.
const sql = readFileSync('supabase/migrations/20261123200000_newbie_track_claim_release.sql', 'utf8');
const body = sql.replace(/--.*$/gm, '');

describe('Migration release_newbie_quota', () => {
  it('ist rein additiv: nur create or replace dieser Funktion, kein DROP/ALTER/TRUNCATE', () => {
    expect(body).toMatch(/create or replace function public\.release_newbie_quota\(p_kind text, p_ref text\)/);
    expect(body).not.toMatch(/\b(drop|alter|truncate|update|insert)\b/i);
    expect(body.match(/create or replace function/gi)).toHaveLength(1);
  });
  it('löscht nur eigene Fährten-Buchungen im laufenden Monat; ohne Fährte nur 24 h', () => {
    expect(body.match(/delete from newbie_quota_claims/gi)).toHaveLength(2);
    expect(body.match(/delete from/gi)).toHaveLength(2);
    for (const del of body.split('delete from').slice(1).map(x => x.slice(0, x.indexOf(';')))) {
      for (const cond of ['user_id = v_uid', 'kind = p_kind', 'ref_id = p_ref', 'period = v_period']) expect(del).toContain(cond);
    }
    const noTrack = body.slice(body.indexOf('  else\n'));
    expect(noTrack).toContain("created_at > now() - interval '24 hours'");
  });
  it('mit Fährte nur, wenn eigene Fährte und nie abgesucht (kein run, kein track_runs, nur lay-Punkte)', () => {
    const caseB = body.slice(body.indexOf('exists (select 1 from training_sessions where id = v_ref)'), body.indexOf('  else\n'));
    expect(caseB).toContain("s.owner_id = v_uid and s.type = 'track'");
    expect(caseB).toContain("s.track_data -> 'run' is null");
    expect(caseB).toContain('from track_runs r where r.session_id = v_ref');
    expect(caseB).toContain("coalesce(p.point_type, 'lay') <> 'lay'");
    expect(caseB.indexOf('track_runs')).toBeLessThan(caseB.indexOf('delete from'));
  });
  it('nur Fährten, nur angemeldet, nie wenn eine Fährte unter der ID existiert', () => {
    expect(body).toContain("p_kind is distinct from 'track'");
    expect(body).toContain('v_uid is null');
    expect(body).toContain('v_ref := p_ref::uuid');
    expect(body.indexOf('from training_sessions where id = v_ref')).toBeLessThan(body.indexOf('delete from'));
  });
  it('dieselbe Sperre wie claim_newbie_quota; Rechte nur für authenticated', () => {
    expect(body).toContain("pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_kind))");
    expect(body).toContain('revoke all on function public.release_newbie_quota(text, text) from public;');
    expect(body).toContain('revoke all on function public.release_newbie_quota(text, text) from anon;');
    expect(body).toContain('grant execute on function public.release_newbie_quota(text, text) to authenticated;');
    expect(body).toContain('security definer set search_path = public');
  });
});
