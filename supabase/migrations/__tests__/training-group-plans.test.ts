import { readFileSync } from 'fs';

// Statischer Vertrag der Vereinsmodus-Migration (Spec 04, PR A). Die Wirkung prüfen die
// lokalen SQL-Fälle supabase/local/training_group_plans_cases.sql (Docker nötig).
const sql = readFileSync('supabase/migrations/20261126120000_training_group_plans.sql', 'utf8').replace(/--.*$/gm, '');
const fn = sql.slice(sql.indexOf('create or replace function public.training_group_plan_v1'), sql.indexOf('reset check_function_bodies;'));
const branch = (name: string) => { const i = fn.indexOf(`when '${name}'`); return fn.slice(i, fn.indexOf("\n when '", i + 5)); };

describe('Migration training_group_plans', () => {
  it('nur neue Tabellen, nichts Bestehendes geändert oder gelöscht', () => {
    expect(sql).not.toMatch(/\b(drop\s+table|truncate|delete\s+from|alter\s+table\s+public\.(?!training_private_plan))/i);
    expect(sql.match(/create table if not exists public\.(\w+)/g)).toEqual([
      'create table if not exists public.training_private_plans', 'create table if not exists public.training_private_plan_entries']);
  });
  it('für die App gesperrt: RLS an, keine Tabellenrechte, nur die Schnittstelle aufrufbar', () => {
    expect(sql).toContain('alter table public.training_private_plans enable row level security;');
    expect(sql).toContain('alter table public.training_private_plan_entries enable row level security;');
    expect(sql).toContain('revoke all on table public.training_private_plans, public.training_private_plan_entries from public, anon, authenticated;');
    expect(sql.match(/grant execute on function [^;]+ to authenticated;/g)).toEqual(['grant execute on function public.training_group_plan_v1(text, jsonb) to authenticated;']);
    expect(sql).not.toMatch(/to anon\b|grant [^;]* to public\b/i);
    expect(fn).toMatch(/security definer\s+set search_path to ''/);
  });
  it('jede Aktion prüft Mitgliedschaft bzw. Planungsrecht', () => {
    for (const a of ['list', 'get', 'respond', 'link_track']) expect(branch(a)).toMatch(/training_private_member\(/);
    for (const a of ['create', 'set_entry', 'remove_entry']) expect(branch(a)).toMatch(/training_private_manager\(/);
    expect(branch('update')).toMatch(/training_private_manager\(/);
    for (const a of ['create', 'set_entry', 'update']) expect(branch(a)).toContain('perform public.gd_active();');   // Planen braucht ACTIVE
  });
  it('Hund nur der eigene; sichtbar nur bei Zusage, passender Epoche und Mitgliedschaft', () => {
    expect(branch('respond')).toContain('x.id=d and x.owner_id=u');
    expect(branch('respond')).toContain('en.handler_id<>u');
    expect(sql).toContain("d.owner_id=e.handler_id and e.handler_response='yes'");
    expect(sql).toContain('e.dog_epoch=public.training_private_dog_epoch(d.id)');
    expect(sql).toContain('public.training_private_member(g, e.handler_id)');
    expect(sql).toContain("jsonb_build_object('dogId', d.id, 'name', d.name, 'breed', d.breed)");
  });
  it('Entwürfe nur für wer plant; Grenzen; Absagen/Entfernen ohne Löschen', () => {
    expect(branch('get')).toContain("v.status='draft' and not public.training_private_manager");
    expect(sql).toContain('check (position between 1 and 40)');
    expect(branch('set_entry')).toContain('>=40');
    expect(branch('remove_entry')).toContain('removed_at=coalesce(removed_at, clock_timestamp())');
    expect(fn).not.toMatch(/\bdelete\b/i);
  });
  it('Konto-Löschung: eigene Zeile weg, Pläne anderer bleiben', () => {
    expect(sql).toContain('training_private_plan_entries_handler_id_fkey foreign key (handler_id) references auth.users(id) on delete cascade');
    expect(sql).toContain('training_private_plan_entries_layer_id_fkey foreign key (layer_id) references auth.users(id) on delete set null');
    expect(sql).toContain('training_private_plans_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null');
  });
});
