import {
  ESTIMATED_TILE_BYTES, FREE_SPACE_RESERVE_BYTES, OFFLINE_MAPS_MAX_BYTES, OFFLINE_REGION_MAX_TILES,
  OFFLINE_REGIONS_MAX, tileUsedByOther, usedBytes, type OfflineRegion,
} from './regions';
import { OFFLINE_SOURCES, tileUrl, type OfflineSourceId } from './sources';
import { tileDir, tileFile, type TileFs } from './storage';
import { boundsCenterInRing, boundsInside, countTiles, isValidBounds, iterateTiles, type Bounds } from './tiles';

export type PlanError = 'invalid' | 'source-blocked' | 'outside-coverage' | 'too-many-tiles'
  | 'over-budget' | 'no-space' | 'too-many-regions';

export type RegionPlan =
  | { ok: true; tileCount: number; estimatedBytes: number; minZoom: number; maxZoom: number }
  | { ok: false; error: PlanError; tileCount: number; estimatedBytes: number };

export function planRegion(input: {
  bounds: Bounds; sourceId: OfflineSourceId; minZoom: number; maxZoom: number;
  regions: readonly OfflineRegion[]; freeBytes: number | null;
}): RegionPlan {
  const source = OFFLINE_SOURCES[input.sourceId];
  if (!isValidBounds(input.bounds)) return { ok: false, error: 'invalid', tileCount: 0, estimatedBytes: 0 };
  const minZoom = Math.max(source.minZoom, input.minZoom);
  const maxZoom = Math.min(source.maxZoom, input.maxZoom);
  if (minZoom > maxZoom) return { ok: false, error: 'invalid', tileCount: 0, estimatedBytes: 0 };
  const tileCount = countTiles(input.bounds, minZoom, maxZoom);
  const estimatedBytes = tileCount * ESTIMATED_TILE_BYTES;
  const fail = (error: PlanError): RegionPlan => ({ ok: false, error, tileCount, estimatedBytes });
  if (!source.offlineAllowed) return fail('source-blocked');
  if (!boundsInside(input.bounds, source.coverage)
    || (source.coverageRing && !boundsCenterInRing(input.bounds, source.coverageRing))) return fail('outside-coverage');
  if (input.regions.length >= OFFLINE_REGIONS_MAX) return fail('too-many-regions');
  if (tileCount > OFFLINE_REGION_MAX_TILES) return fail('too-many-tiles');
  if (usedBytes(input.regions) + estimatedBytes > OFFLINE_MAPS_MAX_BYTES) return fail('over-budget');
  if (input.freeBytes != null && input.freeBytes - estimatedBytes < FREE_SPACE_RESERVE_BYTES) return fail('no-space');
  return { ok: true, tileCount, estimatedBytes, minZoom, maxZoom };
}

export type DownloadOutcome = 'complete' | 'cancelled' | 'limit' | 'no-space' | 'failed';
export type DownloadProgress = { done: number; total: number; bytes: number; failed: number };

const USER_AGENT = 'ANYVO-App/1.0 (Offline-Karten)';
const isImage = (ct: string | null) => ct == null || /^image\//i.test(ct);

/**
 * Lädt alle Kacheln eines Gebiets. Vorhandene Kacheln werden übersprungen, darum
 * setzt ein erneuter Start einen abgebrochenen Download einfach fort.
 * Fehlerhafte Antworten werden sofort wieder gelöscht (nie kaputte Kacheln im Cache).
 */
