import { useSyncExternalStore } from 'react';

// Teilt mit, ob die Live-Bar minimiert dargestellt werden soll (beim Scrollen).
// Screens melden ihre Scroll-Position; re-rendert nur beim Überschreiten der
// Schwelle (nicht bei jedem Scroll-Frame).
const THRESHOLD = 40;

let minimized = false;
const listeners = new Set<() => void>();

export function reportScroll(y: number) {
  const m = y > THRESHOLD;
  if (m !== minimized) {
    minimized = m;
    for (const l of listeners) l();
  }
}

// Beim Verlassen/Schliessen eines Screens zurücksetzen.
export function resetScroll() {
  if (minimized) {
    minimized = false;
    for (const l of listeners) l();
  }
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return minimized; }

export function useBarMinimized(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
