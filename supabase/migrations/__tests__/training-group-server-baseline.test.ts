/**
 * Gruppentraining-Server — Baseline aus Production (2026-11-12).
 *
 * Statische Prüfung der Migration. Die inhaltliche Übereinstimmung mit Production
 * wurde lokal gegen PostgreSQL 16 geprüft (39 Funktionstexte, 107 Spalten,
 * 76 Constraints/Indizes identisch; md5(pg_get_functiondef) der 13 Kernfunktionen
 * gleich den Production-Werten).
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20261112120000_training_group_server_baseline.sql', 'utf8');
const code = sql.replace(/^--.*$/gm, '');
// Nur Anweisungen ausserhalb der Funktionsrümpfe ($function$ … $function$)
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');

const TABLES = [
  'training_private_groups',
  'training_private_members',
  'training_private_invitations',
  'training_private_sessions',
  'training_private_participants',
  'training_private_dog_epochs',
  'training_live_grants',
  'training_live_last_positions',
  'training_live_maintenance_state',
  'group_distraction_tasks',
  'group_distraction_submissions',
  'group_distraction_source_epochs',
  'group_distraction_health',
  'anyvo_group_monitor_targets',
];

describe('Baseline Gruppentraining-Server', () => {
  it.each(TABLES)('%s: idempotent angelegt, RLS an, kein Client-Zugriff', (t) => {
    expect(code).toContain(`create table if not exists public.${t} (`);
    expect(code).toContain(`alter table public.${t} enable row level security;`);
    expect(code).toContain(`revoke all on table public.${t} from public, anon, authenticated;`);
  });

  it('legt keine Policies an (Zugriff nur über SECURITY-DEFINER-RPCs)', () => {
    expect(code).not.toMatch(/create policy/i);
  });

  it('gibt authenticated nur die vier öffentlichen Gruppen-RPCs frei', () => {
    const granted = [...code.matchAll(/grant execute on function public\.([a-z_0-9]+)\(.*\) to authenticated;/g)].map((m) => m[1]);
    expect(granted.sort()).toEqual([
      'training_group_distraction_v1',
      'training_group_live_v1',
      'training_group_session_v1',
      'training_group_v1',
    ]);
    expect(code).not.toMatch(/to anon;/);
  });

  it('enthält keine QA-Hilfen und keine Konten-IDs', () => {
    expect(code).not.toMatch(/qa_20261021|group_distraction_qa/);
    const uuids = code.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    expect(uuids.every((u) => u === '00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('löscht und überschreibt keine Daten', () => {
    expect(topLevel).not.toMatch(/\b(drop table|truncate (table )?public\.|delete from public\.|update public\.)/i);
    expect(topLevel).not.toMatch(/insert into public\./i);
  });

  it('Cron-Jobs nur mit pg_cron und nur, wenn sie noch fehlen', () => {
    expect(code).toContain("if to_regclass('cron.job') is null then");
    expect(code).toContain("if not exists (select 1 from cron.job where jobname = 'anyvo-training-live-maintenance-v1')");
    expect(code).toContain("if not exists (select 1 from cron.job where jobname = 'anyvo-group-distraction-maintenance-v1')");
  });
});
