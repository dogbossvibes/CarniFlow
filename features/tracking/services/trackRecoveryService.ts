// Lifecycle-Recovery einer gelegten Fährte (I/O-Teil). Die Entscheidung liegt rein in
// store/trackRecovery.ts. Dieser Service liest nur lokal (AsyncStorage + SQLite),
// schreibt höchstens den hundebasierten Pending-Slot, die Aktive-Fährten-Registry und
// den lokalen Lifecycle-Marker in payload_json. KEINE neue training_session, KEIN
// Quota-Claim, KEIN Remote-Write, kein erfundener Suchlauf, keine Änderung an
// Punkten/Markern/Suchläufen. Funktioniert offline.
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { clearPending, listPendingDogIds, loadPending, writePendingNow } from '@/features/tracking/store/trackPersist';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import {
  decideTrackRecovery, durableLifecycle, selfHealPatches, type LocalSessionSnapshot, type RecoveryDecision,
} from '@/features/tracking/store/trackRecovery';
import {
  getLocalTrainingSessionById, markLocalTrackCancelled, setLocalTrackLifecycle,
} from '@/features/training/repositories/localTrainingRepository';
import { endLiegezeitNotification } from '@/features/tracking/native/liegezeitNotification';
import {
  getLayTrackPointsBySession, getSearchPointsBySession, getTrackMarkersBySession,
} from '@/features/tracking/repositories/localTrackRepository';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';

export interface TrackRecoveryArgs {
  sessionId: string;
  dogId: string | null | undefined;
  /** Remote belegter Suchlauf (track_runs) aus dem bereits geladenen Detail. */
  hasRemoteSearchRun?: boolean;
  userId?: string | null;
}

async function ensureHydrated(): Promise<void> {
  if (!useActiveFaehrten.getState().hydrated) await useActiveFaehrten.getState().hydrate();
}

async function loadLocalSnapshot(sessionId: string): Promise<LocalSessionSnapshot | null> {
  const session = await getLocalTrainingSessionById(sessionId).catch(() => null);
  if (!session) return null;
  const [layPoints, markers, searchPoints] = await Promise.all([
    getLayTrackPointsBySession(sessionId).catch(() => []),
    getTrackMarkersBySession(sessionId).catch(() => []),
    getSearchPointsBySession(sessionId).catch(() => []),
  ]);
  return { session, layPoints, markers, searchPointCount: searchPoints.length };
}

/** Nur prüfen (keine Schreibzugriffe) — für die Sichtbarkeit von „Fährte fortsetzen". */
export async function evaluateTrackRecovery(args: TrackRecoveryArgs): Promise<RecoveryDecision> {
  try {
    await ensureHydrated();
    if (!args.dogId) return { ok: false, reason: 'no_dog' };
    const [pending, local] = await Promise.all([
      loadPending(args.dogId).catch(() => null),
      loadLocalSnapshot(args.sessionId),
    ]);
    return decideTrackRecovery({
      registry: useActiveFaehrten.getState().byDog,
      dogId: args.dogId, sessionId: args.sessionId, pending, local,
      userId: args.userId, hasRemoteSearchRun: args.hasRemoteSearchRun, now: Date.now(),
    });
  } catch (e) {
    console.warn('[trackRecovery] evaluate', e);
    return { ok: false, reason: 'unknown_session' };
  }
}

/**
 * Recovery ausführen: ggf. Pending rekonstruieren, Registry reparieren, Ziel-Route
 * liefern. Idempotent: ein zweiter Aufruf findet die Registry bereits korrekt.
 */
export async function applyTrackRecovery(args: TrackRecoveryArgs): Promise<RecoveryDecision> {
  const d = await evaluateTrackRecovery(args);
  if (!d.ok || !args.dogId) return d;
  const dogId = args.dogId;
  if (d.pendingToWrite) await writePendingNow(dogId, d.pendingToWrite);
  if (d.registryPatch) useActiveFaehrten.getState().upsert(dogId, d.registryPatch);
  // Hält der Aufnahme-Store für DIESEN Hund noch eine andere (geschlossene) Session,
  // würde der Liegezeit-Screen sie fälschlich als „bereits geladen" übernehmen.
  const st = useTrackingStore.getState();
  if (st.dogId === dogId && st.currentSessionId !== args.sessionId && !st.isRecording) {
    const p: PendingTrack | null = d.pendingToWrite ?? await loadPending(dogId).catch(() => null);
    if (p && p.sessionId === args.sessionId) st.restorePending(p);
  }
  return d;
}

