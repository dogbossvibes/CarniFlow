import { hasValidLayGeometry, pendingStatus } from '@/features/tracking/store/trackRecovery';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import type { LocalTrainingSession } from '@/features/sync/types/sync';
import { MANTRAIL_SESSION_TYPE, type MantrailData, type TrailResult, type TrailWind } from './model';

// Reine Ablauf-Logik für Mantrailing mit GPS (Spec 02, PR B1). Kein React, kein Netz.
// Die Aufnahme selbst macht der bestehende Fährten-Recorder (Trailer) bzw. der
// bestehende Absuche-Recorder (Hund); hier wird nur entschieden, WAS gezeigt,
// fortgesetzt und gespeichert wird.

/** Doppelblind: Trailer-Spur erst nach «Ende» oder nach ausdrücklichem «Spur zeigen». */
export function trailerLineVisible(input: { doubleBlind: boolean; revealedEarly: boolean; finished: boolean }): boolean {
  return !input.doubleBlind || input.revealedEarly || input.finished;
}

/** Ergebnis-Auswahl: Negativtrail kennt nur «korrekt negativ» / «falsch positiv» / abgebrochen. */
export function resultOptions(negative: boolean): readonly TrailResult[] {
  return negative ? ['negative_correct', 'negative_false', 'aborted'] : ['found', 'not_found', 'aborted'];
}

/** Wind aus dem Wetterdienst übernehmen (ohne Netz: null → Eingabe von Hand). */
export function windFromConditions(c: { windSpeed: number | null; windDir: number | null } | null | undefined): TrailWind | null {
  if (!c) return null;
  const fromDeg = typeof c.windDir === 'number' && Number.isFinite(c.windDir) ? Math.round(((c.windDir % 360) + 360) % 360) : null;
  const speedKmh = typeof c.windSpeed === 'number' && Number.isFinite(c.windSpeed) && c.windSpeed >= 0 ? Math.round(c.windSpeed * 10) / 10 : null;
  return fromDeg == null && speedKmh == null ? null : { fromDeg, speedKmh, source: 'weather' };
}

/** Himmelsrichtung, aus der der Wind kommt (N, NO, O, …), für die Anzeige. */
export function windCompass(fromDeg: number | null | undefined): string | null {
  if (fromDeg == null || !Number.isFinite(fromDeg)) return null;
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] as const;
  return dirs[Math.round((((fromDeg % 360) + 360) % 360) / 45) % 8];
}

/** Ergebnis in die Angaben übernehmen (Trail-Alter nur automatisch, wenn nicht von Hand gesetzt). */
export function applyRunResult(data: MantrailData, input: {
  result: TrailResult; indication: string | null; autoTrailAgeMinutes: number | null; windRun: TrailWind | null;
}): MantrailData {
  return {
    ...data,
    result: input.result,
    indication: input.indication?.trim() ? input.indication.trim().slice(0, 60) : null,
    trailAgeMinutes: data.trailAgeManual ? data.trailAgeMinutes : input.autoTrailAgeMinutes,
    windRun: input.windRun ?? data.windRun,
  };
}

/**
 * Darf eine unterbrochene Trailer-Aufnahme fortgesetzt werden? Nur die eigene, noch offene
 * Mantrail-Sitzung dieses Hundes mit gültigem Puffer im Zustand «laying». Liefert den
 * Puffer mit gesetzter Sitzungs-ID (der Recorder prüft genau diese Zuordnung) oder null.
 * Eine IGP-Fährte wird hier nie fortgesetzt.
 */
export function decideMantrailLayResume(input: {
  sessionId: string; dogId: string | null | undefined; userId: string | null | undefined;
  session: Pick<LocalTrainingSession, 'type' | 'user_id' | 'dog_id' | 'status' | 'ended_at' | 'deleted_at' | 'started_at'> | null | undefined;
  pending: PendingTrack | null | undefined;
  registrySessionId: string | null | undefined;
}): PendingTrack | null {
  const { session, pending, dogId, userId, sessionId } = input;
  if (!session || !pending || !dogId || !userId) return null;
  if (session.type !== MANTRAIL_SESSION_TYPE || session.user_id !== userId || session.dog_id !== dogId) return null;
  if (session.status !== 'active' || session.ended_at || session.deleted_at) return null;
  if (!session.started_at || !Number.isFinite(Date.parse(session.started_at))) return null;
  const belongs = pending.sessionId === sessionId || (pending.sessionId == null && input.registrySessionId === sessionId);
  if (!belongs || pending.dogId !== dogId) return null;
  if (pendingStatus(pending) !== 'laying' || pending.layFinishedAt) return null;
  if (!hasValidLayGeometry(pending.trackPoints) || !pending.trackPoints.every(p => Number.isFinite(p.t))) return null;
  if (!Number.isFinite(pending.distanceMeters) || !Number.isFinite(pending.durationSeconds)) return null;
  return { ...pending, sessionId, dogId, paused: true };
}
