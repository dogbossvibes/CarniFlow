import { TRACK_OVERLAY_COLORS } from '@/constants/colors';

// ──────────────────────────────────────────────────────────────────────────
// Fährtenfarbe eines Hundes für Referenz-Fährten (rein, testbar).
//
// • Gespeichert wird ein semantischer Key oder opakes #RRGGBB (dogs.track_overlay_color_key, nullable).
// • null/unbekannt = „Automatisch": stabile, deterministische Farbe aus der dogId
//   (FNV-1a-Hash) — gleiche dogId ⇒ immer dieselbe Farbe, kein Zufall, kein Zustand.
// • Aufgelöst wird AUSSCHLIESSLICH über die dogId des jeweiligen Overlays — nie über
//   den aktuellen/zuletzt gewählten Hund.
// ──────────────────────────────────────────────────────────────────────────

export type TrackOverlayColorKey = keyof typeof TRACK_OVERLAY_COLORS;
export type TrackOverlayColorValue = TrackOverlayColorKey | `#${string}`;

/** Only opaque six-digit RGB. Never pass arbitrary CSS/native colour strings. */
export function normalizeTrackOverlayColor(v: unknown): TrackOverlayColorValue | null {
  if (isTrackOverlayColorKey(v)) return v;
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim())
    ? v.trim().toUpperCase() as `#${string}` : null;
}

export function trackOverlayColorNameKey(value: TrackOverlayColorValue) {
  return isTrackOverlayColorKey(value) ? `dog.trackColor.${value}` as const : 'dog.trackColor.custom' as const;
}

/** Black/white foreground chosen using relative luminance. */
export function trackColorForeground(color: string): '#000000' | '#FFFFFF' {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

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
export function resolveTrackOverlayColorKey(dogId: string, stored: unknown): TrackOverlayColorValue {
  return normalizeTrackOverlayColor(stored) ?? autoTrackOverlayColorKey(dogId);
}

/** Farbwert (Design-Token) eines Keys. */
export function trackOverlayColor(key: TrackOverlayColorValue): string {
  return isTrackOverlayColorKey(key) ? TRACK_OVERLAY_COLORS[key] : normalizeTrackOverlayColor(key) ?? TRACK_OVERLAY_COLORS.orange;
}