/**
 * Bewussten Abbruch einer gelegten Fährte dauerhaft lokal vermerken (SQLite,
 * payload_json). Best-effort, offline, nie werfend — der Abbruch-Flow wird davon
 * nicht blockiert. Ohne sessionId/dogId (Legacy/offline ohne Session) nichts zu tun.
 */
export async function recordTrackCancelled(sessionId: string | null | undefined, dogId: string | null | undefined): Promise<boolean> {
  if (!sessionId || !dogId) return false;
  try { return await markLocalTrackCancelled(sessionId, dogId); }
  catch (e) { console.warn('[trackRecovery] cancel marker', e); return false; }
}

export type CompleteWithoutAppResult = { ok: true } | { ok: false; reason: 'no_session' | 'not_found' | 'failed' };

/**
 * „Ohne App abgeschlossen": die Fährte wurde ohne ANYVO abgesucht. Setzt den dauerhaften
 * lokalen Lifecycle-Marker 'completed_without_app' (offline, payload_json, gemerged) und
 * räumt danach NUR die offenen Zustände DIESER Session auf (Registry-Eintrag, Pending-
 * Puffer, ggf. Aufnahme-Store + Liegezeit-Anzeige). Erzeugt keinen Suchlauf, keine
 * Suchpunkte, keinen Score, kein End-/Voice-Event. Journal-Session, Karte, Punkte,
 * Marker und Bewertung bleiben. Idempotent. Ohne erfolgreichen Marker wird nichts
 * aufgeräumt (sonst könnte die Recovery die Fährte später wieder anbieten).
 */
export async function completeTrackWithoutApp(sessionId: string | null | undefined, dogId: string | null | undefined): Promise<CompleteWithoutAppResult> {
  if (!sessionId || !dogId) return { ok: false, reason: 'no_session' };
  try {
    const marked = await setLocalTrackLifecycle(sessionId, dogId, 'completed_without_app');
    if (!marked) return { ok: false, reason: 'not_found' };
    await ensureHydrated();
    if (useActiveFaehrten.getState().get(dogId)?.sessionId === sessionId) useActiveFaehrten.getState().remove(dogId);
    const pending = await loadPending(dogId).catch(() => null);
    if (pending?.sessionId === sessionId) await clearPending(dogId);
    const st = useTrackingStore.getState();
    if (st.dogId === dogId && st.currentSessionId === sessionId && !st.isRecording) {
      st.reset();   // leert nur diesen (bereits geräumten) Hunde-Slot
      void endLiegezeitNotification().catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    console.warn('[trackRecovery] complete without app', e);
    return { ok: false, reason: 'failed' };
  }
}

/** Sessions der Puffer mit dauerhaftem lokalem Lifecycle-Abschluss (Abbruch / ohne App). */
async function closedSessionIds(pendings: readonly PendingTrack[]): Promise<Set<string>> {
  const ids = pendings.map(p => p.sessionId).filter((id): id is string => !!id);
  const rows = await Promise.all(ids.map(id => getLocalTrainingSessionById(id).catch(() => null)));
  return new Set(ids.filter((_, i) => durableLifecycle(rows[i]) != null));
}

/**
 * Selbstheilung: offene, liegende Pending-Puffer ohne Registry-Eintrag wieder
 * registrieren — AUSSCHLIESSLICH für Hunde des angemeldeten Nutzers
 * (`currentUserDogIds`, aus dem bestehenden useDogs()). Öffnet nichts automatisch.
 */
export async function healActiveFaehrtenFromPending(currentUserDogIds: readonly string[]): Promise<number> {
  try {
    if (currentUserDogIds.length === 0) return 0;
    await ensureHydrated();
    const allowed = new Set(currentUserDogIds);
    // Fremde Slots (anderer/alter Account auf demselben Gerät) werden gar nicht erst geladen.
    const ids = (await listPendingDogIds()).filter(id => allowed.has(id));
    const pendings = (await Promise.all(ids.map(id => loadPending(id).catch(() => null))))
      .filter((p): p is PendingTrack => !!p);
    const closed = await closedSessionIds(pendings);
    const patches = selfHealPatches(useActiveFaehrten.getState().byDog, pendings, Date.now(), currentUserDogIds, closed);
    for (const { dogId, patch } of patches) useActiveFaehrten.getState().upsert(dogId, patch);
    return patches.length;
  } catch (e) {
    console.warn('[trackRecovery] self-heal', e);
    return 0;
  }
}
