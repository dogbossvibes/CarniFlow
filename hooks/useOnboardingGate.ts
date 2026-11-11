import { useEffect, useState } from 'react';
import { getDogs } from '@/services/dogs';
import { useHelpSeenState } from '@/stores/helpSeen';
import {
  completeOnboarding,
  resolveOnboardingGate,
  useOnboardingState,
  type DogCountProbe,
  type OnboardingGate,
} from '@/stores/onboarding';

// Obergrenze für die Hunde-Abfrage. Läuft sie ab (z. B. offline im Feld), wird
// die Einführung NICHT gezeigt und der Start nicht weiter aufgehalten.
export const ONBOARDING_DOG_PROBE_TIMEOUT_MS = 2500;

// Entscheidet beim Betreten der Tabs, ob die Einführung gezeigt wird. Die
// Hunde-Abfrage läuft nur, wenn weder der Erledigt-Merker noch die lokale
// Hilfe-Historie die Frage schon beantworten — bestehende Installationen
// starten also ohne zusätzliche Netzabfrage.
export function useOnboardingGate(userId: string | null | undefined): { gate: OnboardingGate; pushDeclined: boolean } {
  const ob = useOnboardingState(userId);
  const help = useHelpSeenState(userId);
  const homeHelpSeen = help.seen.includes('home');
  const [probe, setProbe] = useState<{ uid: string; dogs: DogCountProbe } | null>(null);

  const needsProbe = !!userId && ob.hydrated && !ob.done && help.hydrated && !homeHelpSeen;

  useEffect(() => {
    if (!needsProbe || !userId) return;
    let active = true;
    const settle = (dogs: DogCountProbe) => { if (active) { active = false; setProbe({ uid: userId, dogs }); } };
    const timer = setTimeout(() => settle('error'), ONBOARDING_DOG_PROBE_TIMEOUT_MS);
    (async () => {
      try {
        const { data, error } = await getDogs(userId);
        settle(error ? 'error' : (data?.length ?? 0));
      } catch {
        settle('error');
      }
    })();
    return () => { active = false; clearTimeout(timer); };
  }, [needsProbe, userId]);

  const dogs: DogCountProbe = probe && probe.uid === userId ? probe.dogs : 'unknown';

  const gate = resolveOnboardingGate({
    hydrated: ob.hydrated,
    done: ob.done,
    helpHydrated: help.hydrated,
    homeHelpSeen,
    dogs,
  });

  // Sicher „nicht nötig" (Hilfe schon gesehen oder Hunde vorhanden) → merken,
  // damit künftige Starts nichts mehr prüfen. Ein Ladefehler wird NICHT gemerkt.
  const settled = ob.hydrated && !ob.done && help.hydrated
    && (homeHelpSeen || (typeof dogs === 'number' && dogs > 0));
  useEffect(() => { if (settled) completeOnboarding(); }, [settled]);

  return { gate: userId ? gate : 'skip', pushDeclined: ob.pushDeclined };
}
