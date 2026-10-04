import { useEffect, useRef } from 'react';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { healActiveFaehrtenFromPending } from '@/features/tracking/services/trackRecoveryService';

/**
 * Selbstheilung der Aktive-Fährten-Registry (kein UI). Läuft erst, wenn die Session
 * des angemeldeten Nutzers UND seine Hunde geladen sind, und lässt ausschliesslich
 * dessen dogIds zu — Pending-Puffer eines anderen/alten Accounts auf demselben Gerät
 * werden nie registriert. Ohne Session, beim Laden oder bei einem Hunde-Ladefehler
 * (z. B. offline) passiert nichts. Einmal pro Nutzer und Hundebestand.
 */
export function ActiveFaehrtenSelfHeal() {
  const { session } = useSession();
  const { dogs, loading, error } = useDogs();
  const userId = session?.user.id ?? null;
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || loading || error) return;
    const dogIds = dogs.map(d => d.id).filter(Boolean);
    const key = `${userId}:${[...dogIds].sort().join(',')}`;
    if (doneFor.current === key) return;
    doneFor.current = key;
    void healActiveFaehrtenFromPending(dogIds);
  }, [userId, loading, error, dogs]);

  return null;
}
