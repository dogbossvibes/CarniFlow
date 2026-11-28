import { readFileSync } from 'fs';
import { NEWBIE_QUOTA, quotaLimit } from '@/features/subscription/plans';

// Statischer Vertrag der Mantrailing-Kontingent-Migration (Spec 02, PR B1): rein additiv,
// bestehende Arten bleiben erlaubt, keine Daten werden verändert oder gelöscht.
const sql = readFileSync('supabase/migrations/20261125180000_newbie_mantrail_quota.sql', 'utf8');
const body = sql.replace(/--.*$/gm, '');

describe('Migration newbie_mantrail_quota', () => {
  it('ändert keine Daten: kein delete/update/truncate, keine Tabelle gelöscht', () => {
    expect(body).not.toMatch(/\b(delete\s+from|update\s+\w|truncate|drop\s+table|drop\s+function)\b/i);
    // Einziges insert ist der unveränderte Claim in der Funktion.
    expect(body.match(/insert into/gi)).toHaveLength(1);
  });
  it('erweitert die erlaubten Arten nur um mantrail', () => {
    expect(body).toContain("check (kind in ('training', 'track', 'mantrail'))");
    expect(body).toContain("if p_kind not in ('training','track','mantrail')");
  });
  it('Limits: dog 1, training 2, track 1, mantrail 1 – wie im Client', () => {
    expect(body).toContain("when 'dog' then 1 when 'training' then 2 when 'track' then 1 when 'mantrail' then 1 else 0");
    expect(NEWBIE_QUOTA).toEqual({ dog: 1, training: 2, track: 1, mantrail: 1 });
    expect(quotaLimit(true, 'mantrail')).toBe(Infinity);
  });
  it('Premium bleibt unbegrenzt, Sperre und Idempotenz wie bisher', () => {
    expect(body).toContain('if is_pro_member(v_uid) then return query select true, 0, 2147483647');
    expect(body).toContain("pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_kind))");
    expect(body).toContain('kind = p_kind and ref_id = p_ref');
    expect(body).toMatch(/security definer set search_path = public/);
    expect(body).not.toMatch(/to anon|to public/i);
  });
});
