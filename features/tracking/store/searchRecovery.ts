import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import type { TrackPointSample } from '@/features/tracking/store/trackingStore';

// ──────────────────────────────────────────────────────────────────────────
// Reine, testbare Recovery-Helfer der Absuche (P2). Kein React/Expo/Native.
// ──────────────────────────────────────────────────────────────────────────

export type RecoveryDecision =
  | { kind: 'fresh' }
  | { kind: 'recovery'; pending: PendingTrack };

// Entscheidet beim Öffnen von run.tsx, ob eine unterbrochene Absuche vorliegt.
// NUR status === 'searching' löst Recovery aus. Legacy-Snapshots (status
// undefined) sowie 'completed'/'cancelled' → 'fresh' (kein Fortsetzen).
export function decideRecovery(pending: PendingTrack | null): RecoveryDecision {
  if (pending && pending.status === 'searching') return { kind: 'recovery', pending };
  return { kind: 'fresh' };
}

// Dedupliziert Suchpunkte stabil über (Timestamp | gerundete Koordinaten). Schützt
// beim Zusammenführen von wiederhergestellten (SQLite/Puffer) und neuen Punkten
// gegen Duplikate, falls sich Quellen überlappen.
export function dedupeSearchPoints(points: TrackPointSample[]): TrackPointSample[] {
  const seen = new Set<string>();
  const out: TrackPointSample[] = [];
  for (const p of points) {
    const key = `${p.t ?? 0}|${p.lat.toFixed(6)}|${p.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// Kumulierte Weglänge (m) einer Punktfolge (Haversine) — für die Finalisierung
// beim „Beenden" aus wiederhergestellten Punkten.
export function pathDistanceM(points: { lat: number; lng: number }[]): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    sum += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return sum;
}
