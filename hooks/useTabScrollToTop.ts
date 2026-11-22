import { useRef } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { useScrollToTop } from 'expo-router';

/**
 * Tab nochmals antippen → Liste weich nach oben scrollen.
 *
 * Nutzt das in expo-router 58 mitgelieferte `useScrollToTop`: es hört auf das
 * `tabPress`-Ereignis der Tab-Leiste und scrollt nur, wenn der Tab bereits
 * aktiv ist. Rein funktional — kein sichtbares Element, kein Layout.
 *
 * Verwendung: `const scrollRef = useTabScrollToTop();` und
 * `<ScrollView ref={scrollRef} …>` in der Hauptliste eines Tabs.
 */
export function useTabScrollToTop() {
  const ref = useRef<ScrollViewInstance>(null);
  useScrollToTop(ref);
  return ref;
}
