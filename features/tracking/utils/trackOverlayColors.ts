import { TRACK_OVERLAY_COLORS } from '@/constants/colors';

// ──────────────────────────────────────────────────────────────────────────
// Fährtenfarbe eines Hundes für Referenz-Fährten (rein, testbar).
//
// • Gespeichert wird nur ein semantischer Key (dogs.track_overlay_color_key, nullable).
// • null/unbekannt = „Automatisch": stabile, deterministische Farbe aus der dogId
//   (FNV-1a-Hash) — gleiche dogId ⇒ immer dieselbe Farbe, kein Zufall, kein Zustand.
// • Aufgelöst wird AUSSCHLIESSLICH über die dogId des jeweiligen Overlays — nie über
//   den aktuellen/zuletzt gewählten Hund.
// ──────────────────────────────────────────────────────────────────────────

export type TrackOverlayColorKey = keyof typeof TRACK_OVERLAY_COLORS;

/** Alle wählbaren Farben (Reihenfolge = Anzeige im Profil). */
export const TRACK_OVERLAY_COLOR_KEYS = Object.keys(TRACK_OVERLAY_COLORS) as TrackOverlayColorKey[];

/** Pool für „Automatisch": die auf Satellitenkarten am klarsten von der Mint-Fährte
 *  unterscheidbaren Farben (Cyan/Lime liegen näher an Mint → nur manuell wählbar). */
export const TRACK_OVERLAY_AUTO_KEYS: readonly TrackOverlayColorKey[] = ['orange', 'violet', 'pink', 'yellow', 'blue'];

export function isTrackOverlayColorKey(v: unknown): v is TrackOverlayColorKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TRACK_OVERLAY_COLORS, v);
}

/** FNV-1a (32 bit) — klein, deterministisch, plattformunabhängig. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Automatische Farbe einer dogId (stabil über App-Starts/Geräte). */
export function autoTrackOverlayColorKey(dogId: string): TrackOverlayColorKey {
  return TRACK_OVERLAY_AUTO_KEYS[fnv1a(dogId) % TRACK_OVERLAY_AUTO_KEYS.length];
}

/** Gespeicherter Key, sonst automatische Farbe der dogId. */
export function resolveTrackOverlayColorKey(dogId: string, stored: unknown): TrackOverlayColorKey {
  return isTrackOverlayColorKey(stored) ? stored : autoTrackOverlayColorKey(dogId);
}

/** Farbwert (Design-Token) eines Keys. */
export function trackOverlayColor(key: TrackOverlayColorKey): string {
  return TRACK_OVERLAY_COLORS[key];
}