export async function downloadRegion(opts: {
  region: OfflineRegion;
  otherRegions: readonly OfflineRegion[];
  baseDir: string;
  fs: TileFs;
  isCancelled: () => boolean;
  onProgress?: (p: DownloadProgress) => void;
  persist?: (r: OfflineRegion) => Promise<unknown>;
  concurrency?: number;
  now?: () => Date;
}): Promise<{ region: OfflineRegion; outcome: DownloadOutcome }> {
  const { fs, baseDir, isCancelled } = opts;
  const source = OFFLINE_SOURCES[opts.region.sourceId];
  const now = opts.now ?? (() => new Date());
  if (!source.offlineAllowed) return { region: opts.region, outcome: 'failed' };

  const budget = OFFLINE_MAPS_MAX_BYTES - usedBytes(opts.otherRegions);
  const total = countTiles(opts.region.bounds, opts.region.minZoom, opts.region.maxZoom);
  let bytes = 0, done = 0, failed = 0, stop: DownloadOutcome | null = null;
  const madeDirs = new Set<string>();
  const tiles = iterateTiles(opts.region.bounds, opts.region.minZoom, opts.region.maxZoom);

  const snapshot = (status: OfflineRegion['status']): OfflineRegion => ({
    ...opts.region, tileCount: total, downloadedTiles: done - failed, bytes, status, updatedAt: now().toISOString(),
  });

  const worker = async () => {
    for (;;) {
      if (stop) return;
      if (isCancelled()) { stop = 'cancelled'; return; }
      const next = tiles.next();
      if (next.done) return;
      const t = next.value;
      const file = tileFile(baseDir, t);
      try {
        const have = await fs.exists(file);
        if (have.exists && have.size > 0) {
          // Geteilte Kachel eines anderen Gebiets zählt dort; eigene Altkachel hier.
          if (!tileUsedByOther(t, opts.otherRegions, opts.region.id, opts.region.sourceId)) bytes += have.size;
        } else {
          const dir = tileDir(baseDir, t);
          if (!madeDirs.has(dir)) { await fs.makeDir(dir); madeDirs.add(dir); }
          const res = await fs.download(tileUrl(source, t), file, { 'User-Agent': USER_AGENT });
          const got = await fs.exists(file);
          if (res.status === 404 || res.status === 204) {
            // Keine Kartendaten hier (z. B. jenseits der Landesgrenze): leer lassen, kein Fehler.
            await fs.remove(file).catch(() => undefined);
          } else if (res.status !== 200 || !isImage(res.contentType) || !got.exists || got.size === 0) {
            await fs.remove(file).catch(() => undefined);
            failed++;
          } else {
            bytes += got.size;
          }
        }
      } catch {
        await fs.remove(file).catch(() => undefined);
        failed++;
      }
      done++;
      if (bytes > budget) { stop = 'limit'; return; }
      if (done % 200 === 0) {
        const free = await fs.freeBytes().catch(() => null);
        if (free != null && free < FREE_SPACE_RESERVE_BYTES) { stop = 'no-space'; return; }
        if (opts.persist) await opts.persist(snapshot('partial')).catch(() => undefined);
      }
      opts.onProgress?.({ done, total, bytes, failed });
      // Viele Fehler in Folge = kein Netz oder Dienst gesperrt → nicht weiter hämmern.
      if (failed >= 50 && failed > done / 2) { stop = 'failed'; return; }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(6, opts.concurrency ?? 4)) }, worker));
  const outcome: DownloadOutcome = stop ?? (failed === 0 ? 'complete' : 'failed');
  const region = snapshot(outcome === 'complete' ? 'complete' : 'partial');
  if (opts.persist) await opts.persist(region).catch(() => undefined);
  return { region, outcome };
}

/**
 * Löscht nur die Kacheln dieses Gebiets, die kein anderes Gebiet braucht.
 * Berührt nichts ausserhalb des Kachelordners.
 */
export async function deleteRegionTiles(opts: {
  region: OfflineRegion; otherRegions: readonly OfflineRegion[]; baseDir: string; fs: TileFs;
}): Promise<number> {
  let removed = 0;
  for (const t of iterateTiles(opts.region.bounds, opts.region.minZoom, opts.region.maxZoom)) {
    if (tileUsedByOther(t, opts.otherRegions, opts.region.id, opts.region.sourceId)) continue;
    await opts.fs.remove(tileFile(opts.baseDir, t)).catch(() => undefined);
    removed++;
  }
  return removed;
}
