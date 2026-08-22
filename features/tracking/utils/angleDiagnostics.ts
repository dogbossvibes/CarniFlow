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

import type { CornerConfidence } from '@/features/tracking/utils/cornerConfidence';
import type { ConfirmEvent, ConfirmedCorner } from '@/features/tracking/utils/cornerConfirmation';
import type { GpsQualityState } from '@/features/tracking/utils/gpsQualityState';

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

// ── Confidence-Diagnose (nur relevante Finalisierungs-/Kandidaten-Ereignisse) ──
// Zeigt type, side, angle, Gesamt-Confidence + Level, Einzelkomponenten und die
// Accept/Reject-Entscheidung. Bewusst KEIN Log je GPS-Sample.
export interface CornerConfidenceDiag {
  kind:       string | null;   // links | rechts | spitz_links | spitz_rechts | null
  side:       'links' | 'rechts' | null;
  angleDeg:   number;
  state:      'accept' | 'pending' | 'reject';
  confidence: CornerConfidence;
}

export function formatCornerConfidence(d: CornerConfidenceDiag): string {
  const c = d.confidence;
  const co = c.components;
  const pct = (x: number | undefined) => (x == null ? 'n/a' : `${Math.round(x * 100)}`);
  const reasons = c.reasons?.length ? ` reasons=${c.reasons.join(',')}` : '';
  return `[cornerConf] ${d.kind ?? '?'}/${d.side ?? '?'} ${d.angleDeg.toFixed(0)}° `
    + `score=${c.score.toFixed(2)} level=${c.level} state=${d.state} `
    + `turn=${pct(co.turnStrength)} legs=${pct(co.legSupport)} gps=${pct(co.gpsQuality)} `
    + `straight=${pct(co.straightness)} stable=${pct(co.stability)} speed=${pct(co.speedSupport)}${reasons}`;
}

export function logCornerConfidence(d: CornerConfidenceDiag): void {
  if (!__DEV__) return;
  console.log(formatCornerConfidence(d));
}

// ── Confirmation-Lifecycle (Phase 2) — nur relevante Candidate-Ereignisse ─────
// created | evidence | updated | reclassified | confirmed | rejected | expired.
// Kein Log je GPS-Rohsample.
export function formatConfirmEvent(e: ConfirmEvent): string {
  return `[cornerConfirm] ${e.type} ${e.kind ?? '?'} score=${e.confidence.toFixed(2)} ${e.level} ${e.detail}`;
}
export function logConfirmEvent(e: ConfirmEvent): void {
  if (!__DEV__) return;
  console.log(formatConfirmEvent(e));
}

// QA-Metrik je FINAL bestätigtem Winkel (PII-frei) — Grundlage für die Outdoor-Auswertung.
export function formatConfirmedCornerMetrics(c: ConfirmedCorner): string {
  const acc = c.accuracyM == null ? 'n/a' : `${c.accuracyM.toFixed(0)}m`;
  return `[cornerQA] ${c.kind} ${c.angleDeg.toFixed(0)}° init=${c.initialConfidence.toFixed(2)} `
    + `final=${c.finalConfidence.toFixed(2)}/${c.finalLevel} confirmDist=${c.confirmDistanceM.toFixed(1)}m `
    + `samples=${c.confirmSamples} acc=${acc} reason=${c.reason}`;
}
export function logConfirmedCornerMetrics(c: ConfirmedCorner): void {
  if (!__DEV__) return;
  console.log(formatConfirmedCornerMetrics(c));
}

// ── GPS Quality Engine (Phase 3) — nur bei relevanter Änderung loggen ─────────
export function formatGpsQuality(q: GpsQualityState): string {
  const c = q.components;
  const pct = (x: number | undefined) => (x == null ? 'n/a' : `${Math.round(x * 100)}`);
  const reasons = q.reasons.length ? ` reason=${q.reasons.join(',')}` : '';
  return `[gpsQuality] ${q.score.toFixed(2)} ${q.level}${q.valid ? '' : ' (warming)'} `
    + `acc=${pct(c.accuracy)} temporal=${pct(c.temporalStability)} jump=${pct(c.jumpStability)} `
    + `reject=${pct(c.rejectionHealth)} cadence=${pct(c.sampleConsistency)} motion=${pct(c.motionConsistency)} `
    + `n=${q.sampleCount}/${(q.windowDurationMs / 1000).toFixed(0)}s${reasons}`;
}

// Loggt NUR bei Level-Wechsel oder deutlicher Score-Änderung (kein Log je Rohsample).
export function logGpsQualityChange(
  prev: GpsQualityState | null, next: GpsQualityState, scoreDelta = 0.1,
): void {
  if (!__DEV__) return;
  const changed = !prev
    || prev.level !== next.level
    || prev.valid !== next.valid
    || Math.abs(prev.score - next.score) >= scoreDelta;
  if (changed) console.log(formatGpsQuality(next));
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
