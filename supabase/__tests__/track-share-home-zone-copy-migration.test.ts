import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../migrations/20261116200000_track_share_home_zone_copy.sql'), 'utf8');
const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');

describe('Migration: gekürzte Kopie für Trainer-Freigaben (#121)', () => {
  it('ist additiv und löscht oder ändert keine Kundendaten', () => {
    expect(code).not.toMatch(/\b(delete\s+from|truncate|drop\s+table|drop\s+column|update\s+public\.)/i);
    expect(code).toMatch(/add column if not exists shared_copy jsonb/);
    expect(code).toMatch(/add column if not exists shared_copy_digest text/);
  });

  it('gibt Originaldaten nur noch für Freigaben ohne Kopie frei', () => {
    expect(code).toMatch(/and sh\.shared_copy is null/);
    for (const [policy, table] of [['track_sessions_shared_select', 'training_sessions'], ['track_points_shared_select', 'track_points'],
      ['track_markers_shared_select', 'track_markers'], ['track_runs_shared_select', 'track_runs'],
      ['track_engine_sessions_shared_select', 'track_engine_sessions']]) {
      expect(code).toMatch(new RegExp(`alter policy ${policy} on public\\.${table}\\s+using \\(public\\.can_view_shared_track_original\\(`));
    }
  });

  it('lässt Freigabe, Feedback und Anzeigenamen unverändert und öffnet nichts für anon', () => {
    expect(code).not.toMatch(/create or replace function public\.can_view_shared_track\(/);
    expect(code).not.toMatch(/track_feedback|shared_track_display|track_shares_select/);
    expect(code).toMatch(/revoke all on function public\.can_view_shared_track_original\(uuid, uuid\) from public, anon/);
    expect(code).toMatch(/where p_viewer_id = auth\.uid\(\)/);
  });
});
