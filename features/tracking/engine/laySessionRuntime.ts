import type * as Location from 'expo-location';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import type { LayFixResult } from '@/features/tracking/engine/layProcessingSession';

// ──────────────────────────────────────────────────────────────────────────
// Lay-Session-Runtime (React-unabhängig): fachliche Verarbeitungs-Ownership
// für Lay-Fixes aus Vordergrund UND Hintergrund-Task.
//
//   • Registry je sessionId: derselbe Lay-Processor + Session-State, den der
//     Hook in Phase 1 erzeugt hat — kein zweiter Recorder, kein Background-State.
//   • Hintergrund-Bindung: der Task verarbeitet nur Fixes einer EXPLIZIT
//     gebundenen, aktiven Lay-Session (sessionId + dogId + aktive-Fährten-
//     Registry „laying"). Kein latest/newest/Zeitheuristik — sonst fail closed.
//   • Dedup kanalübergreifend über sessionId + Fix-Zeitstempel: dasselbe Event
//     aus Vordergrund und Hintergrund wird genau einmal verarbeitet; doppelte
//     Hintergrund-Zustellung ebenso. (Vordergrund-interne Wiederholungen bleiben
//     wie bisher — Foreground-Parität.)
//   • Serialisierung je Session: Fix N (inkl. Persistenz im Hintergrund) ist
//     vollständig, bevor Fix N+1 den Processor-State berührt. Ist nichts in
//     Arbeit, läuft ein Vordergrund-Fix unverändert synchron.
//   • Hintergrund: akzeptierte Daten werden vor Rückgabe an den Task dauerhaft
//     geschrieben (awaited persist); Fehler werden als Ergebnis gemeldet.
//   • Finalize: neue Fixes werden ab sofort verworfen, bereits laufende Arbeit
//     wird abgewartet (kein Write nach Finalisierung, kein Teilzustand).
// ──────────────────────────────────────────────────────────────────────────

export type LayDeliverySource = 'foreground' | 'background';
export type LaySessionStatus = 'active' | 'stopped' | 'finalizing' | 'finalized';
export type LayDropReason =
  | 'duplicate'
  | 'no_bound_session' | 'unknown_session' | 'dog_mismatch' | 'registry_mismatch' | 'not_laying'
  | 'session_not_active' | 'session_finalized' | 'fix_before_session_start';

export type LayDeliveryOutcome =
  | { kind: 'processed'; sessionId: string; source: LayDeliverySource; result: LayFixResult; persisted: boolean | null }
  | { kind: 'persist_failed'; sessionId: string; source: LayDeliverySource; result: LayFixResult }
  | { kind: 'dropped'; sessionId: string | null; source: LayDeliverySource; reason: LayDropReason };

/** Was der Owner (Hook) beim Start einer Lay-Aufnahme registriert. */
export interface LaySessionRegistration {
  sessionId: string;
  dogId: string | null;
  /** ms: Beginn der Aufnahme. Ältere Hintergrund-Fixes gehören nicht zu dieser Session. */
  startedAtMs: number;
  /** Der gemeinsame Lay-Processor dieser Session (Phase 1, unverändert). */
  processFix: (loc: Location.LocationObject) => LayFixResult;
  /** Dauerhafte Persistenz der gepufferten Linienpunkte; true = geschrieben (oder nichts offen). */
  persist: () => Promise<boolean>;
}

interface Entry extends LaySessionRegistration {
  mode: 'laying';
  status: LaySessionStatus;
  pending: number;
  tail: Promise<void>;
  seen: Map<number, Set<LayDeliverySource>>;
  maxSeenTs: number;
}

const sessions = new Map<string, Entry>();
let binding: { sessionId: string; dogId: string | null } | null = null;
const SEEN_RETENTION_MS = 300_000;
const SEEN_PRUNE_AT = 2_000;

export function registerLaySession(reg: LaySessionRegistration): void {
  sessions.set(reg.sessionId, {
    ...reg, mode: 'laying', status: 'active', pending: 0, tail: Promise.resolve(), seen: new Map(), maxSeenTs: -Infinity,
  });
}

export function getLaySessionStatus(sessionId: string | null | undefined): LaySessionStatus | null {
  return sessionId ? sessions.get(sessionId)?.status ?? null : null;
}

/** Der Hintergrund-Task gehört ab jetzt genau zu dieser Session. */
export function bindBackgroundLaySession(sessionId: string, dogId: string | null): void {
  binding = { sessionId, dogId };
}

/** Löst die Bindung nur, wenn sie noch zu genau dieser Session gehört. */
export function unbindBackgroundLaySession(sessionId: string | null | undefined): void {
  if (binding && binding.sessionId === sessionId) binding = null;
}

export function getBackgroundLayBinding(): { sessionId: string; dogId: string | null } | null {
  return binding ? { ...binding } : null;
}

/** Aufnahme gestoppt (ohne Finalisierung): keine weiteren Fixes. Laufende Arbeit läuft zu Ende. */
export function stopLaySession(sessionId: string | null | undefined): void {
  const e = sessionId ? sessions.get(sessionId) : undefined;
  if (e && e.status === 'active') e.status = 'stopped';
  unbindBackgroundLaySession(sessionId);
}

/**
 * Finalisierung beginnt: ab sofort werden neue Fixes verworfen; das Ergebnis
 * löst auf, sobald bereits laufende/angenommene Verarbeitung (inkl. Persistenz)
 * abgeschlossen ist. Danach ist die Session `finalized`.
 */
export function beginFinalizeLaySession(sessionId: string | null | undefined): Promise<void> {
  const e = sessionId ? sessions.get(sessionId) : undefined;
  unbindBackgroundLaySession(sessionId);
  if (!e) return Promise.resolve();
  if (e.status !== 'finalized') e.status = 'finalizing';
  return e.tail.then(() => { e.status = 'finalized'; });
}

