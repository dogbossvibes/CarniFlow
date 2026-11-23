import { useCallback, useEffect, useRef } from 'react';
import { useUndoToast } from '@/components/ui/UndoToast';
import type { UndoToastHandle } from '@/lib/undoToast';

// «Aus der Auswahl entfernen» mit Rückgängig statt Rückfrage. Es wird nur der
// Formularwert geändert (keine Datei, kein gespeicherter Eintrag); Rückgängig
// setzt das Element an seinen alten Platz zurück.
//
// Rückgängig gilt nur für genau das Formular, in dem entfernt wurde:
//   • `scope` (z. B. die Hunde-ID): wechselt er, wird der Hinweis geschlossen,
//     damit nichts beim falschen Hund landet.
//   • `locked` (z. B. während des Speicherns): der Hinweis wird geschlossen und
//     Entfernen ist gesperrt, damit Anzeige und gespeicherter Eintrag nie
//     auseinanderlaufen.
export interface UndoableRemovalOptions { scope?: string | null; locked?: boolean }

function useRemovalContext<V, C>(value: V, onChange: C, options: UndoableRemovalOptions) {
  const scope = options.scope ?? null;
  const locked = options.locked ?? false;
  const latest = useRef({ value, onChange, scope, locked });
  useEffect(() => { latest.current = { value, onChange, scope, locked }; });
  const handle = useRef<UndoToastHandle | null>(null);
  const settle = useCallback(() => { handle.current?.flush(); handle.current = null; }, []);
  const track = useCallback((next: UndoToastHandle) => { handle.current = next; }, []);
  useEffect(() => settle, [scope, locked, settle]);
  return { latest, track, settle };
}

export function useUndoableListRemoval<T>(value: T[], onChange: (next: T[]) => void, options: UndoableRemovalOptions = {}) {
  const showUndo = useUndoToast();
  const { latest, track, settle } = useRemovalContext(value, onChange, options);

  const remove = useCallback((index: number, message: string) => {
    const current = latest.current;
    if (current.locked || index < 0 || index >= current.value.length) return;
    const removed = current.value[index];
    const scope = current.scope;
    current.onChange(current.value.filter((_, i) => i !== index));
    track(showUndo({
      message,
      onUndo: () => {
        const now = latest.current;
        // Anderes Formular, Speichern läuft oder Element ist schon wieder da: nichts tun.
        if (now.locked || now.scope !== scope || now.value.includes(removed)) return;
        const next = [...now.value];
        next.splice(Math.min(index, next.length), 0, removed);
        now.onChange(next);
      },
    }));
  }, [latest, showUndo, track]);

  /** `settle`: vor einer neuen Auswahl/Aufnahme aufrufen, schliesst einen offenen Hinweis. */
  return { remove, settle };
}

/** Wie oben, für einen einzelnen Wert (z. B. ein Video). */
export function useUndoableValueRemoval<T>(value: T | null | undefined, onChange: (next: T | null) => void, options: UndoableRemovalOptions = {}) {
  const showUndo = useUndoToast();
  const { latest, track, settle } = useRemovalContext(value, onChange, options);

  const remove = useCallback((message: string) => {
    const current = latest.current;
    if (current.locked || current.value == null) return;
    const removed = current.value;
    const scope = current.scope;
    current.onChange(null);
    track(showUndo({
      message,
      // Nur zurücksetzen, wenn im selben Formular inzwischen nichts Neues gewählt wurde.
      onUndo: () => {
        const now = latest.current;
        if (!now.locked && now.scope === scope && now.value == null) now.onChange(removed);
      },
    }));
  }, [latest, showUndo, track]);

  return { remove, settle };
}
