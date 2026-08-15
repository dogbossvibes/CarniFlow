import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { getActiveTrialOffer, buyActiveTrial } from '@/lib/purchases';
import { PRODUCT_IDS, type SubscriptionPlan } from '@/features/subscription/plans';
import { activatePlan } from '@/services/subscriptionService';
import {
  getActiveTrialStatus, markActiveTrialOffered, markActiveTrialStarted, logActiveTrialEvent,
} from '@/services/activeTrialService';
import {
  evaluateActiveTrialEligibility, shouldProactivelyShowOffer, displayTrialDays,
  ACTIVE_TRIAL_EVENTS, type ActiveTrialIneligibleReason,
} from '@/features/subscription/activeTrial';

export interface StartTrialResult { ok: boolean; cancelled?: boolean; error?: string }

// Bündelt Capability-, Trainings-, Konto-, Server-Status- und Store-Angebotsdaten
// zur ANYVO-internen ACTIVE-Trial-Eligibility. Der Store/RevenueCat bleibt die
// Quelle der Wahrheit für die tatsächliche Trial-Verfügbarkeit und -Abrechnung.
export function useActiveTrialOffer() {
  const { session } = useSession();
  const uid = session?.user?.id;
  const createdAt = session?.user?.created_at ?? null;
  const caps = useCapabilities();
  const { feed } = useTrainingFeed();
  const qc = useQueryClient();

  const offerQ = useQuery({
    queryKey: ['activeTrialOffer'],
    enabled:  !!uid,
    queryFn:  getActiveTrialOffer,
    staleTime: 5 * 60 * 1000,
  });
  const statusQ = useQuery({
    queryKey: ['activeTrialStatus', uid],
    enabled:  !!uid,
    queryFn:  () => getActiveTrialStatus(uid!),
  });

  const offer = offerQ.data ?? null;
  const status = statusQ.data ?? { offeredAt: null, startedAt: null, platform: null, offerCount: 0 };

  const effectivePlan: SubscriptionPlan = caps.isTrainerModule ? 'trainer' : caps.isPro ? 'active' : 'newbie';
  const accountAgeMs = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;

  const eligibility = evaluateActiveTrialEligibility({
    effectivePlan,
    isPro:                  caps.isPro,
    isTrainer:              caps.isTrainerModule,
    hasLifetime:            caps.hasLifetimeAccess,
    completedTrainingCount: feed.length,     // abgeschlossene, dokumentierte Einheiten
    accountAgeMs,
    trialAlreadyStarted:    !!status.startedAt,
    storeOfferAvailable:    !!offer?.available,
  });

  const shouldShowProactively = shouldProactivelyShowOffer({
    eligible:        eligibility.eligible,
    offerCount:      status.offerCount,
    lastOfferedAtMs: status.offeredAt ? new Date(status.offeredAt).getTime() : null,
    nowMs:           Date.now(),
  });

  // Angebot wurde angezeigt → serverseitig markieren (Frequency-Capping + Funnel).
  const markShown = useCallback(async () => {
    if (!uid) return;
    logActiveTrialEvent(ACTIVE_TRIAL_EVENTS.offerShown, { platform: Platform.OS });
    await markActiveTrialOffered(uid);
    await qc.invalidateQueries({ queryKey: ['activeTrialStatus', uid] });
  }, [uid, qc]);

  // „Später": KEINEN Trial starten, KEINE Subscription erzeugen, Eligibility NICHT
  // verbrauchen. Nur Funnel-Event; das Cooldown steuert die Wiedervorlage.
  const dismissLater = useCallback(async () => {
    logActiveTrialEvent(ACTIVE_TRIAL_EVENTS.later);
  }, []);

  // Trial starten: echter Store-Purchase (Introductory Offer). Bei Erfolg werden die
  // ACTIVE-Capabilities über die BESTEHENDE Subscription-Architektur aktiviert und der
  // Start serverseitig (plattformübergreifend, idempotent) markiert.
  const startTrial = useCallback(async (): Promise<StartTrialResult> => {
    if (!uid) return { ok: false, error: 'no_user' };
    const res = await buyActiveTrial();
    if (res.cancelled) return { ok: false, cancelled: true };
    if (!res.ok) {
      logActiveTrialEvent(ACTIVE_TRIAL_EVENTS.purchaseFailed, { error: res.error ?? null });
      return { ok: false, error: res.error };
    }
    await activatePlan({
      userId: uid, plan: 'active', status: 'active',
      periodEndsAt: res.expiration ?? null, providerProductId: PRODUCT_IDS.activeMonthly,
    });
    await markActiveTrialStarted(uid, Platform.OS);
    logActiveTrialEvent(ACTIVE_TRIAL_EVENTS.started, { platform: Platform.OS });
    await Promise.all([
      caps.refresh(),
      qc.invalidateQueries({ queryKey: ['activeTrialStatus', uid] }),
      qc.invalidateQueries({ queryKey: ['activeTrialOffer'] }),
    ]);
    return { ok: true };
  }, [uid, caps, qc]);

  return {
    loading:      caps.loading || offerQ.isPending || statusQ.isPending,
    eligible:     eligibility.eligible,
    reason:       eligibility.reason as ActiveTrialIneligibleReason | null,
    offer,
    trialDays:    displayTrialDays(offer),
    priceString:  offer?.priceString ?? null,
    period:       offer?.period ?? 'month',
    shouldShowProactively,
    markShown,
    dismissLater,
    startTrial,
    refresh:      () => { void offerQ.refetch(); void statusQ.refetch(); },
  };
}
