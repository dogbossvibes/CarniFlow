import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import type { SessionStatus } from '@/features/tracking/store/trackingStore';
import { type ActiveFaehrtenMap, isValidEntry } from '@/features/tracking/store/activeFaehrtenModel';
import { durableLifecycle, hasValidLayGeometry, isOpenPending } from '@/features/tracking/store/trackRecovery';
import type { LocalTrackPoint, LocalTrainingSession } from '@/features/sync/types/sync';
import type { LatLng } from '@/features/tracking/utils/gpsFilter';
import { resolveTrackOverlayColorKey, type TrackOverlayColorKey } from '@/features/tracking/utils/trackOverlayColors';

// ──────────────────────────────────────────────────────────────────────────
// Referenz-Fährten beim Legen — REINE, testbare Logik (kein React/Expo/Native).
//
// Mehrhundehalter legen mehrere Fährten im selben Gelände. Beim Legen für einen
// Hund werden die bereits gelegten, noch offenen Fährten der ANDEREN eigenen Hunde
// als READ-ONLY-Kartenebene angezeigt, damit man nicht durch sie hindurchläuft.
//
// Strikt getrennt von der laufenden Aufnahme: Overlays gelangen nie in den
// trackingStore, beeinflussen keine Distanz/Winkel/Marker/Teilstrecken/GPS-Filter/
// Absuche/Analyse/Persistenz. Kein Recovery, keine Registry-Reparatur, kein
// Schreiben von Pending-Daten, keine neue Session, kein Quota-Claim.
// ──────────────────────────────────────────────────────────────────────────

/** Status, deren gelegte Linie als Referenz gezeigt wird. `laying` eines anderen
 *  Hundes bewusst NICHT (nur eine bildschirm-aktive Legeaufnahme ist sicher). */
export type TrackReferenceStatus = Extract<SessionStatus, 'laid' | 'resting' | 'searching'>;
const REFERENCE_STATUSES: readonly SessionStatus[] = ['laid', 'resting', 'searching'];

/** Minimales Anzeige-Modell — bewusst KEINE Marker-/Analyse-/Run-Daten. */
export interface TrackReferenceOverlay {
  dogId:     string;
  sessionId: string;
  dogName:   string;
  /** Fährtenfarbe DIESES Hundes (aus seiner dogId aufgelöst, nie vom aktuellen Hund). */
  colorKey:  TrackOverlayColorKey;
  status:    TrackReferenceStatus;
  points:    LatLng[];
}

/** Offener Registry-Eintrag eines anderen eigenen Hundes, dessen Geometrie zu laden ist. */
export interface TrackReferenceCandidate {
  dogId:     string;
  sessionId: string;
  dogName:   string;
  colorKey:  TrackOverlayColorKey;
  status:    TrackReferenceStatus;
  /** Sortierbasis (Beginn des Legens) — stabile Reihenfolge, unabhängig von updatedAt. */
  order:     number;
}

export interface TrackReferenceScope {
  /** Hunde aus useDogs() (serverseitig `owner_id = user`). Zusätzlich clientseitig
   *  fail-closed: nur Hunde mit `owner_id === ownerUserId` zählen als eigene Hunde. */
  currentUserDogs:   readonly { id: string; name?: string | null; owner_id?: string | null; track_overlay_color_key?: string | null }[];
  /** Angemeldeter Nutzer. Ohne Nutzer → keine Referenzen (fail-closed). */
  ownerUserId:       string | null | undefined;
  /** Hund der aktuell gelegten Fährte — wird nie als Referenz geliefert. */
  currentDogId:      string | null | undefined;
  /** Session der aktuell gelegten Fährte — wird nie als Referenz geliefert. */
  currentSessionId?: string | null;
}

export function isReferenceStatus(status: SessionStatus | null | undefined): status is TrackReferenceStatus {
  return status != null && REFERENCE_STATUSES.includes(status);
}

/**
 * Kandidaten aus der Aktive-Fährten-Registry: nur gültige, offene Einträge
 * (laid/resting/searching) mit sessionId, deren Hund dem angemeldeten Nutzer gehört,
 * ohne aktuellen Hund / aktuelle Session. Stabile Reihenfolge: Legebeginn, dann dogId.
 */
