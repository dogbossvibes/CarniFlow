// Auswahl der Darstellungsgeometrie der Absuche (blaue Linie / Replay).
//
// Neu aufgezeichnete Läufe tragen zusätzlich `track_data.run.replay_points`
// (turn-aware, siehe searchReplayGeometry.ts). Ältere Läufe und Läufe ohne
// dieses Feld (Resume, Recovery, Remote-Ladeweg) replayen unverändert auf
// `runs[0].run_points`. Metriken und Analyse lesen weiterhin ausschliesslich
// `run_points` — diese Funktion ist NUR für die Darstellung.

export interface DisplayRunPoint { lat: number; lng: number; t?: number }

function validReplay(raw: unknown): DisplayRunPoint[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  for (const p of raw) {
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
    if (typeof p.t !== 'number' || !Number.isFinite(p.t)) return null;
  }
  return raw as DisplayRunPoint[];
}

export function selectDisplayRunPoints(data: unknown): { points: DisplayRunPoint[]; source: 'replay_points' | 'run_points' } {
  const d = (data ?? {}) as {
    runs?: { run_points?: DisplayRunPoint[] }[];
    track_data?: { run?: { replay_points?: unknown } };
  };
  const replay = validReplay(d.track_data?.run?.replay_points);
  if (replay) return { points: replay, source: 'replay_points' };
  return { points: d.runs?.[0]?.run_points ?? [], source: 'run_points' };
}
