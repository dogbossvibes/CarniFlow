import { haptic } from '@/lib/haptics';

// Fährten-Haptik. Delegiert an den zentralen Service (`@/lib/haptics`) — hier
// nur die fährtenspezifischen Semantik-Namen + die Drosselung für automatische
// Erkennungen. Kein direkter expo-haptics-Zugriff mehr.

// ── Nutzeraktionen: immer sofort, keine Drosselung ──────────────────────────
export function hapticTap(): void {          // Pause / Weiter / leichte Taps
  haptic.selection();
}
export function hapticSuccess(): void {       // Start / Stop / Gegenstand gefunden
  haptic.success();
}
export function hapticMarker(): void {        // Gegenstand setzen (kräftiger Impuls)
  haptic.medium();
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
  if (!autoAllowed()) return;
  haptic.light();
}
export function hapticWarning(): void {       // Abriss / Problem (gedrosselt)
  if (!autoAllowed()) return;
  haptic.warning();
}
