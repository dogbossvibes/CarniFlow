import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { useAiCoach } from '@/features/ai/hooks/useAiCoach';
import { listConnections } from '@/services/connectionService';
import { getSharedPlans } from '@/services/trainingPlanService';
import { getConversations } from '@/services/chatService';
import type { DogAiTip, DogTrainer } from '@/components/dogs/types';
import type { DogHubDynamic } from '@/features/dogs/buildDogHubVM';

// Liefert die „dynamischen" Hub-Daten aus echten Quellen:
//   • KI-Coach-Empfehlung (useAiCoach → CoachRecommendation)
//   • Trainer (connections + geteilter Plan + letzter Chat-Kommentar)
// Fehlt etwas, bleibt es null → die UI zeigt Fallback/Leerzustand.
export function useDogHubDynamic(dogId?: string): DogHubDynamic {
  const { session } = useSession();
  const uid = session?.user.id;
  const coach = useAiCoach(dogId);
  const [trainer, setTrainer] = useState<DogTrainer | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!uid) { if (active) setTrainer(null); return; }
      try {
        const conns = await listConnections(uid);
        // Als Hundebesitzer ist man owner_user_id; Gegenpart ist die Trainer:in.
        const link = conns.find(c => c.myRole === 'owner' && c.status === 'accepted');
        if (!link) { if (active) setTrainer(null); return; }
        const [plans, convs] = await Promise.all([
          getSharedPlans(uid).catch(() => []),
          getConversations(uid).catch(() => []),
        ]);
        const conv = convs.find(c => c.counterpartId === link.counterpartId);
        if (active) setTrainer({
          name:        link.counterpartName ?? 'Trainer',
          plan:        plans[0]?.title ?? null,
          lastComment: conv?.lastPreview ?? null,
        });
      } catch { if (active) setTrainer(null); }
    })();
    return () => { active = false; };
  }, [uid]);

  const recs = coach.data.recommendations ?? [];
  const aiTip: DogAiTip | null = recs.length
    ? { title: recs[0].title, hint: recs[0].message, recommendation: recs[1]?.message ?? null }
    : null;

  return { aiTip, todayRecommendation: recs[0]?.message ?? null, trainer };
}
