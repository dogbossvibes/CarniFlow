import { useCoachWeek } from '@/features/ai/hooks/useCoachWeek';
import { CoachWeekCard } from '@/features/ai/components/CoachWeekCard';
import type { Dog } from '@/types';

// Coach PR B: Block «Coach · deine Woche» im Hundeprofil. Nur für eigene Hunde;
// ausgeblendet, wenn die Person den Coach im Profil ausgeschaltet hat (Coach-Bildschirm
// zeigt ihn weiter und kann ihn wieder einblenden).
export function DogCoachWeekPanel({ dog, isPro, onUpgrade }: {
  dog: Pick<Dog, 'id' | 'owner_id' | 'birth_date' | 'discipline' | 'gender'>;
  isPro: boolean;
  onUpgrade?: () => void;
}) {
  const c = useCoachWeek(dog, isPro);
  if (!c.own || c.prefs.hiddenInProfile) return null;
  return (
    <CoachWeekCard
      week={c.week}
      isPro={isPro}
      isLoading={c.isLoading}
      disabledCount={c.prefs.disabledRules[dog.id]?.length ?? 0}
      onDismiss={key => { void c.dismiss(key); }}
      onDisableRule={rule => { void c.setRule(rule, false); }}
      onEnableAll={() => { void c.enableAllRules(); }}
      onHideInProfile={() => { void c.setHiddenInProfile(true); }}
      onUpgrade={onUpgrade}
    />
  );
}
