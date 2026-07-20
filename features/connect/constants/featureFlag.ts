// ANYVO CONNECT — Feature Flag.
//
// CONNECT ist standardmäßig AUS. Nur wenn EXPO_PUBLIC_FEATURE_CONNECT_ENABLED
// exakt "true" ist, erscheint der CONNECT-Tab und werden CONNECT-Screens
// aktiviert. Solange AUS:
//   • kein CONNECT-Tab
//   • keine CONNECT-Initialisierung
//   • keine CONNECT-Abfragen beim App-Start
//
// Der Wert wird von Expo zur Build-Zeit inline eingesetzt (EXPO_PUBLIC_*), ist
// also statisch und verursacht keine Laufzeit-/Netzwerkkosten beim Start.
export const CONNECT_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_CONNECT_ENABLED === 'true';

// Hook-Form für zukünftige Erweiterung (z. B. Kombination mit Entitlements).
// Aktuell reiner Spiegel der statischen Konstante.
export function useConnectEnabled(): boolean {
  return CONNECT_ENABLED;
}
