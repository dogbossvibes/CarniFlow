/**
 * Gruppentraining Stufe 1 — statische Prüfung der Migration.
 * Verhalten gegen PostgreSQL geprüft mit supabase/local/training_group_stage1_cases.sql.
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261112140000_training_group_stage1.sql', 'utf8');
const code = sql.replace(/^--.*$/gm, '');
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');
const body = (name: string) => {
  const start = code.toLowerCase().indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('$function$;', start));
};

describe('Stufe 1 — Daten', () => {
  it('ist rein additiv', () => {
    expect(topLevel).not.toMatch(/\b(drop table|drop column|truncate (table )?public\.|delete from public\.|update public\.)/i);
    expect(topLevel).toContain("alter table public.training_private_members add column if not exists role text not null default 'member';");
  });
  it('neue Tabellen: RLS an, kein Zugriff für App-Rollen', () => {
    for (const t of ['training_private_join_codes', 'training_private_join_requests', 'training_private_code_attempts']) {
      expect(topLevel).toContain(`create table if not exists public.${t} (`);
      expect(topLevel).toContain(`alter table public.${t} enable row level security;`);
    }
    expect(topLevel).toMatch(/revoke all on table public\.training_private_join_codes, public\.training_private_join_requests,\s+public\.training_private_code_attempts from public, anon, authenticated;/);
    expect(topLevel).not.toMatch(/create policy/i);
  });
  it('speichert Codes nur als Prüfsumme', () => {
    expect(topLevel).toContain('code_hash text not null');
    expect(topLevel).not.toMatch(/\bcode text\b/);
  });
});

describe('Stufe 1 — Regeln auf dem Server', () => {
  it('Gruppe erstellen braucht ACTIVE', () => {
    expect(body('training_group_v1')).toMatch(/else\s+perform public\.gd_active\(\);\s+if \(select count\(\*\) from public\.training_private_groups where owner_id=u\)>=100/);
  });
  it('Gruppentraining starten: nur Verwaltende mit ACTIVE', () => {
    expect(body('training_group_session_v1')).toMatch(/if not public\.training_private_manager\(g,u\) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;\s+perform public\.gd_active\(\);/);
  });
  it('Rollen vergibt nur die Inhaberin bzw. der Inhaber', () => {
    expect(body('training_group_join_v1')).toContain("if gv.owner_id is distinct from u or gv.ended_at is not null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;");
  });
  it('Mitgliederliste bleibt für ältere Apps lesbar', () => {
    expect(body('training_private_group_json')).toContain("'role',case when m.user_id=v.owner_id then 'owner' else 'member' end,'isOrganizer',");
  });
  it('Ratenbegrenzung wird nicht durch Fehler zurückgerollt', () => {
    const join = body('training_group_join_v1');
    expect(join).toContain("insert into public.training_private_code_attempts(user_id) values(u);");
    expect(join).toContain('if not found then return invalid; end if;');
  });
});

describe('Stufe 1 — Rechte', () => {
  it('nur die neue RPC ist für angemeldete Personen aufrufbar', () => {
    expect(topLevel).toContain('grant execute on function public.training_group_join_v1(text, jsonb) to authenticated;');
    expect(topLevel).not.toMatch(/training_private_manager\(uuid, uuid\) to authenticated/);
    expect(topLevel).not.toMatch(/training_private_join_request_json\(uuid\) to authenticated/);
    expect(topLevel).not.toMatch(/to anon;/);
  });
});
