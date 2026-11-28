import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOfflineSourceId, type OfflineSourceId } from './sources';
import { isValidBounds, type Bounds, type TileKey, tileInBounds } from './tiles';

// Offline-Kartengebiete: nur Metadaten, nur auf diesem Gerät. Keine Kundendaten,
// kein Sync. Die Kacheln selbst liegen im Dateisystem (siehe storage.ts).

/** Gesamtbudget für alle Offline-Karten (Knurrix erlaubt ebenfalls bis 500 MB). */
export const OFFLINE_MAPS_MAX_BYTES = 500 * 1024 * 1024;
/** Höchstzahl Kacheln pro Gebiet: schont den Kartendienst (Fair Use) und den Akku. */
export const OFFLINE_REGION_MAX_TILES = 25_000;
/** Höchstzahl Gebiete, damit die Liste übersichtlich bleibt. */
export const OFFLINE_REGIONS_MAX = 20;
/** Vorsichtige Schätzung pro Kachel (basemap.de PNG, ländlich meist kleiner). */
export const ESTIMATED_TILE_BYTES = 20 * 1024;
/**
 * So viel Gerätespeicher bleibt immer frei. Trainingsdaten, Fährten und Fotos
 * werden lokal gespeichert; eine Karte darf den Speicher dafür nie aufbrauchen.
 */
export const FREE_SPACE_RESERVE_BYTES = 300 * 1024 * 1024;

export type OfflineRegionStatus = 'complete' | 'partial';

export type OfflineRegion = {
  id: string;
  name: string;
  sourceId: OfflineSourceId;
  bounds: Bounds;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  downloadedTiles: number;
  bytes: number;
  status: OfflineRegionStatus;
  createdAt: string;
  updatedAt: string;
};

const KEY = 'anyvo_offline_map_regions_v1';

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function parseRegion(v: unknown): OfflineRegion | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null;
  if (!isOfflineSourceId(r.sourceId) || !isValidBounds(r.bounds as Bounds)) return null;
  if (!isInt(r.minZoom, 0, 22) || !isInt(r.maxZoom, 0, 22) || r.minZoom > r.maxZoom) return null;
  if (!isInt(r.tileCount, 0, 10_000_000) || !isInt(r.downloadedTiles, 0, 10_000_000)) return null;
  if (typeof r.bytes !== 'number' || !Number.isFinite(r.bytes) || r.bytes < 0) return null;
  const b = r.bounds as Bounds;
  return {
    id: r.id, name: r.name.slice(0, 60), sourceId: r.sourceId,
    bounds: { north: b.north, south: b.south, east: b.east, west: b.west },
    minZoom: r.minZoom, maxZoom: r.maxZoom, tileCount: r.tileCount, downloadedTiles: r.downloadedTiles,
    bytes: r.bytes, status: r.status === 'complete' ? 'complete' : 'partial',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date(0).toISOString(),
  };
}

export function parseRegions(v: unknown): OfflineRegion[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: OfflineRegion[] = [];
  for (const item of v) {
    const r = parseRegion(item);
    if (r && !seen.has(r.id)) { seen.add(r.id); out.push(r); }
  }
  return out;
}

export const usedBytes = (regions: readonly OfflineRegion[]) => regions.reduce((sum, r) => sum + r.bytes, 0);

/** Liegt die Kachel in einem anderen gespeicherten Gebiet derselben Quelle? (Kacheln werden geteilt.) */
export function tileUsedByOther(t: TileKey, regions: readonly OfflineRegion[], exceptId: string, sourceId: OfflineSourceId): boolean {
  return regions.some(r => r.id !== exceptId && r.sourceId === sourceId
    && t.z >= r.minZoom && t.z <= r.maxZoom && tileInBounds(t, r.bounds));
}

let cache: OfflineRegion[] | null = null;
const listeners = new Set<(regions: OfflineRegion[]) => void>();

/** Synchroner Stand für Karten, die beim ersten Rendern entscheiden müssen (null = noch nicht geladen). */
export function cachedOfflineRegions(): OfflineRegion[] | null { return cache; }

export async function loadOfflineRegions(): Promise<OfflineRegion[]> {
  if (cache) return cache;
  let parsed: unknown = [];
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch { parsed = []; }
  cache = parseRegions(parsed);
  return cache;
}

export async function saveOfflineRegions(regions: readonly OfflineRegion[]): Promise<OfflineRegion[]> {
  const next = parseRegions(regions);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  cache = next;
  for (const l of listeners) l(next);
  return next;
}

export async function upsertOfflineRegion(region: OfflineRegion): Promise<OfflineRegion[]> {
  const current = await loadOfflineRegions();
  const rest = current.filter(r => r.id !== region.id);
  return saveOfflineRegions([...rest, region]);
}

export function useOfflineRegions(): OfflineRegion[] | null {
  const [regions, setRegions] = useState<OfflineRegion[] | null>(cache);
  useEffect(() => {
    let alive = true;
    const l = (next: OfflineRegion[]) => { if (alive) setRegions(next); };
    listeners.add(l);
    loadOfflineRegions().then(l, () => {});
    return () => { alive = false; listeners.delete(l); };
  }, []);
  return regions;
}

/** Nur für Tests. */
export function __resetOfflineRegionCache() { cache = null; listeners.clear(); }
