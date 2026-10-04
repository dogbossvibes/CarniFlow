import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import type { AngleKind, MarkerMaterial, MarkerSample, MarkerType, SessionStatus, TrackPointSample } from '@/features/tracking/store/trackingStore';
import {
  type ActiveFaehrte, type ActiveFaehrtenMap, isValidEntry, reopenTarget, upsertEntry,
} from '@/features/tracking/store/activeFaehrtenModel';
import { coerceTrackSegments } from '@/features/tracking/utils/trackSegments';
import type { LocalTrackMarker, LocalTrackPoint, LocalTrainingSession } from '@/features/sync/types/sync';

/** Lokaler Lifecycle-Hinweis einer Fährte in payload_json (nur lokal, der Remote-Sync liest ihn nicht). */
export const TRACK_LIFECYCLE_KEY = 'trackLifecycleStatus';
export const TRACK_LIFECYCLE_UPDATED_KEY = 'trackLifecycleUpdatedAt';
/** Wodurch der Abschluss gesetzt wurde (nur Diagnose; ändert keine Entscheidung). */
export const TRACK_LIFECYCLE_SOURCE_KEY = 'trackLifecycleSource';
/** Endgültige, vom Nutzer gesetzte lokale Lifecycle-Abschlüsse. */
export type TrackLifecycleStatus = 'cancelled' | 'completed_without_app';
/**
 * Bewusster Nutzer-Abbruch — genau zwei Stellen setzen den Marker 'cancelled':
 *   'resting_abort' Liegezeit-Screen „Fährte abbrechen" (liegen.tsx)
 *   'lay_conflict'  Konfliktdialog beim Legen „bestehende Fährte beenden" (legen.tsx)
 */
export type TrackCancelSource = 'resting_abort' | 'lay_conflict';

// ──────────────────────────────────────────────────────────────────────────
// Recovery einer gelegten, noch nicht abgesuchten Fährte — REINE, testbare Logik.
//
// Zwei Ebenen, beide ohne neue Session, ohne Quota-Claim, ohne neue Geometrie:
//   A) Pending-Puffer (anyvo_track_pending_v1::<dogId>) vorhanden
//      → nur die Aktive-Fährten-Registry reparieren.
//   B) Pending-Puffer fehlt
//      → aus der lokal gespeicherten Lege-Session (SQLite: Session-Zeile, gelegte
//        Punkte, Marker) einen PendingTrack-kompatiblen Snapshot 1:1 übernehmen.
//
// Priorität der Quellen: 1) gültiger Registry-Eintrag, 2) gültiger Pending-Puffer,
// 3) lokale SQLite-Session. Remote wird nie vorausgesetzt (offline-fähig). Ein
// dauerhafter lokaler Lifecycle-Marker (Abbruch / „Ohne App abgeschlossen") sperrt
// JEDE Quelle — Nutzerabsicht hat Vorrang.
//
// Lifecycle-Abdeckung:
//   resting/laid → Liegezeit (/track/liegen), aus Registry, Puffer oder SQLite.
//   searching    → bestehende Search-Recovery in run.tsx (decideRecovery/resumeSearch),
//                  NUR aus Registry/Puffer — eine Absuche wird nie aus SQLite rekonstruiert.
//   laying       → NICHT freigegeben: der Recorder (useTrackRecorder) kann seinen
//                  internen Zustand (Punkte/Distanz/Winkel-Confirmer) nicht aus dem Puffer
//                  wiederaufnehmen; das ginge nur über Recorder-Änderungen.
//
// Wichtig: `local_training_sessions.status = 'completed'` beweist NICHT, dass der
// Fährtenprozess abgeschlossen ist — useTrackRecorder.finish() finalisiert die
// Session bereits am Ende des LEGENS als 'completed', während die Fährte in die
// Liegezeit ('resting') geht. Den Abschluss belegt erst ein Suchlauf
// (payload_json.run lokal bzw. track_runs remote). Das globale Status-Modell
// bleibt unverändert; die Unterscheidung gilt nur hier.
// ──────────────────────────────────────────────────────────────────────────

