import { useCallback, useEffect, useRef } from 'react';

/** Immer der zuletzt gerenderte Wert – für Rückrufe, die erst nach einem `await` schreiben. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return ref;
}

/**
 * Meldet dem Formular, solange eine Aufnahme oder ein Upload läuft
 * (z. B. um Hundewechsel und Speichern zu sperren).
 *
 * `hold()` meldet `true` und liefert die Freigabe, die genau einmal `false`
 * meldet. Die Freigabe gehört ans Ende des Uploads (`finally`), NICHT ans
 * Aushängen des Bausteins: ein Upload läuft auch weiter, wenn der Baustein
 * verschwindet, und schreibt danach noch ins Formular (Review B5).
 */
export function useBusyHold(onBusyChange?: (busy: boolean) => void) {
  const callback = useRef(onBusyChange);
  useEffect(() => { callback.current = onBusyChange; });
  return useCallback(() => {
    // Denselben Empfänger für Beginn und Ende verwenden.
    const report = callback.current;
    report?.(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      report?.(false);
    };
  }, []);
}
