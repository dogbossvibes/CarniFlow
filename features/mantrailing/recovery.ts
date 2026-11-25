import { mergeLayRecovery } from '@/features/tracking/utils/layRecovery';
import { loadPending } from '@/features/tracking/store/trackPersist';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { getLaySessionStatus } from '@/features/tracking/engine/laySessionRuntime';
import {
  createLocalTrackPointsBatch, getLayTrackPointsBySession, getSearchPointsBySession, getTrackMarkersBySession,
} from '@/features/tracking/repositories/localTrackRepository';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import { decideMantrailLayResume } from './session';
import { MANTRAIL_SESSION_TYPE } from './model';

// Wiederherstellung für Mantrailing (Spec 02, PR B1). Gleicher Ablauf wie die
// IGP-Wiederherstellung (loadLayRecovery), aber nur für type = 'mantrail'; der
// IGP-Pfad bleibt unverändert. Es werden nur fehlende Punkte NACHGETRAGEN, nie
// bestehende Punkte verändert oder gelöscht.

export async function loadMantrailLayResume(args: { sessionId: string; dogId: string | null | undefined; userId: string | null | undefined }):
  Promise<{ pending: PendingTrack; startedAt: string } | null> {
  if (!args.dogId || !args.userId) return null;
  const st = useTrackingStore.getState();
  if (st.isRunningTrack || (st.isRecording && (st.dogId !== args.dogId || getLaySessionStatus(args.sessionId) === 'active'))) return null;
  const [session, pending] = await Promise.all([getLocalTrainingSessionById(args.sessionId), loadPending(args.dogId).catch(() => null)]);
  const restored = decideMantrailLayResume({ ...args, session, pending,
    registrySessionId: useActiveFaehrten.getState().get(args.dogId)?.sessionId ?? null });
  if (!restored || !session?.started_at) return null;
  const [points, markers] = await Promise.all([getLayTrackPointsBySession(args.sessionId), getTrackMarkersBySession(args.sessionId)]);
  const merged = mergeLayRecovery(restored, points, markers);
  if (!merged) return null;
  await createLocalTrackPointsBatch(args.sessionId, merged.pointsToPersist.map(p => ({ latitude: p.lat, longitude: p.lng,
    accuracy: p.accuracy, altitude: p.altitude, speed: p.speed, heading: p.heading, timestamp: new Date(p.t).toISOString(),
    breakBefore: p.breakBefore, measuredDistanceM: p.measuredDistanceM })));
  return { pending: merged.pending, startedAt: session.started_at };
}

export interface MantrailRunSource {
  /** Trailer-Spur (leer bei «ohne Aufzeichnung»). */
  laidPoints: { latitude: number; longitude: number; breakBefore?: boolean }[];
  /** Ende der Trailer-Aufnahme (ms) – Grundlage des Trail-Alters. */
  trailerEndMs: number | null;
  /** Bereits gespeicherte Hundepunkte einer unterbrochenen Arbeit. */
  searchPoints: { latitude: number; longitude: number; breakBefore?: boolean }[];
  hasRun: boolean;
}

/** Lädt die Daten für «Hund arbeitet» aus dem lokalen Speicher. Nur eigene Mantrail-Sitzungen. */
export async function loadMantrailRunSource(sessionId: string, userId: string | null | undefined): Promise<MantrailRunSource | null> {
  const session = await getLocalTrainingSessionById(sessionId);
  if (!session || session.type !== MANTRAIL_SESSION_TYPE || session.deleted_at || !userId || session.user_id !== userId) return null;
  const [lay, search] = await Promise.all([getLayTrackPointsBySession(sessionId), getSearchPointsBySession(sessionId)]);
  const toLatLng = (p: { latitude: number; longitude: number; payload_json: string | null }) => {
    let breakBefore = false;
    try { breakBefore = JSON.parse(p.payload_json ?? '{}')?.breakBefore === true; } catch { /* Altformat ohne Metadaten */ }
    return breakBefore ? { latitude: p.latitude, longitude: p.longitude, breakBefore } : { latitude: p.latitude, longitude: p.longitude };
  };
  let hasRun = false;
  try { hasRun = !!JSON.parse(session.payload_json ?? '{}')?.run; } catch { /* kein Ergebnis */ }
  const endMs = session.ended_at ? Date.parse(session.ended_at) : NaN;
  return {
    laidPoints: lay.map(toLatLng), searchPoints: search.map(toLatLng), hasRun,
    trailerEndMs: Number.isFinite(endMs) ? endMs : null,
  };
}
