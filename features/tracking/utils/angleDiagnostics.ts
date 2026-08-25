// ──────────────────────────────────────────────────────────────────────────
// DEV-ONLY Feld-Diagnostik für die Auto-Winkel- und Voice-Guidance-Kette.
//
// Zweck: für GENAU EINE reale Fährte belegen, ob im Feld Auto-Winkel-Kandidaten
// verloren gehen. Reine Formatierung (testbar) + __DEV__-gegatetes Logging.
//
// Das Modul darf im Produktivpfad importiert werden, gibt dort aber wegen __DEV__
// NIE etwas aus. Keine Telemetrie, Tokens, User-IDs oder Koordinaten: Positionen
// werden ausschliesslich als relative Bogenlänge der Fährte ausgegeben.
// ──────────────────────────────────────────────────────────────────────────

export interface AngleCandidateDiag {
  timestampMs:            number;
  positionArcM:            number;
  inputAccuracyM:          number | null;
  usedAccuracyM:           number | null;
  turnDeg:                 number;
  direction:               'links' | 'rechts' | null;
  legBeforeM:              number;
  legAfterM:               number;
  straightBefore:          number;
  straightAfter:           number;
  confidence:              number;
  state:                   'accept' | 'pending' | 'reject';
  reason:                  string | null;
  angleKind:               string | null;
  markerId?:               string | null;
}

function fmt(value: number, digits = 1) { return Number.isFinite(value) ? value.toFixed(digits) : 'n/a'; }

// Kompakte, PII-freie Kandidatenzeile. positionArcM ist eine Entfernung vom
// Fährtenstart, keine geografische Position.
export function formatAngleCandidate(d: AngleCandidateDiag): string {
  const inputAcc = d.inputAccuracyM == null ? 'n/a' : `${fmt(d.inputAccuracyM, 0)}m`;
  const usedAcc = d.usedAccuracyM == null ? 'n/a' : `${fmt(d.usedAccuracyM, 0)}m`;
  return `[trackDiag:angle] t=${new Date(d.timestampMs).toISOString()} arcM=${fmt(d.positionArcM)} `
    + `accIn=${inputAcc} accUsed=${usedAcc} turn=${fmt(d.turnDeg, 0)}° dir=${d.direction ?? 'n/a'} `
    + `legBefore=${fmt(d.legBeforeM)}m legAfter=${fmt(d.legAfterM)}m `
    + `straightBefore=${fmt(d.straightBefore, 2)} straightAfter=${fmt(d.straightAfter, 2)} `
    + `confidence=${fmt(d.confidence, 2)} state=${d.state} kind=${d.angleKind ?? 'n/a'} `
    + `reason=${d.reason ?? 'none'} marker=${d.markerId ?? 'none'}`;
}

export function logAngleCandidate(d: AngleCandidateDiag): void {
  if (!__DEV__) return;
  console.log(formatAngleCandidate(d));
}

export interface SearchMarkerDiag {
  id: string;
  type: 'winkel' | 'gegenstand';
  angleKind?: string | null;
  arcM: number;
  hasPosition: boolean;
}

// Snapshot-Übersicht ohne GPS-Koordinaten.
export function formatSearchSnapshot(input: { trackPointCount: number; markers: readonly SearchMarkerDiag[] }): string {
  const angles = input.markers.filter(marker => marker.type === 'winkel');
  const objects = input.markers.filter(marker => marker.type === 'gegenstand');
  const describe = (marker: SearchMarkerDiag) => `${marker.id}:${marker.angleKind ?? marker.type}@${fmt(marker.arcM)}m:pos=${marker.hasPosition}`;
  return `[trackDiag:snapshot] trackPoints=${input.trackPointCount} angles=${angles.length} objects=${objects.length} `
    + `angleMarkers=[${angles.map(describe).join(',') || '—'}] objectMarkers=[${objects.map(describe).join(',') || '—'}]`;
}

export function logSearchSnapshot(input: { trackPointCount: number; markers: readonly SearchMarkerDiag[] }): void {
  if (!__DEV__) return;
  console.log(formatSearchSnapshot(input));
}

// Rückwärtskompatible, aggregierte Marker-Übersicht für bestehende Diagnose-Aufrufer.
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

export interface GuidanceCandidateDiag {
  id: string;
  type: 'angle' | 'object';
  arcM: number;
  forwardDistanceM: number | null;
  alreadySpoken: boolean;
  selected: boolean;
  suppression: string | null;
}

export interface VoiceGuidanceDiag {
  dogProgressM: number | null;
  voiceEnabled: boolean;
  speechAvailable: boolean;
  cooldownActive: boolean;
  speechTriggered: boolean;
  candidates: readonly GuidanceCandidateDiag[];
}

export function logVoiceGuidance(diag: VoiceGuidanceDiag): void {
  if (!__DEV__) return;
  const candidates = diag.candidates.map(candidate =>
    `${candidate.id}:${candidate.type}@${fmt(candidate.arcM)}m:d=${candidate.forwardDistanceM == null ? 'behind' : fmt(candidate.forwardDistanceM)}`
      + `:spoken=${candidate.alreadySpoken}:selected=${candidate.selected}:suppression=${candidate.suppression ?? 'none'}`,
  ).join(' | ') || '—';
  console.log(`[trackDiag:voice] dogProgress=${diag.dogProgressM == null ? 'n/a' : fmt(diag.dogProgressM)} `
    + `voice=${diag.voiceEnabled} speechAvailable=${diag.speechAvailable} cooldown=${diag.cooldownActive} `
    + `speechTriggered=${diag.speechTriggered} candidates=[${candidates}]`);
}
