import { useEffect, useState } from 'react';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import {
  type ActiveFaehrte, faehrteElapsedSeconds, sortActive,
} from '@/features/tracking/store/activeFaehrtenModel';

// Sekunden-Ticker NUR für die Anzeige (die Zeit selbst kommt aus Zeitstempeln,
// nicht aus einem Zähler). Läuft nur, solange mind. eine Fährte aktiv angezeigt wird.
export function useNowTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [active, intervalMs]);
  return now;
}

// Aktive Fährte EINES Hundes (reaktiv). null, wenn der Hund gerade keine offene hat.
export function useDogActiveFaehrte(dogId: string | null | undefined): ActiveFaehrte | null {
  return useActiveFaehrten(s => (dogId ? s.byDog[dogId] ?? null : null));
}

// Alle offenen Fährten (reaktiv, sortiert) für Logbuch/Global-Status.
export function useActiveFaehrtenList(): ActiveFaehrte[] {
  const byDog = useActiveFaehrten(s => s.byDog);
  return sortActive(Object.values(byDog));
}

// Verstrichene Sekunden eines Eintrags, sekündlich aktualisiert (nur resting/searching).
export function useFaehrteElapsed(entry: ActiveFaehrte | null): number {
  const live = !!entry && (entry.status === 'resting' || entry.status === 'searching');
  const now = useNowTicker(live);
  return entry ? faehrteElapsedSeconds(entry, live ? now : Date.now()) : 0;
}
