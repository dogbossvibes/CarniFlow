import { useMemo } from 'react';
import { useSession } from '@/hooks/useSession';
import { resolveActiveDogId, setActiveDogId, useStoredActiveDogId } from '@/stores/activeDog';

// Aktiver Hund für die ganze App: löst die gespeicherte Auswahl gegen die
// geladene Hundeliste auf. Ohne (gültige) Auswahl gilt der erste Hund.
export function useActiveDog<T extends { id: string }>(dogs: readonly T[]): {
  activeDog: T | null;
  activeDogId: string | null;
  setActiveDog: (dogId: string) => void;
} {
  const { session } = useSession();
  const stored = useStoredActiveDogId(session?.user.id);
  const activeDogId = resolveActiveDogId(stored, dogs);
  const activeDog = useMemo(() => dogs.find(d => d.id === activeDogId) ?? null, [dogs, activeDogId]);
  return { activeDog, activeDogId, setActiveDog: setActiveDogId };
}