/** Mindestanzahl gelegter Punkte für eine verwertbare Fährte (Start + mindestens ein weiterer). */
export const MIN_LAY_POINTS = 2;

/** Pending-Status, die als offen wiederherstellbar gelten. Fehlt der Status (Legacy) → 'resting'. */
const RECOVERABLE_PENDING: SessionStatus[] = ['laid', 'resting', 'searching'];
/** Nur diese werden beim App-Start selbstheilend registriert (keine Auto-Navigation in eine Absuche). */
const SELF_HEAL_PENDING: SessionStatus[] = ['laid', 'resting'];

export type RecoveryRejectReason =
  | 'no_dog' | 'no_session'
  | 'other_active'      // Registry hält für diesen Hund eine ANDERE offene Fährte
  | 'other_pending'     // Pending-Slot des Hundes hält eine ANDERE offene Fährte
  | 'pending_closed'    // Pending derselben Session ist 'cancelled'/'completed'/'laying'
  | 'unknown_session'   // lokal keine Session-Zeile
  | 'deleted' | 'not_track' | 'wrong_dog' | 'wrong_user' | 'cancelled'
  | 'lay_not_finished'  // Lege-Ende nicht belegt (ended_at fehlt)
  | 'search_completed'  // Suchlauf vorhanden → Fährte ist abgeschlossen
  | 'search_started'    // Suchpunkte ohne Lauf → Zustand nicht eindeutig
  | 'completed_without_app'   // dauerhaft „Ohne App abgeschlossen"
  | 'laying_not_supported'    // unterbrochenes Legen: Recorder kann nicht wiederaufnehmen
  | 'no_geometry';

/** Lifecycle-Phase, in die fortgesetzt wird. */
export type RecoveryMode = 'resting' | 'searching';

export type RecoverySource = 'registry' | 'pending' | 'session';

export type RecoveryDecision =
  | {
      ok: true;
      source: RecoverySource;
      mode: RecoveryMode;
      /** Patch für die Registry (null = Registry ist bereits korrekt). */
      registryPatch: Partial<ActiveFaehrte> | null;
      /** Zu schreibender Pending-Snapshot (null = vorhandener Puffer wird genutzt). */
      pendingToWrite: PendingTrack | null;
      /** Ziel-Route über das bestehende reopenTarget(). */
      target: string;
    }
  | { ok: false; reason: RecoveryRejectReason; detail?: RecoveryRejectDetail };

/** Diagnose zu einem dauerhaften Lifecycle-Abschluss (wodurch/wann) — nur Anzeige im QA-Modus. */
export interface RecoveryRejectDetail {
  lifecycleSource: string | null;
  lifecycleAt: string | null;
}

