import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261006180000_heat_cycle_schema_restore.sql', 'utf8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('heat cycle schema restore migration', () => {
  it('describes the three production tables additively and idempotently', () => {
    for (const t of ['dog_heat_cycles', 'dog_heat_phases', 'dog_heat_observations']) {
      expect(code).toContain(`create table if not exists public.${t}`);
      expect(code).toContain(`alter table public.${t}`);
    }
    expect(code).toContain('create index if not exists dog_heat_dog_start_idx');
    expect(code).toContain('create index if not exists idx_dog_heat_phases_cycle');
    expect(code).toContain('create index if not exists idx_dog_heat_obs_cycle');
    // Jede Policy wird vor dem Anlegen entfernt → erneuter Lauf (z. B. auf Production) ist ein No-op.
    expect(code.match(/drop policy if exists/g)).toHaveLength(4);
    expect(code.match(/create policy/g)).toHaveLength(4);
    expect(code).not.toMatch(/\bdrop table\b|\btruncate\b|\bdelete from\b/i);
  });

  it('adds status only when missing and backfills only in that case', () => {
    expect(code).toMatch(/table_schema = 'public' and table_name = 'dog_heat_cycles' and column_name = 'status'/);
    expect(code).toMatch(/add column status text not null default 'active'\s+constraint dog_heat_cycles_status_check check \(status in \('active', 'completed'\)\)/);
    const block = code.slice(code.indexOf('if not exists ('), code.indexOf('end if;'));
    expect(block).toContain("update public.dog_heat_cycles set status = 'completed'");
    expect(code.match(/update public\.dog_heat_cycles/g)).toHaveLength(1);
  });

  it('keeps the production column contract the client relies on', () => {
    expect(code).toMatch(/phase_type\s+text not null/);
    expect(code).toMatch(/heat_cycle_id uuid not null references public\.dog_heat_cycles\(id\) on delete cascade/);
    expect(code).toMatch(/date\s+date not null/);
    expect(code).toMatch(/type\s+text not null/);
    expect(code).toMatch(/owner_id\s+uuid not null references auth\.users\(id\) on delete cascade/);
    expect(code).toMatch(/dog_id\s+uuid not null references public\.dogs\(id\) on delete cascade/);
  });

  it('enforces RLS: owner-only writes, owner or accepted connection reads — never permissive', () => {
    expect(code.match(/enable row level security/g)).toHaveLength(3);
    for (const name of ['dog_heat_cycles_select', 'hp_select', 'ho_select', 'hp_insert', 'ho_insert', 'hp_update', 'ho_update', 'hp_delete', 'ho_delete']) {
      expect(code).toContain(`'${name}'`);
    }
    expect(code).toContain('for insert with check (owner_id = auth.uid())');
    expect(code).toContain('for update using (owner_id = auth.uid())');
    expect(code).toContain('for delete using (owner_id = auth.uid())');
    expect(code).toMatch(/c\.connected_user_id = auth\.uid\(\)\s+and c\.status = 'accepted'/);
    expect(code).not.toMatch(/with check \(\s*true\s*\)|using \(\s*true\s*\)/i);
    expect(code).not.toMatch(/\bgrant\b|security definer|to anon/i);
  });
});