/** Eigene Hunde (id → Name): nur mit gesetztem Nutzer und passendem owner_id. Geteilte
 *  Hunde (Trainer/Connect) tragen eine fremde owner_id und fallen hier heraus. */
export function ownedDogNames(scope: Pick<TrackReferenceScope, 'currentUserDogs' | 'ownerUserId'>): Map<string, string> {
  const owner = scope.ownerUserId;
  if (!owner) return new Map();
  return new Map(scope.currentUserDogs
    .filter(d => !!d?.id && d.owner_id === owner)
    .map(d => [d.id, d.name ?? ''] as const));
}

/** Gespeicherte Fährtenfarbe je eigenem Hund (id → Key oder null). Gleiche Ownership-Regel wie ownedDogNames. */
export function ownedDogColorKeys(scope: Pick<TrackReferenceScope, 'currentUserDogs' | 'ownerUserId'>): Map<string, string | null> {
  const owner = scope.ownerUserId;
  if (!owner) return new Map();
  return new Map(scope.currentUserDogs
    .filter(d => !!d?.id && d.owner_id === owner)
    .map(d => [d.id, d.track_overlay_color_key ?? null] as const));
}

export function selectReferenceCandidates(registry: ActiveFaehrtenMap, scope: TrackReferenceScope): TrackReferenceCandidate[] {
  const names = ownedDogNames(scope);
  const colors = ownedDogColorKeys(scope);
  const out: TrackReferenceCandidate[] = [];
  for (const [key, e] of Object.entries(registry)) {
    if (!isValidEntry(e) || e.dogId !== key) continue;
    if (!names.has(e.dogId)) continue;                              // Nutzerisolation
    if (scope.currentDogId && e.dogId === scope.currentDogId) continue;
    if (!e.sessionId) continue;
    if (scope.currentSessionId && e.sessionId === scope.currentSessionId) continue;
    if (!isReferenceStatus(e.status)) continue;
    out.push({
      dogId: e.dogId, sessionId: e.sessionId, dogName: names.get(e.dogId) || '',
      colorKey: resolveTrackOverlayColorKey(e.dogId, colors.get(e.dogId)), status: e.status,
      order: e.startedAt ?? e.layStartedAt ?? e.searchStartedAt ?? Number.MAX_SAFE_INTEGER,
    });
  }
  return out.sort((a, b) => (a.order - b.order) || (a.dogId < b.dogId ? -1 : a.dogId > b.dogId ? 1 : 0));
}

/**
 * Stabiler Schlüssel der für Overlays relevanten Registry-Teile. Ändert sich NICHT
 * bei Kennzahl-Updates (Distanz/GPS-Genauigkeit alle 4 s) — nur bei Hund/Session/
 * Status/Name/Fährtenfarbe. Der Hook lädt Geometrie ausschliesslich bei Änderung dieses Schlüssels.
 */
export function referenceCandidatesKey(candidates: readonly TrackReferenceCandidate[]): string {
  return candidates.map(c => `${c.dogId}:${c.sessionId}:${c.status}:${c.dogName}:${c.colorKey}`).join('|');
}

/** Lokal gelesene Quellen für EINEN Kandidaten (alle optional, alle nur gelesen). */
export interface TrackReferenceSources {
  /** Pending-Slot des Hundes (nur gelesen, keine Migration). */
  pending:   PendingTrack | null;
  /** Lokale Session-Zeile (SQLite). */
  session:   Pick<LocalTrainingSession, 'local_id' | 'user_id' | 'dog_id' | 'type' | 'deleted_at' | 'status' | 'payload_json'> | null;
  /** Gelegte Punkte aus SQLite (nur geladen, wenn der Pending-Puffer nichts liefert). */
  layPoints: readonly Pick<LocalTrackPoint, 'latitude' | 'longitude'>[] | null;
}

function hasFinalSearchRun(payloadJson: string | null | undefined): boolean {
  if (!payloadJson) return false;
  try { const v = JSON.parse(payloadJson); return !!(v && typeof v === 'object' && v.run); } catch { return false; }
}

