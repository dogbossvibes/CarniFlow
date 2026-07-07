import { Platform } from 'react-native';

// Zentrale Haptik fürs Fährten-Tool. Bewusst „fire-and-forget": sofort auslösen,
// NIE awaiten, Fehler still schlucken (kein Crash auf Geräten ohne Haptik / Web).
// expo-haptics defensiv laden (nativ) — fehlt das Modul, sind alle Funktionen no-op.
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch { Haptics = null; }

const enabled = () => Haptics != null && Platform.OS !== 'web';

// ── Nutzeraktionen: immer sofort, keine Drosselung ──────────────────────────
export function hapticTap(): void {          // Pause / Weiter / leichte Taps
  if (!enabled()) return;
  Haptics!.selectionAsync().catch(() => {});
}
export function hapticSuccess(): void {       // Start / Stop / Gegenstand gefunden
  if (!enabled()) return;
  Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Success).catch(() => {});
}
export function hapticMarker(): void {        // Gegenstand setzen (kräftiger Impuls)
  if (!enabled()) return;
  Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Medium).catch(() => {});
}

// ── Automatische Erkennungen: gedrosselt gegen Haptik-Spam ───────────────────
// Winkel/Abriss feuern zwar schon nur 1× pro Ecke (räumliches Gate im Recorder),
// zusätzlich ein Zeit-Gate als Sicherheitsnetz gegen doppelte Auslösung.
const AUTO_HAPTIC_GAP_MS = 1500;
let lastAutoAt = 0;
function autoAllowed(): boolean {
  const now = Date.now();
  if (now - lastAutoAt < AUTO_HAPTIC_GAP_MS) return false;
  lastAutoAt = now;
  return true;
}

export function hapticAngle(): void {         // Winkel automatisch erkannt (gedrosselt)
  if (!enabled() || !autoAllowed()) return;
  Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Light).catch(() => {});
}
export function hapticWarning(): void {       // Abriss / Problem (gedrosselt)
  if (!enabled() || !autoAllowed()) return;
  Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Warning).catch(() => {});
}
