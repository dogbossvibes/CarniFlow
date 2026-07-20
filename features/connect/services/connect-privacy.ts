import type { ConnectVisibility } from '@/features/connect/types/connect.types';

// ANYVO CONNECT — Datenschutz-Logik (rein, testbar). Serverseitig gilt zusätzlich
// die RLS; diese Funktionen sind für optimistische UI + sichere Share-Aufbereitung.

// ── 1. Beitrags-Sichtbarkeit (spiegelt die RLS 1:1) ─────────────────────────
export interface PostVisibilityInput {
  authorUserId: string;
  visibility: ConnectVisibility;
  deletedAt: string | null;
  viewerId: string;
  areFriends: boolean;
  isBlocked: boolean;
}

export function canSeePost(i: PostVisibilityInput): boolean {
  if (i.authorUserId === i.viewerId) return true;   // eigener Beitrag
  if (i.deletedAt) return false;
  if (i.isBlocked) return false;                     // Block wirkt bidirektional
  if (i.visibility === 'public') return true;
  if (i.visibility === 'friends') return i.areFriends;
  return false;                                      // private / group
}

// ── 2. Sichere Trainings-Freigabe (Whitelist) ───────────────────────────────
// Sensible Felder (GPS-Track, exakter Start, Trainerkommentar, Gesundheit,
// private Notizen, Kundendaten) werden NIE gelesen — sie können gar nicht in
// die Ausgabe gelangen.

export interface ShareTrainingSelection {
  discipline?: boolean;
  duration?: boolean;
  distance?: boolean;      // allgemeine Distanz
  objectCount?: boolean;
  difficulty?: boolean;
  rating?: boolean;        // persönliche Bewertung
}

export interface TrainingSource {
  discipline?: string | null;
  duration_sec?: number | null;
  distance_m?: number | null;
  object_count?: number | null;
  difficulty?: string | null;
  rating?: number | null;
  // (Sensible Felder werden bewusst NICHT typisiert/gelesen.)
}

export interface SanitizedTraining {
  discipline: string | null;
  duration_sec: number | null;
  distance_m: number | null;
  object_count: number | null;
  difficulty: string | null;
  rating: number | null;
}

const FULL_SELECTION: Required<ShareTrainingSelection> = {
  discipline: true, duration: true, distance: true, objectCount: true, difficulty: true, rating: true,
};

export function sanitizeTrainingForShare(
  src: TrainingSource,
  selection: ShareTrainingSelection = FULL_SELECTION,
): SanitizedTraining {
  // Teil-Auswahl bedeutet „NUR diese Werte"; nicht ausgewählte Felder → null.
  return {
    discipline:   selection.discipline  ? (src.discipline   ?? null) : null,
    duration_sec: selection.duration    ? (src.duration_sec ?? null) : null,
    distance_m:   selection.distance    ? (src.distance_m   ?? null) : null,
    object_count: selection.objectCount ? (src.object_count ?? null) : null,
    difficulty:   selection.difficulty  ? (src.difficulty   ?? null) : null,
    rating:       selection.rating      ? (src.rating       ?? null) : null,
  };
}

// Felder, die niemals in einem geteilten Beitrag/Payload vorkommen dürfen.
export const SENSITIVE_TRAINING_KEYS = [
  'gps_track', 'track', 'route', 'points', 'exact_start', 'start_location',
  'notes', 'note', 'private_notes', 'trainer_comment', 'trainer_notes',
  'health', 'health_data', 'client', 'client_data', 'customer',
] as const;

/** Defensive Prüfung: enthält ein Payload sensible Schlüssel? (für Tests/Guards) */
export function hasSensitiveTrainingKeys(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some(k => (SENSITIVE_TRAINING_KEYS as readonly string[]).includes(k));
}

// ── 3. Standort-Anonymisierung (Region statt exakter Ort) ───────────────────
// Rundet Koordinaten grob (≈1 km bei 2 Nachkommastellen) für öffentliche Anzeige.
export function roundApproxCoord(value: number | null | undefined, decimals = 2): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
