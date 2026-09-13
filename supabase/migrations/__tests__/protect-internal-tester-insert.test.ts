/**
 * Internal-Tester-Authority — Härtung INSERT+UPDATE.
 *
 * Teil 1: statische Prüfung der Migration (Struktur, TG_OP, kein OLD im INSERT-Zweig,
 *         Trigger BEFORE INSERT OR UPDATE, service_role-Semantik unverändert).
 * Teil 2: Semantik-Modell — der plpgsql-Rumpf wird 1:1 als reine Funktion
 *         nachgebildet und gegen die Negativ-/Positivszenarien 1–10 geprüft.
 *         (Kein Live-DB-Test in dieser Suite: es gibt hier keine Staging-DB; das
 *         Modell folgt exakt dem SQL-Text, der oben mitgeprüft wird.)
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20260913200000_protect_internal_tester_insert.sql', 'utf8');
const body = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;') + 3);
const insertBranch = body.slice(body.indexOf("if tg_op = 'INSERT'"), body.indexOf('else'));
const updateBranch = body.slice(body.indexOf('else'), body.indexOf('end if;\n  end if;'));

describe('Migration — Struktur', () => {
  it('erweitert dieselbe Funktion + denselben Trigger (keine zweite Authority)', () => {
    expect(sql).toContain('create or replace function public.protect_internal_tester_fields()');
    expect(sql).toContain('drop trigger if exists trg_protect_internal_tester on public.profiles;');
    expect(sql).toMatch(/create trigger trg_protect_internal_tester\s+before insert or update on public\.profiles\s+for each row\s+execute function public\.protect_internal_tester_fields\(\);/);
    expect((sql.match(/create trigger/g) ?? []).length).toBe(1);
    expect((sql.match(/create or replace function/g) ?? []).length).toBe(1);
  });
  it('SECURITY DEFINER, leerer search_path, ausschliesslich auth.role() = service_role als Privileg', () => {
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toContain("if auth.role() is distinct from 'service_role' then");
    expect(body).not.toMatch(/current_user|session_user|pg_has_role|postgres/);
  });
  it('INSERT-Zweig: false/null, KEIN OLD; UPDATE-Zweig: OLD-Werte', () => {
    expect(insertBranch).toContain('new.is_internal_tester := false;');
    expect(insertBranch).toContain('new.tester_level       := null;');
    expect(insertBranch).not.toMatch(/\bold\./);
    expect(updateBranch).toContain('new.is_internal_tester := old.is_internal_tester;');
    expect(updateBranch).toContain('new.tester_level       := old.tester_level;');
  });
  it('kein Datenupdate, keine Grant-/Policy-Änderung, keine Enum-Änderung', () => {
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bupdate public\.profiles\b|\binsert into\b|\bgrant\b|\brevoke\b|\bcreate policy\b|\balter type\b|\balter table\b/i);
  });
});

// ── Semantik-Modell des Trigger-Rumpfs ─────────────────────────────────────
type Row = { id: string; full_name?: string; is_internal_tester: boolean; tester_level: string | null };
type Ctx = { role: 'authenticated' | 'anon' | 'service_role' | null };   // auth.role()
function trigger(op: 'INSERT' | 'UPDATE', ctx: Ctx, next: Row, old?: Row): Row {
  const n = { ...next };
  if (ctx.role !== 'service_role') {            // auth.role() is distinct from 'service_role'
    if (op === 'INSERT') { n.is_internal_tester = false; n.tester_level = null; }
    else { n.is_internal_tester = old!.is_internal_tester; n.tester_level = old!.tester_level; }
  }
  return n;
}
// RLS-Modell (Production): INSERT/UPDATE nur authenticated mit id = auth.uid(); anon ohne Policy; service_role bypasst RLS.
function rlsAllows(op: 'INSERT' | 'UPDATE', ctx: Ctx, uid: string | null, rowId: string): boolean {
  if (ctx.role === 'service_role') return true;
  if (ctx.role !== 'authenticated') return false;
  return uid === rowId;
}
// Tabelle: Map id → Row; upsert = INSERT … ON CONFLICT (id) DO UPDATE
function apply(table: Map<string, Row>, op: 'INSERT' | 'UPDATE' | 'UPSERT', ctx: Ctx, uid: string | null, row: Row): 'ok' | 'rls_denied' | 'conflict' {
  const exists = table.get(row.id);
  if (op === 'UPSERT') op = exists ? 'UPDATE' : 'INSERT';
  if (!rlsAllows(op, ctx, uid, row.id)) return 'rls_denied';
  if (op === 'INSERT') { if (exists) return 'conflict'; table.set(row.id, trigger('INSERT', ctx, row)); return 'ok'; }
  table.set(row.id, trigger('UPDATE', ctx, row, exists!)); return 'ok';
}
const AUTH: Ctx = { role: 'authenticated' }, ANON: Ctx = { role: 'anon' }, SVC: Ctx = { role: 'service_role' }, EDITOR: Ctx = { role: null };

describe('Negativ-/Positivtests (Semantik-Modell)', () => {
  it('1. authenticated INSERT eigene id mit true/developer → gespeichert false/null', () => {
    const t = new Map<string, Row>();
    expect(apply(t, 'INSERT', AUTH, 'u1', { id: 'u1', is_internal_tester: true, tester_level: 'developer' })).toBe('ok');
    expect(t.get('u1')).toMatchObject({ is_internal_tester: false, tester_level: null });
  });
  it('2. authenticated INSERT mit tester_level=admin → nicht privilegiert', () => {
    const t = new Map<string, Row>();
    apply(t, 'INSERT', AUTH, 'u1', { id: 'u1', is_internal_tester: true, tester_level: 'admin' });
    expect(t.get('u1')).toMatchObject({ is_internal_tester: false, tester_level: null });
  });
  it('3. authenticated UPDATE false/null → true/developer bleibt beim alten Wert', () => {
    const t = new Map<string, Row>([['u1', { id: 'u1', is_internal_tester: false, tester_level: null }]]);
    expect(apply(t, 'UPDATE', AUTH, 'u1', { id: 'u1', is_internal_tester: true, tester_level: 'developer' })).toBe('ok');
    expect(t.get('u1')).toMatchObject({ is_internal_tester: false, tester_level: null });
  });
  it('4. freigeschalteter Tester kann die Felder selbst NICHT entfernen/ändern', () => {
    const t = new Map<string, Row>([['u1', { id: 'u1', is_internal_tester: true, tester_level: 'developer' }]]);
    apply(t, 'UPDATE', AUTH, 'u1', { id: 'u1', is_internal_tester: false, tester_level: null });
    expect(t.get('u1')).toMatchObject({ is_internal_tester: true, tester_level: 'developer' });
    apply(t, 'UPDATE', AUTH, 'u1', { id: 'u1', is_internal_tester: true, tester_level: 'admin' });
    expect(t.get('u1')).toMatchObject({ tester_level: 'developer' });
  });
  it('5. normales Profilfeld-UPDATE funktioniert weiterhin', () => {
    const t = new Map<string, Row>([['u1', { id: 'u1', full_name: 'A', is_internal_tester: false, tester_level: null }]]);
    expect(apply(t, 'UPDATE', AUTH, 'u1', { id: 'u1', full_name: 'B', is_internal_tester: false, tester_level: null })).toBe('ok');
    expect(t.get('u1')!.full_name).toBe('B');
  });
  it('6./7. service_role darf Testerwerte per INSERT und UPDATE setzen', () => {
    const t = new Map<string, Row>();
    apply(t, 'INSERT', SVC, null, { id: 'u2', is_internal_tester: true, tester_level: 'qa' });
    expect(t.get('u2')).toMatchObject({ is_internal_tester: true, tester_level: 'qa' });
    apply(t, 'UPDATE', SVC, null, { id: 'u2', is_internal_tester: true, tester_level: 'developer' });
    expect(t.get('u2')).toMatchObject({ tester_level: 'developer' });
    apply(t, 'UPDATE', SVC, null, { id: 'u2', is_internal_tester: false, tester_level: null });
    expect(t.get('u2')).toMatchObject({ is_internal_tester: false, tester_level: null });
  });
  it('8. on_auth_user_created (INSERT ohne JWT, ohne Testerfelder) → Profil wird angelegt, Defaults false/null', () => {
    const t = new Map<string, Row>();
    // handle_new_user: INSERT (id, full_name, role) — Testerfelder nicht gesetzt → Spalten-Defaults
    expect(apply(t, 'INSERT', { role: 'service_role' }, null, { id: 'u3', full_name: '', is_internal_tester: false, tester_level: null })).toBe('ok');
    const t2 = new Map<string, Row>();
    expect(trigger('INSERT', EDITOR, { id: 'u3', full_name: '', is_internal_tester: false, tester_level: null })).toMatchObject({ is_internal_tester: false, tester_level: null });
    expect(t2.size).toBe(0);
  });
  it('9. UPSERT kann den Schutz nicht umgehen (weder INSERT- noch UPDATE-Pfad)', () => {
    const t = new Map<string, Row>();
    apply(t, 'UPSERT', AUTH, 'u1', { id: 'u1', is_internal_tester: true, tester_level: 'developer' });   // → INSERT-Pfad
    expect(t.get('u1')).toMatchObject({ is_internal_tester: false, tester_level: null });
    apply(t, 'UPSERT', AUTH, 'u1', { id: 'u1', is_internal_tester: true, tester_level: 'admin' });       // → UPDATE-Pfad
    expect(t.get('u1')).toMatchObject({ is_internal_tester: false, tester_level: null });
  });
  it('10. anon kann keine privilegierten Testerwerte erzeugen (RLS ohne anon-Policy; Trigger zusätzlich)', () => {
    const t = new Map<string, Row>();
    expect(apply(t, 'INSERT', ANON, null, { id: 'u9', is_internal_tester: true, tester_level: 'developer' })).toBe('rls_denied');
    expect(trigger('INSERT', ANON, { id: 'u9', is_internal_tester: true, tester_level: 'developer' })).toMatchObject({ is_internal_tester: false, tester_level: null });
  });
  it('SQL-Editor/postgres ohne JWT (auth.role() = null) ist NICHT privilegiert', () => {
    expect(trigger('UPDATE', EDITOR, { id: 'u1', is_internal_tester: true, tester_level: 'developer' }, { id: 'u1', is_internal_tester: false, tester_level: null }))
      .toMatchObject({ is_internal_tester: false, tester_level: null });
  });
});
