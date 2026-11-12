import AsyncStorage from '@react-native-async-storage/async-storage';
import { diagnosticsAccessToken, getDiagnosticsAccessSnapshot, hasDiagnosticsAccess, subscribeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import { getActiveTrackingModes, subscribeActiveTrackingModes } from './trackingWarmupState';

type Preferences = { source: 'legacy' | 'precision'; engine: 'build40' | 'current'; diagnostics: boolean };
const DEFAULTS: Preferences = { source: 'precision', engine: 'current', diagnostics: false };
let preferences = { ...DEFAULTS };
let loadedToken: string | null = null;
let pending: { token: string; promise: Promise<void> } | null = null;
let writes = Promise.resolve();
const listeners = new Set<() => void>();
const key = (uid: string) => `anyvo.qa.preferences.v2.${uid}`;
const emit = () => listeners.forEach(fn => fn());
let pinned: { source: Preferences['source']; engine: Preferences['engine']; userId: string | null; count: number } | null = null;

subscribeDiagnosticsAccess(() => {
  if (!hasDiagnosticsAccess() || loadedToken !== diagnosticsAccessToken()) {
    preferences = { ...DEFAULTS }; loadedToken = null;
  }
  emit();
});
subscribeActiveTrackingModes(emit);
export const subscribeQaPreferences = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function getQaPreferences(): Preferences {
  const requested = hasDiagnosticsAccess() && loadedToken === diagnosticsAccessToken() ? preferences : DEFAULTS;
  const active = getActiveTrackingModes();
  return { ...requested,
    source: active.warmupActive && active.source ? active.source : pinned?.source ?? requested.source,
    engine: active.warmupActive && active.engine ? active.engine : pinned?.engine ?? requested.engine,
    diagnostics: hasDiagnosticsAccess() && requested.diagnostics,
  };
}
export function loadQaPreferences(): Promise<void> {
  const token = diagnosticsAccessToken();
  const uid = getDiagnosticsAccessSnapshot().userId;
  if (!token || !uid || loadedToken === token) return Promise.resolve();
  if (pending?.token === token) return pending.promise;
  const promise = (async () => {
    let parsed: Partial<Preferences> = {};
    try { await writes; const raw = await AsyncStorage.getItem(key(uid)); parsed = raw ? JSON.parse(raw) : {}; } catch { /* defaults */ }
    if (token !== diagnosticsAccessToken()) return;
    preferences = { source: parsed?.source === 'legacy' ? 'legacy' : 'precision', engine: parsed?.engine === 'build40' ? 'build40' : 'current', diagnostics: parsed?.diagnostics === true };
    loadedToken = token;
    emit();
  })();
  pending = { token, promise };
  void promise.finally(() => { if (pending?.promise === promise) pending = null; });
  return promise;
}
export function setQaPreference<K extends keyof Preferences>(field: K, value: Preferences[K]): void {
  const uid = getDiagnosticsAccessSnapshot().userId;
  if (!uid || !hasDiagnosticsAccess() || loadedToken !== diagnosticsAccessToken()) return;
  // Never switch the processing engine/source underneath an active stream or background lay.
  if (field !== 'diagnostics' && (pinned || getActiveTrackingModes().warmupActive)) return;
  preferences = { ...preferences, [field]: value };
  const payload = JSON.stringify(preferences);
  writes = writes.then(() => AsyncStorage.setItem(key(uid), payload)).catch(() => {});
  emit();
}
// Streams keep their original engine/source until stop, even after access is revoked.
// A different/denied account cannot start a new stream using another account's QA modes.
export function pinQaTrackingModes(): () => void {
  const uid = getDiagnosticsAccessSnapshot().userId;
  const current = getQaPreferences();
  const custom = current.engine !== DEFAULTS.engine || current.source !== DEFAULTS.source;
  if (custom && (!hasDiagnosticsAccess() || pinned && pinned.userId !== uid)) {
    throw new Error('Bitte die laufende Fährte beenden, bevor eine neue Aufnahme gestartet wird.');
  }
  if (pinned) pinned.count++;
  else pinned = { source: current.source, engine: current.engine, userId: uid, count: 1 };
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (pinned && --pinned.count === 0) { pinned = null; emit(); }
  };
}
