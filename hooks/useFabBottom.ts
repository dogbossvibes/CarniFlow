import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ──────────────────────────────────────────────────────────────────────────
// Standardisierter Bottom-Abstand für schwebende/klebrige Elemente (FABs,
// Sticky Actions) über der Systemnavigation bzw. dem Home-Indicator — für
// Android UND iOS. Ein Wert für die ganze App statt fester Pixel-Offsets.
//
//   Android: mind. 24 px, sonst Inset + gap (Gesten-/3-Button-Nav)
//   iOS:     Inset + gap (Home-Indicator; auf Geräten ohne Indicator = gap)
//
// `gap` = sichtbarer Abstand ÜBER der Safe Area (Default 16). Keine Grössen-,
// Farb- oder Logikänderung — reine Positionierung.
// ──────────────────────────────────────────────────────────────────────────
export function useFabBottom(gap = 16): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android'
    ? Math.max(insets.bottom + gap, 24)
    : insets.bottom + gap;
}
