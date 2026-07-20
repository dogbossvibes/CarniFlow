import { useMemo } from 'react';
import { useDogs } from '@/hooks/useDogs';
import { useActiveTraining } from '@/stores/activeTraining';
import { pickConnectSender, type ConnectSender } from '@/features/connect/utils/sender';
import type { Dog } from '@/types';

// Liefert den Standard-Absender (Hund oder persönlich) + die Hundeliste für die
// Mehrhunde-Auswahl. Nutzt ausschließlich bereits vorhandene Daten-Hooks
// (useDogs, activeTraining) — keine neue CONNECT-Abfrage beim App-Start.
export function useConnectSender(): { sender: ConnectSender; dogs: Dog[]; loading: boolean } {
  const { dogs, loading } = useDogs();
  const active = useActiveTraining();
  const sender = useMemo(
    () => pickConnectSender(dogs, active.dogId),
    [dogs, active.dogId],
  );
  return { sender, dogs, loading };
}
