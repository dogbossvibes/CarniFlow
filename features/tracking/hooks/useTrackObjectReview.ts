import { isReviewIntent, localAutoObjectsFromRun } from '../services/objectReview/localIntent';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { updateSyncCounts } from '@/features/sync/services/syncEngine';
import { useSession } from '@/lib/session-context';
import { cachedReview, pendingReview } from '../services/objectReview/repository';
import { acceptCurrentReview, initializeObjectReview, queueObjectChanges, readObjectReview, syncObjectReviews, queueAutoDetectionIntent, resolveAutoDetectionIntent } from '../services/objectReview/service';
import type { ObjectChange, ObjectReview, ReviewKey, ReviewOperation } from '../services/objectReview/model';

interface ReviewState { key: string; review: ObjectReview | null; pending: ReviewOperation | null; error: unknown; busy: boolean }
export function useTrackObjectReview(input: { sessionId?: string; dogId?: string; runId?: string; ownerId?: string; localRun?: unknown }) {
  const { user } = useSession();
  const identity = user?.id && input.ownerId === user.id && input.sessionId && input.dogId && input.runId
    ? JSON.stringify([user.id, input.sessionId, input.dogId, input.runId]) : '';
  const key = useMemo<ReviewKey | null>(() => {
    if (!identity) return null;
    const [ownerId, sessionId, dogId, runId] = JSON.parse(identity) as string[];
    return { ownerId, sessionId, dogId, runId };
  }, [identity]);
  const active = useRef(identity); active.current = identity;
  const generation = useRef(0);
  const [state, setState] = useState<ReviewState>({ key: '', review: null, pending: null, error: null, busy: false });
  const busy = useRef(false);
  const operate = useCallback(async (action?: () => Promise<unknown>, readRemote = true) => {
    if (!key || busy.current) return;
    busy.current = true;
    const token = ++generation.current;
    const valid = () => active.current === identity && generation.current === token;
    const patch = (p: Partial<ReviewState>) => { if (valid()) setState(s => ({ ...(s.key === identity ? s : { key: identity, review: null, pending: null, error: null, busy: false }), ...p })); };
    patch({ busy: true, error: null });
    try {
      const [review, pending] = await Promise.all([cachedReview(key), pendingReview(key)]);
      if (!valid()) return;
      patch({ review, pending });
      if (action) { await action(); if (!valid()) return; patch({ pending: await pendingReview(key) }); }
      if (readRemote) {
        await syncObjectReviews(); if (!valid()) return;
        try { await readObjectReview(key); } catch (error) { patch({ error }); }
      }
      const [latest, operation] = await Promise.all([cachedReview(key), pendingReview(key)]);
      patch({ review: latest, pending: operation });
    } catch (error) { patch({ error }); }
    finally { void updateSyncCounts().catch(() => {}); if (valid()) { busy.current = false; patch({ busy: false }); } }
  }, [identity, key]);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    busy.current = false;
    void operate();
    const sub = AppState.addEventListener('change', value => { if (value === 'active') void operate(); });
    return () => { invalidate(); sub.remove(); };
  }, [operate, invalidate]);
  const visible: Omit<ReviewState, 'key'> = state.key === identity ? state : { review: null, pending: null, error: null, busy: false };
  const intent = visible.pending && isReviewIntent(visible.pending.request) ? visible.pending.request : null;
  const localAutoObjects = key ? intent?.localAutoObjects ?? localAutoObjectsFromRun(input.localRun, key) : [];
  return { ...visible, available: !!key, contextKey: identity, localAutoObjects,
    queueAutoIntent: async (objectId: string): Promise<boolean> => {
      let queued = false;
      await operate(async () => { await queueAutoDetectionIntent(key!, localAutoObjects, objectId); queued = true; }, false);
      return queued;
    },
    resolveIntent: async (targets: Record<string, string>, expectedRevision: number): Promise<boolean> => {
      let queued = false;
      if (intent) await operate(async () => { await resolveAutoDetectionIntent(intent, expectedRevision, targets); queued = true; });
      return queued;
    },
    refresh: () => operate(),
    initialize: () => operate(() => initializeObjectReview(key!)),
    save: async (changes: ObjectChange[], expectedRevision: number): Promise<boolean> => {
      let queued = false;
      await operate(async () => { await queueObjectChanges(key!, expectedRevision, changes); queued = true; });
      return queued;
    },
    acceptCurrent: () => visible.pending ? operate(() => acceptCurrentReview(visible.pending!.request)) : Promise.resolve(),
  };
}
export type TrackObjectReviewController = ReturnType<typeof useTrackObjectReview>;
