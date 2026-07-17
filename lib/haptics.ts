import { Platform } from 'react-native';

// ──────────────────────────────────────────────────────────────────────────
// Zentraler Haptik-Service (Android + iOS, Web = no-op).
//
// Grundsätze:
//   • „fire-and-forget": nie awaiten, Fehler NIE bis zur UI werfen.
//   • Stiller Fallback auf Geräten ohne Haptik / bei deaktivierter Systemhaptik.
//   • expo-haptics defensiv laden — fehlt das Modul (z. B. reines Web-Bundle),
//     bleiben alle Funktionen no-op statt zu crashen.
//   • Ein einziger Ort für das Mapping; keine direkten expo-haptics-Aufrufe
//     mehr in Feature-Code.
//
// Architektur-Vorbereitung: `setHapticsEnabled(false)` schaltet die gesamte
// Haptik ab (no-op). Eine spätere App-Einstellung kann dieses Flag setzen,
// ohne dass Aufrufstellen angefasst werden müssen.
// ──────────────────────────────────────────────────────────────────────────

let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch { Haptics = null; }

let hapticsEnabled = true;

/** Globaler An/Aus-Schalter (für eine spätere Einstellungsseite). */
export function setHapticsEnabled(value: boolean): void {
  hapticsEnabled = value;
}
export function isHapticsEnabled(): boolean {
  return hapticsEnabled;
}

function available(): boolean {
  return hapticsEnabled && Haptics != null && Platform.OS !== 'web';
}

// Jede Trigger-Funktion kapselt ihren eigenen try/catch — selbst ein
// synchroner Wurf aus expo-haptics darf den aufrufenden Handler nie stoppen.
type ImpactKind = 'Light' | 'Medium' | 'Heavy';
type NotifyKind = 'Success' | 'Warning' | 'Error';

function impact(kind: ImpactKind): void {
  if (!available()) return;
  try {
    const style = Haptics!.ImpactFeedbackStyle?.[kind];
    if (style == null) return;
    Haptics!.impactAsync(style).catch(() => {});
  } catch { /* still */ }
}

function notify(kind: NotifyKind): void {
  if (!available()) return;
  try {
    const type = Haptics!.NotificationFeedbackType?.[kind];
    if (type == null) return;
    Haptics!.notificationAsync(type).catch(() => {});
  } catch { /* still */ }
}

function selection(): void {
  if (!available()) return;
  try {
    Haptics!.selectionAsync().catch(() => {});
  } catch { /* still */ }
}

/**
 * Zentrale Haptik-API. Mapping siehe Team-Konvention:
 *   selection – Tab/Segment/Filter/Toggle/Auswahl
 *   light     – normale Buttons, Karten öffnen, Navigation, Bottom-Sheet-Aktion
 *   medium    – Start (Training/Fährte/Absuche), Speichern, Gegenstand/Winkel, Termin
 *   heavy     – Beenden (Fährte/Training), destruktive Bestätigung
 *   success   – gespeichert/hochgeladen/verbunden/Kauf erfolgreich
 *   warning   – Abbruchdialog, fehlende Berechtigung, ausverkauft, offline
 *   error     – Speichern/Upload/Kauf/Netzwerk endgültig fehlgeschlagen
 */
export const haptic = {
  selection,
  light:   () => impact('Light'),
  medium:  () => impact('Medium'),
  heavy:   () => impact('Heavy'),
  success: () => notify('Success'),
  warning: () => notify('Warning'),
  error:   () => notify('Error'),
};

// ── Rückwärtskompatible Aliase (bestehende ~40 Aufrufstellen) ───────────────
// Neuer Code sollte `haptic.*` verwenden.
export function tapHaptic(): void { haptic.selection(); }
export function successHaptic(): void { haptic.success(); }
