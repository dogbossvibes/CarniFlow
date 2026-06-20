// GPS-Qualität + zentrale Tuning-Schwellen der Tracking-Engine.
// Bewusst an Hundesport-Fährten angepasst: langsames Gehen, viele Stopps,
// Wald/Feld-GPS-Drift.
import type { TrackPointQuality } from '@/features/tracking/engine/types';

export const PRECISION = {
  // Warmup / Gating
  WARMUP_MIN_MS:        5_000,    // mind. so lange sammeln, bevor Auto-Start möglich
  WARMUP_MAX_MS:        10_000,
  WARMUP_MANUAL_MS:     15_000,   // danach manueller Start trotz schlechtem GPS erlaubt
  READY_ACCURACY_M:     15,       // ≤ 15 m → Aufnahme freigeben
  GOOD_ACCURACY_M:      8,        // ≤ 8 m → „sehr gut"

  // Punkt-Annahme
  HARD_MAX_ACCURACY_M:  25,     // > 25 m → niemals Linienpunkt
  PLAUSIBLE_ACCURACY_M: 15,     // 15–25 m nur bei plausibler Bewegung
  MIN_STEP_M:           1.0,
  MAX_SPEED_MPS:        2.2,    // ~8 km/h: schneller = unrealistisch fürs Legen

  // Stillstand
  STATIONARY_RADIUS_M:  1.5,
  STATIONARY_WINDOW_MS: 4_000,

  // Winkel
  SHARP_TURN_DEG:       45,
  TURN_MIN_SEGMENT_M:   1.5,

  // Gegenstand-Platzierung
  OBJECT_WINDOW_MS:     10_000,
  OBJECT_MIN_POINTS:    5,
  OBJECT_DRIFT_GUARD_MS: 3_000,
} as const;

// GPS-Qualitätsstufe. Identisch zu TrackPointQuality (gemeinsame Quelle).
export type GpsQuality = TrackPointQuality;

// Genauigkeits-Klasse (≤8 sehr gut · ≤15 gut · ≤25 schwach · >25/null ungenau).
export function getGpsQuality(accuracy?: number | null): GpsQuality {
  if (accuracy == null) return 'bad';
  if (accuracy <= PRECISION.GOOD_ACCURACY_M)     return 'excellent'; // ≤ 8 m
  if (accuracy <= PRECISION.READY_ACCURACY_M)    return 'good';      // ≤ 15 m
  if (accuracy <= PRECISION.HARD_MAX_ACCURACY_M) return 'poor';      // ≤ 25 m
  return 'bad';
}

// Bestandsname – bleibt als Alias erhalten (wird breit im Engine-Code genutzt).
export const classifyQuality = getGpsQuality;

export const QUALITY_LABEL: Record<GpsQuality, string> = {
  excellent: 'Sehr gut',
  good:      'Gut',
  poor:      'Schwach',
  bad:       'Ungenau',
};

const QUALITY_MESSAGE: Record<GpsQuality, string> = {
  excellent: 'Bereit für präzise Fährtenaufnahme.',
  good:      'Bereit für Fährtenaufnahme.',
  poor:      'GPS ist schwach. Aufnahme möglich, aber weniger genau.',
  bad:       'GPS ist ungenau. Bitte freieren Himmel suchen.',
};

// Kurzes Label für die UI ("Sehr gut", "Gut", …).
export function getGpsQualityLabel(quality: GpsQuality): string {
  return QUALITY_LABEL[quality];
}

// Erklärender Satz für Warmup-/Status-Anzeige.
export function getGpsQualityMessage(quality: GpsQuality): string {
  return QUALITY_MESSAGE[quality];
}

// Auto-Start erlaubt, sobald die Genauigkeit ≤ 15 m ist.
export function canStartRecording(accuracy?: number | null): boolean {
  return accuracy != null && accuracy <= PRECISION.READY_ACCURACY_M;
}

// Warnung anzeigen, wenn (noch) keine ausreichende Genauigkeit vorliegt (> 15 m oder null).
export function shouldWarnPoorGps(accuracy?: number | null): boolean {
  return !canStartRecording(accuracy);
}
