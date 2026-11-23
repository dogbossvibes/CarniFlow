import { useEffect, useRef } from 'react';

/** Immer der zuletzt gerenderte Wert – für Rückrufe, die erst nach einem `await` schreiben. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return ref;
}

/**
 * Meldet dem Formular, solange ein Baustein beschäftigt ist (Aufnahme, Upload):
 * `true` beim Beginn, `false` am Ende oder wenn der Baustein verschwindet.
 */
export function useBusyReport(busy: boolean, onBusyChange?: (busy: boolean) => void) {
  const callback = useLatestRef(onBusyChange);
  useEffect(() => {
    if (!busy) return;
    // Denselben Empfänger für Beginn und Ende verwenden.
    const report = callback.current;
    report?.(true);
    return () => { report?.(false); };
  }, [busy, callback]);
}