function enqueue(e: Entry, task: () => LayDeliveryOutcome | Promise<LayDeliveryOutcome>): Promise<LayDeliveryOutcome> {
  const settle = (p: Promise<LayDeliveryOutcome>) => {
    const done = p.finally(() => { e.pending--; });
    e.tail = done.then(() => undefined, () => undefined);
    return done;
  };
  if (e.pending === 0) {
    // Nichts in Arbeit → sofort und synchron (wie bisher im Hook). Eine synchron
    // abgeschlossene Zustellung hinterlässt KEINE offene Arbeit — sonst würde der
    // nächste Vordergrund-Fix im selben Tick fälschlich asynchron eingereiht.
    let r: LayDeliveryOutcome | Promise<LayDeliveryOutcome>;
    try { r = task(); } catch (err) { return Promise.reject(err); }
    if (!(r instanceof Promise)) return Promise.resolve(r);
    e.pending++;
    return settle(r);
  }
  e.pending++;
  return settle(e.tail.then(task));
}

function noteSeen(e: Entry, ts: number, source: LayDeliverySource): void {
  const set = e.seen.get(ts) ?? new Set<LayDeliverySource>();
  set.add(source);
  e.seen.set(ts, set);
  if (ts > e.maxSeenTs) e.maxSeenTs = ts;
  if (e.seen.size > SEEN_PRUNE_AT) {
    for (const k of e.seen.keys()) if (k < e.maxSeenTs - SEEN_RETENTION_MS) e.seen.delete(k);
  }
}

function run(e: Entry, loc: Location.LocationObject, source: LayDeliverySource): LayDeliveryOutcome | Promise<LayDeliveryOutcome> {
  const drop = (reason: LayDropReason): LayDeliveryOutcome => ({ kind: 'dropped', sessionId: e.sessionId, source, reason });
  if (e.status === 'finalizing' || e.status === 'finalized') return drop('session_finalized');
  if (e.status !== 'active') return drop('session_not_active');
  const ts = loc.timestamp;
  const seen = e.seen.get(ts);
  if (seen && (seen.has('background') || source === 'background')) return drop('duplicate');
  noteSeen(e, ts, source);
  const result = e.processFix(loc);
  const needsPersist = result.outcome === 'accepted' || result.anchorReleased;
  if (source === 'foreground' || !needsPersist) {
    return { kind: 'processed', sessionId: e.sessionId, source, result, persisted: null };
  }
  return e.persist().then(
    ok => (ok
      ? { kind: 'processed', sessionId: e.sessionId, source, result, persisted: true } as LayDeliveryOutcome
      : { kind: 'persist_failed', sessionId: e.sessionId, source, result } as LayDeliveryOutcome),
    () => ({ kind: 'persist_failed', sessionId: e.sessionId, source, result } as LayDeliveryOutcome),
  );
}

/** Einen Fix einer bekannten Session zustellen (Vordergrund oder bereits validierter Hintergrund). */
export function deliverLayFix(sessionId: string, loc: Location.LocationObject, source: LayDeliverySource): Promise<LayDeliveryOutcome> {
  const e = sessions.get(sessionId);
  if (!e) return Promise.resolve({ kind: 'dropped', sessionId, source, reason: 'unknown_session' });
  return enqueue(e, () => run(e, loc, source));
}

/** Eindeutige Zuordnung eines Hintergrund-Fixes — sonst Grund für fail closed. */
export function resolveBackgroundLaySession(loc: Location.LocationObject): { sessionId: string } | { reason: LayDropReason; sessionId: string | null } {
  const b = binding;
  if (!b) return { reason: 'no_bound_session', sessionId: null };
  const e = sessions.get(b.sessionId);
  if (!e) return { reason: 'unknown_session', sessionId: b.sessionId };
  if (e.dogId !== b.dogId) return { reason: 'dog_mismatch', sessionId: b.sessionId };
  if (e.mode !== 'laying') return { reason: 'not_laying', sessionId: b.sessionId };
  if (e.status === 'finalizing' || e.status === 'finalized') return { reason: 'session_finalized', sessionId: b.sessionId };
  if (e.status !== 'active') return { reason: 'session_not_active', sessionId: b.sessionId };
  if (b.dogId) {
    const reg = useActiveFaehrten.getState().get(b.dogId);
    if (!reg || reg.sessionId !== b.sessionId) return { reason: 'registry_mismatch', sessionId: b.sessionId };
    if (reg.status !== 'laying') return { reason: 'not_laying', sessionId: b.sessionId };
  }
  if (!(loc.timestamp >= e.startedAtMs)) return { reason: 'fix_before_session_start', sessionId: b.sessionId };
  return { sessionId: b.sessionId };
}

/**
 * Hintergrund-Einstieg: jeden Fix eindeutig zuordnen, seriell durch denselben
 * Processor schicken und erst zurückkehren, wenn notwendige Writes fertig sind.
 */
export async function deliverBackgroundLocations(locations: readonly Location.LocationObject[]): Promise<LayDeliveryOutcome[]> {
  const out: LayDeliveryOutcome[] = [];
  for (const loc of locations) {
    const target = resolveBackgroundLaySession(loc);
    if ('reason' in target) { out.push({ kind: 'dropped', sessionId: target.sessionId, source: 'background', reason: target.reason }); continue; }
    out.push(await deliverLayFix(target.sessionId, loc, 'background'));
  }
  return out;
}

/** Nur für Tests: Runtime-Zustand leeren. */
export function __resetLaySessionRuntimeForTests(): void {
  sessions.clear();
  binding = null;
}
