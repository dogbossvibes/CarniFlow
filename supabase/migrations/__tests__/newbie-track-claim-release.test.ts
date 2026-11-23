import { readFileSync } from 'fs';

// Statischer Vertrag der Migration: rein additiv, nur eigene, frische Fährten-Buchung
// ohne zugehörige Fährte, keine Trainings, keine Rechte für anon/public.
const sql = readFileSync('supabase/migrations/20261123200000_newbie_track_claim_release.sql', 'utf8');
const body = sql.replace(/--.*$/gm, '');

describe('Migration release_newbie_quota', () => {
  it('ist rein additiv: nur create or replace dieser Funktion, kein DROP/ALTER/TRUNCATE', () => {
    expect(body).toMatch(/create or replace function public\.release_newbie_quota\(p_kind text, p_ref text\)/);
    expect(body).not.toMatch(/\b(drop|alter|truncate|update)\b/i);
    expect(body.match(/create or replace function/gi)).toHaveLength(1);
  });
  it('löscht nur in newbie_quota_claims und nur mit allen Bedingungen', () => {
    expect(body.match(/delete from/gi)).toHaveLength(1);
    const del = body.slice(body.indexOf('delete from'), body.indexOf('get diagnostics'));
    expect(del).toContain('newbie_quota_claims');
    for (const cond of ['user_id = v_uid', 'kind = p_kind', 'ref_id = p_ref', 'period = v_period', "created_at > now() - interval '24 hours'"]) {
      expect(del).toContain(cond);
    }
  });
  it('nur Fährten, nur angemeldet, nie wenn eine Fährte unter der ID existiert', () => {
    expect(body).toContain("p_kind is distinct from 'track'");
    expect(body).toContain('v_uid is null');
    expect(body.indexOf('from training_sessions where id::text = p_ref')).toBeLessThan(body.indexOf('delete from'));
  });
  it('dieselbe Sperre wie claim_newbie_quota; Rechte nur für authenticated', () => {
    expect(body).toContain("pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_kind))");
    expect(body).toContain('revoke all on function public.release_newbie_quota(text, text) from public;');
    expect(body).toContain('revoke all on function public.release_newbie_quota(text, text) from anon;');
    expect(body).toContain('grant execute on function public.release_newbie_quota(text, text) to authenticated;');
    expect(body).toContain('security definer set search_path = public');
  });
});
