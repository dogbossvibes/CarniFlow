import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDb } from '@/lib/localDb/client';
import { HOME_ZONE_MAX, insideHomeZone, parseHomeZones, type HomeZone } from './zones';

// Die Zonen bleiben bewusst nur auf diesem Gerät (Entscheid Issue #115): die
// Wohnadresse wird weder synchronisiert noch an einen Server geschickt.
const ZONES_KEY = 'anyvo_home_zones_v1';
const HINT_KEY = 'anyvo_home_zone_hint_seen_v1';

let cache: HomeZone[] | null = null;
const listeners = new Set<(zones: HomeZone[]) => void>();

/** Wirft bei Speicherfehlern: Aufrufer brechen das Teilen dann ab, statt ungeschützt zu teilen. */
export async function loadHomeZones(): Promise<HomeZone[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(ZONES_KEY);
  let parsed: unknown = [];
  if (raw) { try { parsed = JSON.parse(raw); } catch { throw new Error('home-zone-storage'); } }
  cache = parseHomeZones(parsed);
  return cache;
}

export async function saveHomeZones(zones: readonly HomeZone[]): Promise<HomeZone[]> {
  const next = parseHomeZones(zones.slice(0, HOME_ZONE_MAX));
  await AsyncStorage.setItem(ZONES_KEY, JSON.stringify(next));
  cache = next;
  for (const listener of listeners) listener(next);
  return next;
}

/** null = noch nicht geladen oder Speicher nicht lesbar. */
export function useHomeZones(): HomeZone[] | null {
  const [zones, setZones] = useState<HomeZone[] | null>(cache);
  useEffect(() => {
    let alive = true;
    const listener = (next: HomeZone[]) => { if (alive) setZones(next); };
    listeners.add(listener);
    loadHomeZones().then(listener, () => {});
    return () => { alive = false; listeners.delete(listener); };
  }, []);
  return zones;
}

export async function homeZoneHintSeen(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(HINT_KEY)) === '1'; } catch { return true; }
}
export async function markHomeZoneHintSeen(): Promise<void> {
  try { await AsyncStorage.setItem(HINT_KEY, '1'); } catch { /* Hinweis erscheint dann erneut. */ }
}

/** Liegt ein Punkt der lokal gespeicherten Fährte in einer Zone? Liest nur. */
export async function localTrackTouchesHomeZone(sessionLocalId: string): Promise<boolean> {
  const zones = await loadHomeZones();
  if (!zones.length) return false;
  const db = await getLocalDb();
  const points = await db.getAllAsync<{ latitude: number | null; longitude: number | null }>(
    'select latitude, longitude from local_track_points where session_local_id=?', sessionLocalId);
  const markers = await db.getAllAsync<{ latitude: number | null; longitude: number | null }>(
    'select latitude, longitude from local_track_markers where session_local_id=?', sessionLocalId);
  return [...points, ...markers].some(p => typeof p.latitude === 'number' && typeof p.longitude === 'number'
    && insideHomeZone({ lat: p.latitude, lng: p.longitude }, zones));
}

export function resetHomeZoneCacheForTests(): void { cache = null; listeners.clear(); }
