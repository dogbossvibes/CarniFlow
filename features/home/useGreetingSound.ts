import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

type Snapshot = { ready: boolean; enabled: boolean };
type Entry = { state: Snapshot; saved: boolean; revision: number; loading?: Promise<void>; writes: Promise<void> };
const empty: Snapshot = { ready: false, enabled: false };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const key = (owner: string) => `anyvo:greeting-sound:v1:${owner}`;
function entry(owner: string): Entry {
  let value = entries.get(owner);
  if (!value) { value = { state: empty, saved: false, revision: 0, writes: Promise.resolve() }; entries.set(owner, value); }
  return value;
}
export async function loadGreetingSound(owner: string): Promise<void> {
  const value = entry(owner);
  if (value.state.ready) return;
  if (!value.loading) value.loading = (async () => {
    let enabled = false;
    try { enabled = await AsyncStorage.getItem(key(owner)) === 'true'; } catch { /* Default off. */ }
    value.saved = enabled; value.state = { ready: true, enabled }; emit();
  })();
  await value.loading;
}
export async function setGreetingSound(owner: string, enabled: boolean): Promise<boolean> {
  const value = entry(owner);
  if (!value.state.ready) return false;
  const revision = ++value.revision;
  value.state = { ready: true, enabled }; emit();
  const write = value.writes.then(async () => { await AsyncStorage.setItem(key(owner), String(enabled)); value.saved = enabled; });
  value.writes = write.catch(() => {});
  try { await write; return true; }
  catch {
    if (value.revision === revision) { value.state = { ready: true, enabled: value.saved }; emit(); }
    return false;
  }
}
export function useGreetingSound(owner?: string) {
  const get = useCallback(() => owner ? entry(owner).state : empty, [owner]);
  const state = useSyncExternalStore(subscribe, get, get);
  useEffect(() => { if (owner) void loadGreetingSound(owner); }, [owner]);
  return { ...state, setEnabled: (enabled: boolean) => owner ? setGreetingSound(owner, enabled) : Promise.resolve(false) };
}