export interface LocalSessionSnapshot {
  session: LocalTrainingSession;
  layPoints: LocalTrackPoint[];
  markers: LocalTrackMarker[];
  searchPointCount: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function pendingStatus(p: PendingTrack): SessionStatus {
  return p.status ?? 'resting';
}

export function hasValidLayGeometry(points: readonly { lat: number; lng: number }[] | null | undefined): boolean {
  if (!points || points.length < MIN_LAY_POINTS) return false;
  return points.every(p => isNum(p.lat) && isNum(p.lng));
}

/** Pending ist eindeutig offen und besitzt eine verwertbare gelegte Geometrie. */
export function isOpenPending(p: PendingTrack | null | undefined): p is PendingTrack {
  return !!p && RECOVERABLE_PENDING.includes(pendingStatus(p)) && hasValidLayGeometry(p.trackPoints);
}

/** Registry-Patch aus einem Pending (keine neue Session, Kennzahlen 1:1). */
export function registryPatchFromPending(p: PendingTrack, now: number): Partial<ActiveFaehrte> {
  const status = pendingStatus(p);
  return {
    sessionId:       p.sessionId,
    runId:           p.runId ?? null,
    status:          status === 'laid' ? 'resting' : status,
    paused:          !!p.paused,
    startedAt:       p.trackPoints[0]?.t ?? null,
    // Liegezeit-Basis nur aus persistierten Werten — keine erfundene Uhrzeit.
    layStartedAt:    p.layStartedAt ?? p.layFinishedAt ?? null,
    searchStartedAt: p.searchStartedAt ?? null,
    distanceMeters:  p.distanceMeters ?? 0,
    winkelCount:     p.markers.filter(m => m.type === 'winkel').length,
    objektCount:     p.markers.filter(m => m.type === 'gegenstand').length,
    updatedAt:       now,
  };
}

function parseObj(json: string | null | undefined): Record<string, any> | null {
  if (!json) return null;
  try { const v = JSON.parse(json); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/**
 * Gibt es einen TATSÄCHLICH final abgeschlossenen Suchlauf? Nur der darf Recovery blockieren.
 * Nach dem aktuellen Datenmodell:
 *   • `track_data.run` (lokal payload_json.run bzw. remote training_sessions.track_data.run)
 *     entsteht ausschliesslich beim Beenden der Absuche (run.tsx handleFinish/endSearch →
 *     finalizeLocalTrackRun) → final, auch mit 0 m Suchspur (Nutzer hat beendet).
 *   • remote `track_runs`-Zeile: nur final mit `ended_at`. Eine Zeile OHNE `ended_at`
 *     stammt aus dem alten Startpfad (startTrackRun legte sie beim START an) → unvollständig,
 *     blockiert nicht.
 * Bewusst getrennt von trackAnalysisState.hasSearchRun (Analyse-Anzeige bleibt unverändert).
 */
export function hasFinalSearchRun(data: { track_data?: { run?: unknown; [key: string]: unknown } | null; runs?: unknown[] | null } | null | undefined): boolean {
  if (!data) return false;
  if (data.track_data?.run) return true;
  return Array.isArray(data.runs) && data.runs.some(r => !!r && typeof r === 'object' && (r as { ended_at?: unknown }).ended_at != null);
}

/**
 * Darf „Ohne App abgeschlossen" angeboten werden? Immer, wenn Fortsetzen möglich ist —
 * zusätzlich bei `search_started`: eigene, nicht final abgeschlossene Fährte mit begonnener
 * Absuche, die nicht eindeutig fortsetzbar ist (keine Rekonstruktion einer Absuche aus SQLite).
 * Schliessen erfindet nichts und ist damit auch dann sicher.
 */
export function canCompleteWithoutApp(d: RecoveryDecision): boolean {
  return d.ok || d.reason === 'search_started';
}

/** Quelle/Zeitpunkt eines dauerhaften Lifecycle-Abschlusses (Altbestand ohne Quelle → null). */
export function lifecycleDetail(session: Pick<LocalTrainingSession, 'payload_json'> | null | undefined): RecoveryRejectDetail {
  const p = parseObj(session?.payload_json);
  const src = p?.[TRACK_LIFECYCLE_SOURCE_KEY];
  const at = p?.[TRACK_LIFECYCLE_UPDATED_KEY];
  return { lifecycleSource: typeof src === 'string' ? src : null, lifecycleAt: typeof at === 'string' ? at : null };
}

/** Dauerhafter lokaler Lifecycle-Abschluss einer Session (null = keiner / Altbestand). */
export function durableLifecycle(session: Pick<LocalTrainingSession, 'payload_json'> | null | undefined): TrackLifecycleStatus | null {
  const v = parseObj(session?.payload_json)?.[TRACK_LIFECYCLE_KEY];
  return v === 'cancelled' || v === 'completed_without_app' ? v : null;
}

/**
 * Recovery B: gelegte Fährte aus der lokal gespeicherten Session rekonstruieren.
 * Übernimmt Punkte/Marker/Segmente/Distanz 1:1 (SQLite-Lay-Punkte sind dieselben
 * Samples wie trackPoints im Store) — keine Neuberechnung von Geometrie.
 */
export function reconstructPendingFromSession(
  snap: LocalSessionSnapshot,
  dogId: string,
  opts: { now: number; userId?: string | null; hasRemoteSearchRun?: boolean },
): { ok: true; pending: PendingTrack } | { ok: false; reason: RecoveryRejectReason } {
  const { session, layPoints, markers, searchPointCount } = snap;
  if (session.deleted_at) return { ok: false, reason: 'deleted' };
  if (session.type !== 'track') return { ok: false, reason: 'not_track' };
  if (session.dog_id !== dogId) return { ok: false, reason: 'wrong_dog' };
  if (opts.userId && session.user_id !== opts.userId) return { ok: false, reason: 'wrong_user' };
  if (session.status === 'cancelled') return { ok: false, reason: 'cancelled' };
  const payload = parseObj(session.payload_json);
  // Dauerhafter lokaler Lifecycle-Marker (setLocalTrackLifecycle): Nutzerabsicht hat Vorrang.
  // Fehlt er (Altbestand), gelten unverändert die übrigen Regeln — nichts wird erfunden.
  const lifecycle = durableLifecycle(session);
  if (lifecycle) return { ok: false, reason: lifecycle };
  if (payload?.run || opts.hasRemoteSearchRun) return { ok: false, reason: 'search_completed' };
  if (searchPointCount > 0) return { ok: false, reason: 'search_started' };
  // Lege-Ende: ended_at entsteht in finish() im selben Übergang wie setLayFinishedAt().
  const layFinishedAt = session.ended_at ? Date.parse(session.ended_at) : NaN;
  if (!isNum(layFinishedAt)) return { ok: false, reason: 'lay_not_finished' };

  const trackPoints: TrackPointSample[] = layPoints.map(p => ({
    lat: p.latitude, lng: p.longitude, accuracy: p.accuracy, altitude: p.altitude,
    speed: p.speed, heading: p.heading, t: Date.parse(p.timestamp),
  }));
  if (!hasValidLayGeometry(trackPoints) || !trackPoints.every(p => isNum(p.t))) return { ok: false, reason: 'no_geometry' };

  const markerSamples: MarkerSample[] = markers.map(m => {
    const t = Date.parse(m.created_at);
    return {
      id: m.local_id,
      type: m.marker_type as MarkerType,
      material: (m.material ?? null) as MarkerMaterial | null,
      angleKind: (m.angle_kind ?? null) as AngleKind | null,
      lat: m.latitude, lng: m.longitude, accuracy: m.accuracy,
      distance_from_start: m.distance_from_start ?? 0,
      note: m.note, audio_url: null, found: false,
      t: isNum(t) ? t : layFinishedAt,
    };
  });

  return {
    ok: true,
    pending: {
      sessionId: session.local_id,
      dogId,
      trackPoints,
      markers: markerSamples,
      segments: coerceTrackSegments(payload?.segments),
      runPoints: [],
      distanceMeters: isNum(payload?.distanceMeters) ? payload!.distanceMeters : 0,
      durationSeconds: session.duration_seconds ?? 0,
      layFinishedAt,
      startAnchor: null,   // nicht persistiert → Absuche nutzt den ersten gelegten Punkt (bestehender Pfad)
      savedAt: opts.now,
      searchPoints: [],
      runId: null,
      status: 'resting',
      paused: false,
      searchStartedAt: null,
      searchUpdatedAt: null,
      layStartedAt: layFinishedAt,
      layUpdatedAt: layFinishedAt,
    },
  };
}

/**
 * Harte Sperren, die für JEDE Quelle gelten (Registry, Puffer, SQLite), sobald die lokale
 * Session bekannt ist: Nutzerabsicht (dauerhafter Marker), Löschung, Zugehörigkeit und ein
 * FINALER Suchlauf (lokal payload_json.run, remote laut hasFinalSearchRun).
 */
function hardBlock(
  local: LocalSessionSnapshot | null, dogId: string, userId: string | null | undefined, finalRemoteRun: boolean | undefined,
): RecoveryRejectReason | null {
  if (local) {
    const lifecycle = durableLifecycle(local.session);
    if (lifecycle) return lifecycle;
    if (local.session.deleted_at) return 'deleted';
    if (local.session.dog_id !== dogId) return 'wrong_dog';
    if (userId && local.session.user_id !== userId) return 'wrong_user';
    if (parseObj(local.session.payload_json)?.run) return 'search_completed';
  }
  return finalRemoteRun ? 'search_completed' : null;
}

/**
 * Zentrale Entscheidung für „Fährte fortsetzen" einer konkreten Session.
 * Eindeutigkeit vor Komfort: jede Mehrdeutigkeit → kein Recovery.
 */
export function decideTrackRecovery(input: {
  registry: ActiveFaehrtenMap;
  dogId: string | null | undefined;
  sessionId: string | null | undefined;
  pending: PendingTrack | null;
  local: LocalSessionSnapshot | null;
  userId?: string | null;
  /** Remote belegter FINALER Suchlauf (hasFinalSearchRun der Detail-Daten). */
  hasRemoteSearchRun?: boolean;
  now: number;
}): RecoveryDecision {
  const { registry, dogId, sessionId, pending, local, now } = input;
  if (!dogId) return { ok: false, reason: 'no_dog' };
  if (!sessionId) return { ok: false, reason: 'no_session' };

  const blocked = hardBlock(local, dogId, input.userId, input.hasRemoteSearchRun);
  if (blocked) {
    // Dauerhafter Abschluss: Quelle/Zeitpunkt mitgeben, damit „cancelled" künftig erklärbar ist.
    // Rein additiv: `detail` nur, wenn die Session Quelle/Zeitpunkt trägt (Altbestand unverändert).
    const detail = blocked === 'cancelled' || blocked === 'completed_without_app' ? lifecycleDetail(local?.session) : null;
    return detail && (detail.lifecycleSource || detail.lifecycleAt) ? { ok: false, reason: blocked, detail } : { ok: false, reason: blocked };
  }

  const reg = isValidEntry(registry[dogId]) ? registry[dogId] : null;
  if (reg && reg.sessionId !== sessionId) return { ok: false, reason: 'other_active' };
  if (reg?.status === 'laying') return { ok: false, reason: 'laying_not_supported' };

  const finish = (source: RecoverySource, patch: Partial<ActiveFaehrte> | null, write: PendingTrack | null): RecoveryDecision => {
    const entry = patch ? upsertEntry(registry, dogId, patch)[dogId] : reg!;
    const mode: RecoveryMode = entry.status === 'searching' ? 'searching' : 'resting';
    return { ok: true, source, mode, registryPatch: patch, pendingToWrite: write, target: reopenTarget(entry) };
  };

  const samePending = !!pending && pending.sessionId === sessionId && (pending.dogId == null || pending.dogId === dogId);
  if (pending && !samePending && isOpenPending(pending)) return { ok: false, reason: 'other_pending' };
  if (samePending && pendingStatus(pending!) === 'laying') return { ok: false, reason: 'laying_not_supported' };
  if (samePending && !RECOVERABLE_PENDING.includes(pendingStatus(pending!))) return { ok: false, reason: 'pending_closed' };

  // Recovery A: eigener, offener Puffer vorhanden (resting ODER laufende Absuche —
  // letztere übernimmt die bestehende Search-Recovery in run.tsx).
  if (samePending && isOpenPending(pending)) {
    return reg ? finish('registry', null, null) : finish('pending', registryPatchFromPending(pending, now), null);
  }

  // Recovery B: Puffer fehlt (oder ohne Geometrie) → aus der gespeicherten Session
  // (nur Liegezeit; eine Absuche wird nie aus SQLite rekonstruiert).
  const rebuilt = local
    ? reconstructPendingFromSession(local, dogId, { now, userId: input.userId, hasRemoteSearchRun: input.hasRemoteSearchRun })
    : { ok: false as const, reason: 'unknown_session' as const };
  if (reg) {
    // Registry ist korrekt; nur einen fehlenden Liegezeit-Puffer nachschreiben,
    // nie einen laufenden Such-Zustand mit 'resting' überdecken.
    const canWrite = rebuilt.ok && (reg.status === 'resting' || reg.status === 'laid');
    return finish('registry', null, canWrite ? rebuilt.pending : null);
  }
  if (!rebuilt.ok) return { ok: false, reason: rebuilt.reason };
  return finish('session', registryPatchFromPending(rebuilt.pending, now), rebuilt.pending);
}

/**
 * Selbstheilung: Registry-Einträge für eindeutig offene, LIEGENDE Pending-Puffer
 * (laufende Absuche/Legen bewusst nicht — sonst würde der bestehende Auto-Resume
 * beim Start automatisch in run/legen navigieren, also aggressiver werden),
 * deren Registry-Eintrag fehlt. Nur für Hunde des angemeldeten Nutzers
 * (`currentUserDogIds`, gleiche Semantik wie reconcileWithDogs); nur mit dogId +
 * sessionId; nie eine vorhandene Registry-Fährte überschreiben; keine Absuche reaktivieren.
 */
export function selfHealPatches(
  registry: ActiveFaehrtenMap,
  pendings: readonly PendingTrack[],
  now: number,
  currentUserDogIds: readonly string[],
  /** Sessions mit dauerhaftem lokalem Lifecycle-Abschluss — nie wieder registrieren. */
  closedSessionIds: ReadonlySet<string> = new Set(),
): { dogId: string; patch: Partial<ActiveFaehrte> }[] {
  const allowed = new Set(currentUserDogIds);
  const out: { dogId: string; patch: Partial<ActiveFaehrte> }[] = [];
  for (const p of pendings) {
    const dogId = p.dogId;
    if (!dogId || !p.sessionId || !allowed.has(dogId) || closedSessionIds.has(p.sessionId)) continue;
    if (isValidEntry(registry[dogId])) continue;
    if (!SELF_HEAL_PENDING.includes(pendingStatus(p)) || !isOpenPending(p)) continue;
    if (out.some(o => o.dogId === dogId)) continue;
    out.push({ dogId, patch: registryPatchFromPending(p, now) });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Suchversuch verwerfen („Absuche verwerfen") — NUR die Absuche, nicht die Fährte.
// Die gelegte Fährte (Punkte, Marker, Segmente, Session-ID, Hund, Liegezeit-Basis)
// bleibt erhalten und wird wieder 'resting'. Kein 'cancelled', kein dauerhafter
// Marker, keine neue Session, kein Quota-Claim. Nur „Fährte abbrechen" ist ein Abbruch.
// ──────────────────────────────────────────────────────────────────────────

/** Puffer nach verworfenem Suchversuch: alle Such-Felder zurück, Lay-Daten unverändert. */
export function searchDiscardPending(p: PendingTrack, now: number): PendingTrack {
  return {
    ...p,
    status: 'resting',
    searchPoints: [],
    runId: null,
    paused: false,
    searchStartedAt: null,
    searchUpdatedAt: null,
    searchRun: undefined,   // Legacy-Semantik „frisch" (siehe searchRunState.ts)
    savedAt: now,
  };
}

export type SearchDiscardDecision =
  | { ok: true; pending: PendingTrack; registryPatch: Partial<ActiveFaehrte>; target: string }
  | { ok: false; reason: RecoveryRejectReason };

/**
 * Darf der Suchversuch dieser Session verworfen und die Fährte wieder freigegeben werden?
 * Gleiche harte Sperren wie die Recovery; eine fremde offene Fährte wird nie berührt.
 * Quelle der Lay-Daten: eigener Puffer (resting/laid/searching), sonst die lokale
 * SQLite-Session (die zu löschenden Suchpunkte zählen dabei nicht).
 */
export function decideSearchDiscard(input: {
  registry: ActiveFaehrtenMap;
  dogId: string | null | undefined;
  sessionId: string | null | undefined;
  pending: PendingTrack | null;
  local: LocalSessionSnapshot | null;
  userId?: string | null;
  hasRemoteSearchRun?: boolean;
  now: number;
}): SearchDiscardDecision {
  const { registry, dogId, sessionId, pending, local, now } = input;
  if (!dogId) return { ok: false, reason: 'no_dog' };
  if (!sessionId) return { ok: false, reason: 'no_session' };
  const blocked = hardBlock(local, dogId, input.userId, input.hasRemoteSearchRun);
  if (blocked) return { ok: false, reason: blocked };

  const reg = isValidEntry(registry[dogId]) ? registry[dogId] : null;
  if (reg && reg.sessionId !== sessionId) return { ok: false, reason: 'other_active' };
  if (reg?.status === 'laying') return { ok: false, reason: 'laying_not_supported' };

  const samePending = !!pending && pending.sessionId === sessionId && (pending.dogId == null || pending.dogId === dogId);
  if (pending && !samePending && isOpenPending(pending)) return { ok: false, reason: 'other_pending' };
  if (samePending && pendingStatus(pending!) === 'laying') return { ok: false, reason: 'laying_not_supported' };
  if (samePending && !RECOVERABLE_PENDING.includes(pendingStatus(pending!))) return { ok: false, reason: 'pending_closed' };

  let next: PendingTrack;
  if (samePending && hasValidLayGeometry(pending!.trackPoints)) {
    next = searchDiscardPending(pending!, now);
  } else {
    if (!local) return { ok: false, reason: 'unknown_session' };
    const rebuilt = reconstructPendingFromSession({ ...local, searchPointCount: 0 }, dogId, { now, userId: input.userId });
    if (!rebuilt.ok) return { ok: false, reason: rebuilt.reason };
    next = rebuilt.pending;
  }
  const registryPatch = registryPatchFromPending(next, now);
  return { ok: true, pending: next, registryPatch, target: reopenTarget(upsertEntry({}, dogId, registryPatch)[dogId]) };
}

/**
 * Liegezeit-Abbruch: WELCHE Session wird beendet und darf der Aufnahme-Store mitgeändert werden?
 * Rein. Der Store gehört nur dann zur abgebrochenen Fährte, wenn keine Route-Session vorliegt
 * oder sie mit der Store-Session übereinstimmt — sonst (z. B. Deep-Link aus der Liegezeit-
 * Benachrichtigung ohne dogId, Store hält die Fährte eines ANDEREN Hundes) bleibt der Store
 * unangetastet. Hund: Route, sonst nur der Store-Hund der passenden Session (sonst null →
 * der Service bestimmt ihn aus der lokalen Session).
 */
export function resolveRestingCancelTarget(input: {
  routeSessionId: string | null | undefined;
  routeDogId: string | null | undefined;
  storeSessionId: string | null | undefined;
  storeDogId: string | null | undefined;
}): { sessionId: string | null; dogId: string | null; cancelStore: boolean } {
  const sessionId = input.routeSessionId ?? input.storeSessionId ?? null;
  const cancelStore = !input.routeSessionId || input.storeSessionId === input.routeSessionId;
  const dogId = input.routeDogId ?? (cancelStore ? input.storeDogId ?? null : null);
  return { sessionId, dogId, cancelStore };
}
