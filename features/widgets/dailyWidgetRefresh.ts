const listeners = new Set<() => void>();

// A successful source mutation invalidates derived widget data immediately.
// This never deletes a calendar/dog record and has no native-module dependency.
export function notifyDailyWidgetDataChanged(): void {
  for (const listener of listeners) { try { listener(); } catch { /* source writes must retain their original result */ } }
}
export function subscribeDailyWidgetDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