/**
 * Harte Sperren aus der lokalen Session-Zeile (falls vorhanden): gelöscht, keine
 * Fährte, anderer Hund, anderer Nutzer, abgebrochen, „Ohne App abgeschlossen",
 * finaler Suchlauf. Fehlt die Zeile, entscheidet allein der Pending-Puffer.
 */
export function isSessionBlocked(session: TrackReferenceSources['session'], dogId: string, userId: string | null | undefined): boolean {
  if (!session) return false;
  if (session.deleted_at) return true;
  if (session.type && session.type !== 'track') return true;
  if (session.dog_id !== dogId) return true;
  if (userId && session.user_id !== userId) return true;
  if (session.status === 'cancelled') return true;
  if (durableLifecycle(session) != null) return true;
  return hasFinalSearchRun(session.payload_json);
}

/** Pending gehört eindeutig zu diesem Kandidaten und ist offen mit Geometrie. */
/** Defekte Puffer (z. B. trackPoints kein Array) gelten als „passt nicht" → SQLite-Fallback. */
export function pendingMatches(p: PendingTrack | null | undefined, c: Pick<TrackReferenceCandidate, 'dogId' | 'sessionId'>): p is PendingTrack {
  if (!p || typeof p !== 'object' || !Array.isArray(p.trackPoints)) return false;
  if (p.sessionId !== c.sessionId || (p.dogId != null && p.dogId !== c.dogId)) return false;
  try { return isOpenPending(p); } catch { return false; }
}

/**
 * Letzte Schutzschicht vor der Anzeige (unabhängig von Registry/Ladezeitpunkt):
 * nie der aktuelle Hund, nie die aktuelle Session, nur eigene Hunde. Verhindert,
 * dass ein noch angezeigtes, älteres Ladeergebnis nach einem Hunde-/Nutzerwechsel
 * die aktuelle Fährte oder einen fremden Hund zeigt.
 */
export function filterVisibleReferenceOverlays(
  overlays: readonly TrackReferenceOverlay[],
  scope: TrackReferenceScope,
): TrackReferenceOverlay[] {
  const owned = ownedDogNames(scope);
  return overlays.filter(o =>
    owned.has(o.dogId)
    && !(scope.currentDogId && o.dogId === scope.currentDogId)
    && !(scope.currentSessionId && o.sessionId === scope.currentSessionId));
}

/**
 * Geometrie eines Kandidaten auflösen. Priorität: 1) Pending-Puffer, 2) SQLite-
 * Lay-Punkte. Echte gespeicherte Punkte 1:1 — keine Glättung/Korrektur/Vereinfachung.
 * null = nicht anzeigen (gesperrt oder keine lokal lesbare Geometrie) — keine Fake-Linie.
 */
export function resolveReferenceOverlay(
  c: TrackReferenceCandidate,
  src: TrackReferenceSources,
  userId: string | null | undefined,
): TrackReferenceOverlay | null {
  if (isSessionBlocked(src.session, c.dogId, userId)) return null;
  let points: LatLng[] | null = null;
  if (pendingMatches(src.pending, c)) {
    points = src.pending.trackPoints.map(p => ({ lat: p.lat, lng: p.lng }));
  } else if (src.session && src.layPoints) {
    // SQLite nur mit bekannter, zugehöriger Session-Zeile (Sperren oben geprüft).
    points = src.layPoints.map(p => ({ lat: p.latitude, lng: p.longitude }));
  }
  if (!points || !hasValidLayGeometry(points)) return null;
  return { dogId: c.dogId, sessionId: c.sessionId, dogName: c.dogName, colorKey: c.colorKey, status: c.status, points };
}

/** Anzahl für die Kartensteuerung („Andere Fährten · n"). */
export function referenceOverlayCount(overlays: readonly TrackReferenceOverlay[] | null | undefined): number {
  return overlays?.length ?? 0;
}

/** Kurzkennzeichen am Startpunkt (Initiale; Fallback „?"). */
export function referenceOverlayInitial(o: Pick<TrackReferenceOverlay, 'dogName'>): string {
  return (o.dogName?.trim()?.[0] ?? '?').toUpperCase();
}
