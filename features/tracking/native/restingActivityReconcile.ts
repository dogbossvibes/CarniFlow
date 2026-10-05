import { Platform } from 'react-native';
import {
  endLegacyRestingActivities, endRestingActivityById, isRestingActivityModuleAvailable, listRestingActivities,
  type RestingActivityInfo,
} from '@/modules/anyvo-resting-activity';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import type { ActiveFaehrte } from '@/features/tracking/store/activeFaehrtenModel';
import { startLiegezeitActivity, type LiegezeitActivityLabels } from '@/features/tracking/native/liegezeitLiveActivity';

// ──────────────────────────────────────────────────────────────────────────
// Rehydration der Liegezeit-Live-Activities (App-Start / Rückkehr in den Vordergrund).
// Source of Truth ist ausschliesslich die Active-Track-Registry — die Activity folgt ihr:
//   A  offene Liegezeit + passende Activity (dogId + sessionId)  → behalten
//   B  offene Liegezeit ohne Activity                             → neu anlegen, NUR mit eindeutigem
//                                                                   Beleg (eigener Hund, sessionId, Liegezeit-Beginn)
//   C  Activity, aber Fährte nicht (mehr) in der Liegezeit         → beenden
//   D  Activity mit dogId/sessionId, die nicht zur Registry passt → beenden (nie umhängen)
//   E  mehrere Hunde                                              → jeder Eintrag unabhängig
// V1-Liegezeit-Activities (ohne dogId) werden nie zugeordnet, sondern beendet; offene
// Liegezeiten bekommen danach über B ihre V2-Activity.
// ──────────────────────────────────────────────────────────────────────────

export interface RestingActivityPlan {
  keep: string[];
  end: string[];
  start: { dogId: string; sessionId: string; startedAt: number }[];
}

const isOpenResting = (e: ActiveFaehrte | undefined): e is ActiveFaehrte & { sessionId: string } =>
  !!e && e.status === 'resting' && !!e.sessionId;

/** Reine Entscheidung (testbar). `ownDogIds = null` → Hunde unbekannt → nichts neu anlegen. */
export function planRestingActivities(
  activities: RestingActivityInfo[],
  registry: Record<string, ActiveFaehrte>,
  ownDogIds: string[] | null,
): RestingActivityPlan {
  const plan: RestingActivityPlan = { keep: [], end: [], start: [] };
  const covered = new Set<string>();
  for (const a of activities) {
    const entry = registry[a.dogId];
    const k = `${a.dogId}\u0000${a.sessionId}`;
    if (isOpenResting(entry) && entry.dogId === a.dogId && entry.sessionId === a.sessionId && !covered.has(k)) {
      plan.keep.push(a.activityId);   // A (Duplikate derselben Fährte → beenden)
      covered.add(k);
    } else {
      plan.end.push(a.activityId);    // C / D / Duplikat
    }
  }
  if (ownDogIds) {
    for (const entry of Object.values(registry)) {
      if (!isOpenResting(entry) || entry.layStartedAt == null || !ownDogIds.includes(entry.dogId)) continue;
      if (covered.has(`${entry.dogId}\u0000${entry.sessionId}`)) continue;
      plan.start.push({ dogId: entry.dogId, sessionId: entry.sessionId, startedAt: entry.layStartedAt });   // B
    }
  }
  return plan;
}

/** Abgleich ausführen (iOS + V2-Modul, sonst no-op). Wirft nie. */
export async function reconcileRestingActivities(input: {
  ownDogs: { id: string; name?: string | null }[] | null;
  labels: LiegezeitActivityLabels;
}): Promise<RestingActivityPlan | null> {
  if (Platform.OS !== 'ios' || !isRestingActivityModuleAvailable()) return null;
  try {
    await endLegacyRestingActivities();
    const plan = planRestingActivities(
      listRestingActivities(), useActiveFaehrten.getState().byDog, input.ownDogs?.map(d => d.id) ?? null,
    );
    for (const id of plan.end) await endRestingActivityById(id);
    for (const s of plan.start) {
      const name = input.ownDogs?.find(d => d.id === s.dogId)?.name ?? null;
      startLiegezeitActivity({ dogId: s.dogId, sessionId: s.sessionId, dogName: name, startedAt: s.startedAt }, input.labels);
    }
    return plan;
  } catch (e) {
    if (__DEV__) console.warn('[restingActivityReconcile]', e);
    return null;
  }
}
