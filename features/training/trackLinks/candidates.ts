import type { TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';

// Auswahl «Fährten des Tages» für ein Training (#114). Reine Logik ohne
// Speicherzugriff: liest nur Kennzahlen der Fährte, nie Koordinaten.

export interface TrackCandidate {
  sessionId: string; startedAt: string | null; day: string | null;
  distanceMeters: number | null; corners: number | null; lyingMinutes: number | null;
  pendingSync: boolean;
  /** Bereits verknüpft, aber nicht vom gewählten Tag oder Hund: bleibt sichtbar, damit sie lösbar ist. */
  otherDay: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Kalendertag in Gerätezeit, wie ihn die Besitzerin erlebt hat. */
export function localDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function trackDay(row: Pick<TrackHistoryRow, 'session_date' | 'started_at' | 'created_at'>): string | null {
  const date = typeof row.session_date === 'string' ? row.session_date.slice(0, 10) : null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : localDay(row.started_at ?? row.created_at);
}

const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;

export function trackCandidates(rows: readonly TrackHistoryRow[], input: {
  dogId: string | null; day: string | null; linkedSessionIds?: readonly string[];
  /** Auch Fährten dieses Hundes von anderen Tagen zeigen («Fährte von anderem Tag wählen»). */
  includeOtherDays?: boolean;
}): TrackCandidate[] {
  const linked = new Set(input.linkedSessionIds ?? []);
  const out: TrackCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    const day = trackDay(row);
    const ofDay = !!input.dogId && !!input.day && row.dog_id === input.dogId && day === input.day;
    const ofDog = !!input.includeOtherDays && !!input.dogId && row.dog_id === input.dogId;
    if (!ofDay && !ofDog && !linked.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      sessionId: row.id, startedAt: row.started_at ?? row.created_at ?? null, day,
      distanceMeters: finite(row.distance_meters), corners: finite(row.corners_total), lyingMinutes: finite(row.lying_time_minutes),
      pendingSync: row.syncState !== 'synced', otherDay: !ofDay,
    });
  }
  return out.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? '') || a.sessionId.localeCompare(b.sessionId));
}

/**
 * Vorwahl: nur bei einem neuen Training, nur ohne bestehende Verknüpfung und
 * nur, wenn genau eine Fährte dieses Hundes an diesem Tag existiert.
 */
export function preselectedTracks(candidates: readonly TrackCandidate[], input: { editing: boolean; linkedSessionIds: readonly string[] }): string[] {
  if (input.linkedSessionIds.length > 0) return [...input.linkedSessionIds];
  if (input.editing) return [];
  const ofDay = candidates.filter(c => !c.otherDay);
  return ofDay.length === 1 ? [ofDay[0].sessionId] : [];
}
