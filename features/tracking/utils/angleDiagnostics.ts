// ──────────────────────────────────────────────────────────────────────────
// DEV-ONLY Feld-Diagnostik für die Auto-Winkel-Erkennung (Prod-Bugfix Absuche).
//
// Zweck: für GENAU EINE reale Fährte belegen, ob im Feld Auto-Winkel-Kandidaten
// nur wegen schlechter GPS-Genauigkeit (MAX_ANGLE_ACCURACY_M = 20 m) verworfen
// werden. Reine Formatierung (testbar) + __DEV__-gegatetes Logging.
//
// NICHT in Produktion verdrahtet: dieses Modul wird von KEINEM Produktivpfad
// importiert (bleibt daher aus dem Bundle). Zum Feldtest gezielt einbinden:
//   • useTrackRecorder.detectCorner(): logAngleCandidate(...) je Kandidat
//   • run.tsx (Absuche-Start): logSearchLaidMarkers(snapData.laidMarkers)
// Danach wieder entfernen. KEINE personenbezogenen Daten, KEINE Tokens, KEINE
// vollständigen GPS-Rohtracks — nur aggregierte Kennzahlen.
// ──────────────────────────────────────────────────────────────────────────

export interface AngleCandidateDiag {
  accuracyM:              number | null;
  turnAngleDeg:           number;        // Richtungsänderung am Scheitel
  direction:              'links' | 'rechts';
  legBeforeM:             number;
  legAfterM:              number;
  headingDeviationBefore: number;
  headingDeviationAfter:  number;
  accepted:               boolean;
  rejectReason:           string | null; // z. B. 'accuracy>20', 'unstable_legs', 'deadzone'
  angleKind:              string | null; // erzeugter Typ (bei accepted)
  distanceFromStartM:     number | null;
}

// Kompakte, PII-freie Kandidatenzeile.
export function formatAngleCandidate(d: AngleCandidateDiag): string {
  const acc = d.accuracyM == null ? 'n/a' : `${d.accuracyM.toFixed(0)}m`;
  const status = d.accepted ? `accepted:${d.angleKind ?? '?'}@${d.distanceFromStartM ?? '?'}m` : `rejected:${d.rejectReason ?? '?'}`;
  return `[angleDiag] acc=${acc} turn=${d.turnAngleDeg.toFixed(0)}° ${d.direction} `
    + `legBefore=${d.legBeforeM.toFixed(1)}m legAfter=${d.legAfterM.toFixed(1)}m `
    + `devBefore=${d.headingDeviationBefore.toFixed(0)}° devAfter=${d.headingDeviationAfter.toFixed(0)}° ${status}`;
}

export function logAngleCandidate(d: AngleCandidateDiag): void {
  if (!__DEV__) return;
  console.log(formatAngleCandidate(d));
}

// Aggregierte Marker-Übersicht der gelegten Fährte beim Absuche-Start.
export function summarizeLaidMarkers(
  markers: readonly { type: string; angleKind?: string | null; distance_from_start?: number }[],
): string {
  const winkel = markers.filter(m => m.type === 'winkel');
  const objekte = markers.filter(m => m.type === 'gegenstand');
  const kinds = winkel.map(w => w.angleKind ?? 'null').join(',') || '—';
  return `[laidMarkers] total=${markers.length} winkel=${winkel.length} (${kinds}) gegenstand=${objekte.length}`;
}

export function logSearchLaidMarkers(
  markers: readonly { type: string; angleKind?: string | null; distance_from_start?: number }[],
): void {
  if (!__DEV__) return;
  console.log(summarizeLaidMarkers(markers));
}
