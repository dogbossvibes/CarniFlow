// Mini-Event-Bus für „Schnell-Gegenstand". Ein externer Auslöser (iOS-Deep-Link
// anyvo://track/quick-add-article) emittiert hier; der Lege-Screen abonniert,
// solange er aufnimmt, und setzt dann einen Gegenstand. Bewusst winzig gehalten.
type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeQuickAddArticle(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// true, wenn mindestens ein Abonnent reagiert hat (z. B. laufende Aufnahme).
export function emitQuickAddArticle(): boolean {
  const had = listeners.size > 0;
  listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });
  return had;
}
