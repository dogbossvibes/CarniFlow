/**
 * T-182 — Schutz der Abo- und Berechtigungsspalten (subscriptions, user_capabilities, profiles).
 *
 * Teil 1: statische Prüfung der Migration (Trigger, Rollenbedingung, keine Datenänderung).
 * Teil 2: Semantik-Modell der Trigger-Rümpfe gegen Angriffs- und Legit-Szenarien,
 *         analog zum DB-Test supabase/local/guard_entitlement_columns_test.sql
 *         (dort gegen echtes Postgres 17.6 ausgeführt: 9 Angriffe blockiert, 7 Legit-Fälle ok).
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261109120000_guard_entitlement_columns.sql', 'utf8');
const code = sql.replace(/--.*$/gm, '');

describe('Migration — Struktur', () => {
  it.each([
    ['subscriptions', 'anyvo_guard_subscriptions'],
    ['user_capabilities', 'anyvo_guard_user_capabilities'],
    ['profiles', 'anyvo_guard_profile_plan'],
  ])('BEFORE INSERT OR UPDATE Trigger auf %s', (table, fn) => {
    expect(code).toMatch(new RegExp(`create trigger trg_${fn.replace('anyvo_guard_', 'anyvo_guard_')}\\s+before insert or update on public\\.${table}\\s+for each row execute function public\\.${fn}\\(\\);`));
    expect(code).toContain(`drop trigger if exists trg_${fn} on public.${table};`);
  });
  it('greift nur für Client-Rollen; Server (service_role, SECURITY DEFINER) bleibt frei', () => {
    expect(code).toContain("select current_user in ('authenticated', 'anon')");
    expect((code.match(/if not public\.anyvo_is_client_role\(\) then return new; end if;/g) ?? []).length).toBe(3);
  });
  it('blockiert mit eindeutigem Fehler', () => {
    expect((code.match(/errcode = '42501', message = 'ENTITLEMENT_SERVER_ONLY'/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it('keine Datenänderung, keine Grant-/Policy-Änderung', () => {
    expect(code).not.toMatch(/\bupdate public\.|\binsert into\b|\bdelete from\b|\bgrant\b|\brevoke\b|\bcreate policy\b|\balter table\b/i);
  });
});

// ── Semantik-Modell ───────────────────────────────────────────────────────
type Role = 'authenticated' | 'anon' | 'service_role' | 'postgres';
type Sub = { plan: string | null; status: string | null; trial_ends_at: string | null; current_period_ends_at: string | null; expires_at?: string | null; product_id?: string | null };
const PAID = ['active', 'founder_active', 'trainer'];
const grants = (s: Sub) => PAID.includes(s.plan ?? '') || s.status === 'trialing';
const client = (r: Role) => r === 'authenticated' || r === 'anon';

function guardSubs(role: Role, op: 'INSERT' | 'UPDATE', n: Sub, o?: Sub): boolean {
  if (!client(role)) return true;
  if (op === 'INSERT') return !(grants(n) || n.trial_ends_at !== null);
  if (grants(n)) {
    if (!o || !grants(o)) return false;
    const keys: (keyof Sub)[] = ['plan', 'status', 'trial_ends_at', 'current_period_ends_at', 'expires_at', 'product_id'];
    return keys.every((k) => (n[k] ?? null) === (o[k] ?? null));
  }
  return !(n.trial_ends_at !== (o?.trial_ends_at ?? null) && n.trial_ends_at !== null);
}
function guardCaps(role: Role, op: 'INSERT' | 'UPDATE', n: { pro: boolean; trainer: boolean }, o?: { pro: boolean; trainer: boolean }): boolean {
  if (!client(role)) return true;
  const up = op === 'UPDATE';
  return !((n.pro && !(up && o?.pro)) || (n.trainer && !(up && o?.trainer)));
}

const newbie: Sub = { plan: 'newbie', status: 'active', trial_ends_at: null, current_period_ends_at: null };
const paid: Sub = { plan: 'active', status: 'active', trial_ends_at: null, current_period_ends_at: '2026-12-01', expires_at: '2026-12-01', product_id: 'anyvo_active_monthly_10' };

describe('Semantik — Angriffe werden blockiert', () => {
  it('Client setzt pro_member/trainer_module', () => {
    expect(guardCaps('authenticated', 'UPDATE', { pro: true, trainer: false }, { pro: false, trainer: false })).toBe(false);
    expect(guardCaps('authenticated', 'UPDATE', { pro: false, trainer: true }, { pro: false, trainer: false })).toBe(false);
    expect(guardCaps('authenticated', 'INSERT', { pro: true, trainer: false })).toBe(false);
  });
  it('Client setzt bezahlten Plan, Selbst-Trial oder verlängert', () => {
    expect(guardSubs('authenticated', 'UPDATE', { ...newbie, plan: 'active' }, newbie)).toBe(false);
    expect(guardSubs('authenticated', 'UPDATE', { ...newbie, status: 'trialing', trial_ends_at: '2026-12-01' }, newbie)).toBe(false);
    expect(guardSubs('authenticated', 'INSERT', paid)).toBe(false);
    expect(guardSubs('authenticated', 'UPDATE', { ...paid, current_period_ends_at: '2036-01-01' }, paid)).toBe(false);
  });
});

describe('Semantik — legitime Pfade bleiben erlaubt', () => {
  it('NEWBIE-Aktivierung und Marker durch den Client', () => {
    expect(guardSubs('authenticated', 'INSERT', newbie)).toBe(true);
    expect(guardSubs('authenticated', 'UPDATE', newbie, newbie)).toBe(true);
    expect(guardCaps('authenticated', 'INSERT', { pro: false, trainer: false })).toBe(true);
  });
  it('bezahlter Nutzer ändert nur Marker; Herabstufung erlaubt', () => {
    expect(guardSubs('authenticated', 'UPDATE', { ...paid }, paid)).toBe(true);
    expect(guardCaps('authenticated', 'UPDATE', { pro: false, trainer: false }, { pro: true, trainer: false })).toBe(true);
    expect(guardSubs('authenticated', 'UPDATE', newbie, paid)).toBe(true);
  });
  it('Server-Rollen sind nicht betroffen', () => {
    expect(guardSubs('service_role', 'UPDATE', paid, newbie)).toBe(true);
    expect(guardSubs('postgres', 'INSERT', paid)).toBe(true);
    expect(guardCaps('service_role', 'UPDATE', { pro: true, trainer: true }, { pro: false, trainer: false })).toBe(true);
  });
});
