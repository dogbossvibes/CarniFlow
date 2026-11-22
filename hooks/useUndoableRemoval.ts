import { useCallback, useEffect, useRef } from 'react';
import { useUndoToast } from '@/components/ui/UndoToast';
import type { UndoToastHandle } from '@/lib/undoToast';

// «Aus der Auswahl entfernen» mit Rückgängig statt Rückfrage. Es wird nur der
// Formularwert geändert (keine Datei, kein gespeicherter Eintrag); Rückgängig
// setzt das Element an seinen alten Platz zurück.
export function useUndoableListRemoval<T>(value: T[], onChange: (next: T[]) => void) {
  const showUndo = useUndoToast();
  const latest = useRef({ value, onChange });
  useEffect(() => { latest.current = { value, onChange }; });
  const handle = useRef<UndoToastHandle | null>(null);

  const remove = useCallback((index: number, message: string) => {
    const current = latest.current;
    if (index < 0 || index >= current.value.length) return;
    const removed = current.value[index];
    current.onChange(current.value.filter((_, i) => i !== index));
    handle.current = showUndo({
      message,
      onUndo: () => {
        const now = latest.current;
        const next = [...now.value];
        next.splice(Math.min(index, next.length), 0, removed);
        now.onChange(next);
      },
    });
  }, [showUndo]);

  /** Vor einer neuen Auswahl/Aufnahme aufrufen: schliesst einen offenen Hinweis. */
  const settle = useCallback(() => { handle.current?.flush(); handle.current = null; }, []);
  return { remove, settle };
}

/** Wie oben, für einen einzelnen Wert (z. B. ein Video). */
export function useUndoableValueRemoval<T>(value: T | null | undefined, onChange: (next: T | null) => void) {
  const showUndo = useUndoToast();
  const latest = useRef({ value, onChange });
  useEffect(() => { latest.current = { value, onChange }; });
  const handle = useRef<UndoToastHandle | null>(null);

  const remove = useCallback((message: string) => {
    const current = latest.current;
    if (current.value == null) return;
    const removed = current.value;
    current.onChange(null);
    handle.current = showUndo({
      message,
      // Nur zurücksetzen, wenn inzwischen nichts Neues gewählt wurde.
      onUndo: () => { if (latest.current.value == null) latest.current.onChange(removed); },
    });
  }, [showUndo]);

  const settle = useCallback(() => { handle.current?.flush(); handle.current = null; }, []);
  return { remove, settle };
}
