// ──────────────────────────────────────────────────────────────────────────
// Gemeinsamer «Erledigt · Rückgängig»-Hinweis (Logik ohne UI).
//
// Datenschutz-Regel (AGENTS.md, Kundendatenerhalt): Rückgängig heisst nie
// «löschen und vielleicht wiederherstellen». Ein Aufrufer zeigt die Wirkung
// sofort an, schreibt sie aber erst in `onCommit` dauerhaft fest. Jeder Hinweis
// endet genau einmal:
//   • Rückgängig getippt            → `onUndo`
//   • Frist abgelaufen / flush()    → `onCommit`
//   • cancel()                      → weder noch
// Geht die App in den Hintergrund, schreibt der Host sofort fest
// (`flushUndoToast`), damit eine als erledigt gezeigte Aktion auch gespeichert
// ist. Stürzt die App vorher ab, bleibt der alte gespeicherte Stand erhalten.
// ──────────────────────────────────────────────────────────────────────────

/** Sichtbar genug zum Lesen und Antippen. */
export const UNDO_TOAST_DURATION_MS = 7000;
/** Mit Vorlese-Funktion braucht es Zeit für die Ansage und den Weg zum Knopf. */
export const UNDO_TOAST_SCREEN_READER_DURATION_MS = 20000;

export interface UndoToastOptions {
  message: string;
  /** Macht die angezeigte Wirkung rückgängig. */
  onUndo: () => void;
  /** Schreibt die Aktion endgültig fest (Frist abgelaufen oder flush). */
  onCommit?: () => void;
  durationMs?: number;
}

export interface UndoToastEntry { id: number; message: string; durationMs: number }

export interface UndoToastHandle {
  /** Frist sofort beenden und festschreiben (z. B. Screen wird verlassen). */
  flush: () => void;
  /** Hinweis ohne Festschreiben und ohne Rückgängig schliessen. */
  cancel: () => void;
}

type Active = UndoToastEntry & {
  onUndo: () => void;
  onCommit?: () => void;
  timer: ReturnType<typeof setTimeout>;
};

let nextId = 1;
let active: Active | null = null;
let snapshot: UndoToastEntry | null = null;
let screenReader = false;
const listeners = new Set<() => void>();

function emit() { for (const listener of listeners) listener(); }

function finish(id: number, outcome: 'undo' | 'commit' | 'cancel') {
  if (!active || active.id !== id) return;
  const entry = active;
  clearTimeout(entry.timer);
  active = null;
  snapshot = null;
  emit();
  if (outcome === 'undo') entry.onUndo();
  else if (outcome === 'commit') entry.onCommit?.();
}

export function showUndoToast(options: UndoToastOptions): UndoToastHandle {
  // Ein neuer Hinweis schliesst den alten ab: dessen Aktion gilt als gewollt.
  if (active) finish(active.id, 'commit');
  const id = nextId++;
  const durationMs = options.durationMs
    ?? (screenReader ? UNDO_TOAST_SCREEN_READER_DURATION_MS : UNDO_TOAST_DURATION_MS);
  const timer = setTimeout(() => finish(id, 'commit'), durationMs);
  active = { id, message: options.message, durationMs, onUndo: options.onUndo, onCommit: options.onCommit, timer };
  snapshot = { id, message: options.message, durationMs };
  emit();
  return { flush: () => finish(id, 'commit'), cancel: () => finish(id, 'cancel') };
}

/** Vom Knopf «Rückgängig» aufgerufen. Liefert true, wenn etwas zurückgenommen wurde. */
export function undoToast(id: number): boolean {
  if (!active || active.id !== id) return false;
  finish(id, 'undo');
  return true;
}

/** Offenen Hinweis sofort festschreiben (z. B. App geht in den Hintergrund). */
export function flushUndoToast() { if (active) finish(active.id, 'commit'); }

export function setUndoToastScreenReader(enabled: boolean) { screenReader = enabled; }

export const subscribeUndoToast = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getUndoToastSnapshot = () => snapshot;
