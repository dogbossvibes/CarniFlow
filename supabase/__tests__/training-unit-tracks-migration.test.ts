import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../migrations/20261116210000_training_unit_tracks.sql'), 'utf8');
const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');

describe('Migration: Training mit Fährte/Absuche verknüpfen (#114)', () => {
  it('ist additiv und fasst keine bestehende Tabelle, Funktion oder Zeile an', () => {
    expect(code).not.toMatch(/\b(delete\s+from|truncate|drop\s+table|drop\s+column|alter\s+table\s+public\.(?!training_unit_tracks\b)|update\s+public\.|insert\s+into|alter\s+policy)/i);
    expect(code.match(/create table if not exists public\.(\w+)/g)).toEqual(['create table if not exists public.training_unit_tracks']);
    expect(code.match(/create or replace function public\.(\w+)/g)).toEqual(['create or replace function public.training_unit_track_link_allowed']);
    for (const policy of code.match(/(?:drop|create) policy (?:if exists )?\w+ on public\.\w+/g) ?? []) {
      expect(policy).toMatch(/on public\.training_unit_tracks$/);
    }
  });

  it('löscht beim Entfernen eines Trainings nur die Verknüpfung, nie die Fährte', () => {
    expect(code).toMatch(/training_unit_id\s+uuid not null references public\.training_units\(id\) on delete cascade/);
    expect(code).toMatch(/training_session_id uuid not null references public\.training_sessions\(id\) on delete cascade/);
    expect(code).toMatch(/track_run_id\s+uuid references public\.track_runs\(id\) on delete cascade/);
    // Kein Fremdschlüssel von Fährten-Tabellen auf die Verknüpfung.
    expect(code).not.toMatch(/references public\.training_unit_tracks/);
  });

  it('ist eindeutig je Training/Fährte und je Training/Fährte/Absuche', () => {
    expect(code).toMatch(/unique index if not exists training_unit_tracks_unit_session_key\s+on public\.training_unit_tracks \(training_unit_id, training_session_id\)\s+where track_run_id is null/);
    expect(code).toMatch(/unique index if not exists training_unit_tracks_unit_session_run_key\s+on public\.training_unit_tracks \(training_unit_id, training_session_id, track_run_id\)\s+where track_run_id is not null/);
  });

  it('erlaubt nur der Besitzerin Lesen, Anlegen und Lösen', () => {
    expect(code).toMatch(/alter table public\.training_unit_tracks enable row level security/);
    expect(code).toMatch(/revoke all on table public\.training_unit_tracks from public, anon/);
    expect(code).toMatch(/grant select, insert, delete on table public\.training_unit_tracks to authenticated/);
    expect(code).not.toMatch(/grant[^;]*\bupdate\b/i);
    expect(code).not.toMatch(/for (update|all)\b/i);
    expect((code.match(/create policy/g) ?? []).length).toBe(3);
    expect(code).toMatch(/for select to authenticated\s+using \(owner_id = auth\.uid\(\)\)/);
    expect(code).toMatch(/for delete to authenticated\s+using \(owner_id = auth\.uid\(\)\)/);
    expect(code).toMatch(/with check \(\s+owner_id = auth\.uid\(\)\s+and public\.training_unit_track_link_allowed\(training_unit_id, training_session_id, track_run_id\)/);
    expect(code).not.toMatch(/to (anon|public)\b(?!,)/);
    expect(code).not.toMatch(/connections|track_shares|trainer/i);
  });

  it('prüft beim Anlegen eigenes Training, eigene Fährte und passende Absuche ohne erweiterte Rechte', () => {
    expect(code).toMatch(/security invoker/);
    expect(code).not.toMatch(/security definer/);
    expect(code).toMatch(/u\.id = p_unit_id and u\.owner_id = auth\.uid\(\)/);
    expect(code).toMatch(/s\.id = p_session_id and s\.owner_id = auth\.uid\(\)/);
    expect(code).toMatch(/r\.id = p_run_id and r\.session_id = p_session_id/);
    expect(code).toMatch(/revoke all on function public\.training_unit_track_link_allowed\(uuid, uuid, uuid\) from public, anon/);
  });
});
