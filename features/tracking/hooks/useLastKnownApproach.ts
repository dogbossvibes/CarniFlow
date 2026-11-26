import { useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { calculateDistance, type LatLng } from '@/features/tracking/utils/gpsFilter';

// Feldfehler 26.11.: Bis der erste echte Fix kommt, zeigt die Anfahrt sofort den
// letzten bekannten Standort des Systems — klar als «ungefähr» markiert.
//
// NUR Anzeige: Der Wert läuft weder in useStartPointApproach (kein Scharfschalten,
// kein «Ansatz erreicht») noch in den Recorder. Er wird nie gespeichert, nie
// archiviert und nie als Startpunkt der Absuche verwendet.
//
// Grenzen (sichtbar falsche Werte nicht anzeigen):
// - maxAgeMs 60 min: Nach dem Legen mit demselben Gerät stammt der Wert aus der
//   Fährtengegend; ältere Werte sind oft ein ganz anderer Ort (zuhause, Anfahrt).
// - maxDistanceToStartM 2 km: Weiter weg passt nicht zur Anfahrt zu Fuss zum Ansatz;
//   genau dieser Fall sähe aus wie der frühere Zürich-Fallback.
// - maxAccuracyM 500 m: Gröbere Netzwerkpositionen sagen über die Distanz zum
//   Ansatz nichts mehr aus.
export const LAST_KNOWN_LIMITS = {
  maxAgeMs: 60 * 60_000,
  maxDistanceToStartM: 2_000,
  maxAccuracyM: 500,
} as const;

export interface ApproximateApproach {
  position:  LatLng;
  distanceM: number;
  accuracy:  number | null;
}

export function approximateApproach(
  loc: Location.LocationObject | null,
  start: LatLng | null,
  readAtMs: number,
): ApproximateApproach | null {
  if (!loc || !start) return null;
  const { latitude, longitude, accuracy } = loc.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!Number.isFinite(start.lat) || !Number.isFinite(start.lng)) return null;
  if (!Number.isFinite(loc.timestamp) || readAtMs - loc.timestamp > LAST_KNOWN_LIMITS.maxAgeMs) return null;
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy > LAST_KNOWN_LIMITS.maxAccuracyM)) return null;
  const position = { lat: latitude, lng: longitude };
  const distanceM = calculateDistance(position, start);
  if (!Number.isFinite(distanceM) || distanceM > LAST_KNOWN_LIMITS.maxDistanceToStartM) return null;
  return { position, distanceM, accuracy: accuracy ?? null };
}

/**
 * Liest einmal je Anfahrt den letzten bekannten Standort (startet keine neue Ortung).
 * Der Wert läuft auch während der Anzeige nach maxAgeMs ab und wird beim Ende bzw.
 * Neustart der Anfahrt verworfen (kein alter Wert aus einer früheren Anfahrt).
 */
export function useLastKnownApproach(active: boolean, start: LatLng | null): ApproximateApproach | null {
  const [read, setRead] = useState<{ loc: Location.LocationObject; atMs: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_LIMITS.maxAgeMs, requiredAccuracy: LAST_KNOWN_LIMITS.maxAccuracyM,
    }).then(loc => { if (alive && loc) setRead({ loc, atMs: Date.now() }); })
      .catch(() => { /* nur Anzeige: ohne Wert bleibt «GPS wird gesucht» */ });
    return () => { alive = false; setRead(null); };
  }, [active]);
  // Ablauf während der Anzeige: genau dann verwerfen, wenn der Wert 60 min alt wird.
  useEffect(() => {
    if (!read) return;
    const remainingMs = read.loc.timestamp + LAST_KNOWN_LIMITS.maxAgeMs - Date.now();
    const id = setTimeout(() => setRead(null), Math.max(0, remainingMs));
    return () => clearTimeout(id);
  }, [read]);
  return useMemo(() => (active && read ? approximateApproach(read.loc, start, read.atMs) : null), [active, read, start]);
}
