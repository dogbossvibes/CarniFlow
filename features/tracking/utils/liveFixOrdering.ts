/**
 * Reine Zeitordnung für Live-Aufnahmen; Replay-Zeitsteuerung verwendet sie nicht.
 * Der Aufrufer muss jeden Originalfix separat und sicher archivieren; diese
 * Funktion speichert keine Daten.
 */
// Eine Sekunde toleriert Rundung/kleine Differenzen der Geräteuhren.
// Dies ist eine Zeitplausibilitätsgrenze, kein GPS-/Bewegungsfilter.
export const GPS_FUTURE_TOLERANCE_MS = 1000;

export type LiveFixTimeDecision = {
  disposition: 'live' | 'late' | 'duplicate' | 'future' | 'invalid';
  /** Letzte für Live-Verarbeitung zugelassene Messzeit. */
  nextLiveMeasurementMs: number | null;
};

export function classifyLiveFixTime(input: {
  measurementMs: number;
  receivedMs: number;
  lastLiveMeasurementMs: number | null;
  allowedFutureSkewMs: number;
}): LiveFixTimeDecision {
  const { measurementMs, receivedMs, lastLiveMeasurementMs, allowedFutureSkewMs } = input;
  const safeLast = lastLiveMeasurementMs !== null && Number.isFinite(lastLiveMeasurementMs) ? lastLiveMeasurementMs : null;
  const keep = (disposition: LiveFixTimeDecision['disposition']): LiveFixTimeDecision => ({ disposition, nextLiveMeasurementMs: safeLast });
  if (!Number.isFinite(measurementMs) || !Number.isFinite(receivedMs)
      || !Number.isFinite(allowedFutureSkewMs) || allowedFutureSkewMs < 0
      || (lastLiveMeasurementMs !== null && !Number.isFinite(lastLiveMeasurementMs))) return keep('invalid');
  if (measurementMs > receivedMs + allowedFutureSkewMs) return keep('future');
  if (lastLiveMeasurementMs !== null && measurementMs === lastLiveMeasurementMs) return keep('duplicate');
  if (lastLiveMeasurementMs !== null && measurementMs < lastLiveMeasurementMs) return keep('late');
  return { disposition: 'live', nextLiveMeasurementMs: measurementMs };
}
