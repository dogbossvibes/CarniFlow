import type { LocalTrainingSession } from '@/features/sync/types/sync';

// Reine, testbare Zusammenführung von Remote- (Supabase) und lokalen (SQLite)
// Fährten für den Verlauf. Local-first: eine lokal gespeicherte Fährte ist auch
// ohne erfolgreichen Remote-Sync gültig und muss sichtbar sein. Dedupe über die
// Session-ID (training_sessions.id == local_id == clientUuid, P-SAVE1/2).

export type TrackHistorySyncState = 'synced' | 'pending' | 'failed';

export interface TrackHistoryRow {
  id:                 string;
  dog_id:             string | null;
  status:             string | null;
  session_date:       string | null;
  created_at:         string | null;
  started_at:         string | null;
  surface_types:      string[] | null;
  distance_meters:    number | null;
  corners_total:      number | null;
  articles_total:     number | null;
  lying_time_minutes: number | null;
  score:              number | null;
  rating:             number | null;
  track_data:         any | null;
  syncState:          TrackHistorySyncState;
  isLocalOnly:        boolean;
  [k: string]:        any;   // Remote-Passthrough (Wetter etc.) für bestehende Mapper
}

function parseArr(s: string | null): string[] | null {
  if (!s) return null;
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : null; } catch { return null; }
}
function parseObj(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// SQLite-sync_status → minimaler UI-Zustand.
function syncStateOf(status: LocalTrainingSession['sync_status']): TrackHistorySyncState {
  if (status === 'synced') return 'synced';
  if (status === 'failed' || status === 'conflict') return 'failed';
  return 'pending';   // pending | syncing | local_only
}

// Lokale Session → Verlaufszeile (Summary aus payload_json, P-SAVE1-Finalize).
export function localSessionToHistoryRow(l: LocalTrainingSession): TrackHistoryRow {
  const payload = parseObj(l.payload_json) ?? {};
  const run = payload.run ?? null;   // Absuche-Ergebnis (RUN-SAVE1) — falls ausgearbeitet
  const time = l.started_at ?? l.created_at ?? null;
  return {
    id:                 l.local_id,
    dog_id:             l.dog_id,
    status:             l.status,
    session_date:       time ? time.slice(0, 10) : null,
    created_at:         l.created_at ?? null,
    started_at:         l.started_at ?? null,
    surface_types:      parseArr(l.surface_types),
    distance_meters:    payload.distanceMeters ?? null,
    corners_total:      payload.cornersTotal ?? null,
    articles_total:     payload.articlesTotal ?? null,
    articles_found:     run?.articles_found ?? null,
    lying_time_minutes: null,
    // Score der ausgearbeiteten Absuche (payload.run.score) bevorzugen, sonst Lay/Session.
    score:              run?.score ?? l.score ?? null,
    rating:             null,
    track_data:         (payload.segments || run) ? {
      ...(payload.segments ? { segments: payload.segments } : {}),
      ...(run ? { run } : {}),
    } : null,
    syncState:          syncStateOf(l.sync_status),
    isLocalOnly:        true,
  };
}

// Sortierschlüssel = echte Session-Zeit (NICHT Sync-/Upload-/Retry-Zeit): eine
// gestern gelegte Fährte darf durch heutigen Retry nicht nach oben rutschen.
function sessionTimeMs(r: { started_at?: string | null; session_date?: string | null; created_at?: string | null }): number {
  const s = r.started_at ?? r.session_date ?? r.created_at ?? null;
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

// Merge: Remote (synced, autoritativ) + lokale abgeschlossene Fährten. Bei gleicher
// ID gewinnt Remote (ein Eintrag). Lokal-only (pending/failed) wird ergänzt.
export function mergeTrackHistory(remote: any[], local: LocalTrainingSession[]): TrackHistoryRow[] {
  const byId = new Map<string, TrackHistoryRow>();
  for (const r of remote) {
    if (!r?.id) continue;
    byId.set(r.id, { ...r, syncState: 'synced', isLocalOnly: false });
  }
  for (const l of local) {
    if (l.status !== 'completed' || l.deleted_at) continue;   // nur abgeschlossene, nicht gelöschte Fährten
    const existing = byId.get(l.local_id);
    if (existing) {
      // Remote bleibt autoritativ. ABER: ist die Session lokal noch nicht synchronisiert
      // (z. B. frisch ausgearbeitete Absuche), zeigen wir den Badge und ergänzen die
      // Run-Daten, wenn die Remote-Zeile den Run noch nicht hat (RUN-SAVE2 pending).
      if (l.sync_status !== 'synced') {
        existing.syncState = syncStateOf(l.sync_status);
        const lr = localSessionToHistoryRow(l);
        const localRun = lr.track_data?.run;
        if (localRun && !existing.track_data?.run) {
          existing.track_data = { ...(existing.track_data ?? {}), run: localRun };
          if (lr.score != null) existing.score = lr.score;
          if (lr.articles_found != null) existing.articles_found = lr.articles_found;
        }
      }
      continue;   // kein Duplikat
    }
    byId.set(l.local_id, localSessionToHistoryRow(l));
  }
  return Array.from(byId.values()).sort((a, b) => sessionTimeMs(b) - sessionTimeMs(a));
}
