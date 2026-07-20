import { useContext } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

// ──────────────────────────────────────────────────────────────────────────
// Zentraler Bottom-Abstand für ALLE schwebenden Elemente (FABs, Sticky Bars,
// Bottom Sheets, Toasts). Ein Wert für die ganze App — keine Magic Numbers,
// Android UND iOS, Gesten- & 3-Tasten-Navigation, mit/ohne Home-Indicator.
//
// Zwei Kontexte, automatisch erkannt:
//   • Tab-Screen (Home/Training/…): schwebt über der Bottom-Tab-Leiste. Deren
//     Höhe (in app/(tabs)/_layout.tsx = 88 iOS bzw. 66 + insets.bottom Android)
//     enthält die Safe Area BEREITS → wir addieren NUR den sichtbaren `gap`,
//     nie das Inset doppelt. (Behebt das Überlappen des Tab-Bars.)
//   • Vollbild/Modal ohne Tab-Leiste: nur die Safe Area (System-Nav /
//     Home-Indicator) + `gap`; Android-Untergrenze, falls Inset 0 gemeldet wird.
//
// `BottomTabBarHeightContext` liefert `number` im Tab-Kontext, sonst `undefined`
// (kein Wurf außerhalb eines Tab-Navigators).
// ──────────────────────────────────────────────────────────────────────────
export function useFabBottom(gap = 16): number {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);

  if (tabBarHeight != null) {
    return tabBarHeight + gap;               // über der Tab-Leiste (Safe Area schon enthalten)
  }

  const base = insets.bottom + gap;          // über der System-Navigation
  return Platform.OS === 'android' ? Math.max(base, 24) : base;
}

// Alias mit sprechendem Namen (gleiche Implementierung) — damit die Utility
// überall gefunden und verwendet wird und nie wieder ein Screen vergessen wird.
export const useFloatingBottomInset = useFabBottom;
