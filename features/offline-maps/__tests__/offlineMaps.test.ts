import { countTiles, iterateTiles, latToTileY, lngToTileX, regionToBounds, tileInBounds, type Bounds } from '../tiles';
import { OFFLINE_SOURCES, tileUrl } from '../sources';
import { deleteRegionTiles, downloadRegion, planRegion } from '../downloader';
import { ESTIMATED_TILE_BYTES, OFFLINE_MAPS_MAX_BYTES, OFFLINE_REGION_MAX_TILES, parseRegions, type OfflineRegion } from '../regions';
import type { TileFs } from '../storage';

jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///doc/' }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));

// Kleines Feld bei Frankfurt (ca. 600 × 600 m).
const FIELD: Bounds = { north: 50.103, south: 50.097, east: 8.685, west: 8.677 };
const GB = 1024 ** 3;

const region = (over: Partial<OfflineRegion> = {}): OfflineRegion => ({
  id: 'r1', name: 'Gebiet 1', sourceId: 'basemap-de', bounds: FIELD, minZoom: 14, maxZoom: 16,
  tileCount: countTiles(FIELD, 14, 16), downloadedTiles: 0, bytes: 0, status: 'partial',
  createdAt: '2026-11-28T10:00:00.000Z', updatedAt: '2026-11-28T10:00:00.000Z', ...over,
});

function memFs(opts: { failUrl?: (u: string) => boolean; size?: number; free?: number } = {}) {
  const files = new Map<string, number>();
  const downloads: string[] = [];
  const fs: TileFs = {
    exists: async uri => ({ exists: files.has(uri), size: files.get(uri) ?? 0 }),
    makeDir: async () => undefined,
    download: async (url, uri) => {
      downloads.push(url);
      if (opts.failUrl?.(url)) { files.set(uri, 12); return { status: 500, contentType: 'text/html' }; }
      files.set(uri, opts.size ?? 1000);
      return { status: 200, contentType: 'image/png' };
    },
    remove: async uri => { files.delete(uri); },
    freeBytes: async () => opts.free ?? 10 * GB,
  };
  return { fs, files, downloads };
}

describe('Kachel-Mathematik', () => {
  it('rechnet bekannte Kachelkoordinaten', () => {
    expect(lngToTileX(-180, 1)).toBe(0);
    expect(lngToTileX(179.9, 1)).toBe(1);
    expect(latToTileY(0.01, 1)).toBe(0);
    expect(latToTileY(-0.01, 1)).toBe(1);
    // Frankfurt z16 (unabhängig nachgerechnet)
    expect(lngToTileX(8.68, 16)).toBe(34348);
    expect(latToTileY(50.1, 16)).toBe(22197);
  });

  it('zählt genau die Kacheln, die der Iterator liefert', () => {
    const list = [...iterateTiles(FIELD, 12, 17)];
    expect(list).toHaveLength(countTiles(FIELD, 12, 17));
    expect(new Set(list.map(t => `${t.z}/${t.x}/${t.y}`)).size).toBe(list.length);
    expect(list.every(t => tileInBounds(t, FIELD))).toBe(true);
  });

  it('wandelt einen Kartenausschnitt in Grenzen um', () => {
    expect(regionToBounds({ latitude: 50, longitude: 8, latitudeDelta: 0.02, longitudeDelta: 0.04 }))
      .toEqual({ north: 50.01, south: 49.99, east: 8.02, west: 7.98 });
  });

  it('setzt basemap.de im Format z/y/x ein', () => {
    expect(tileUrl(OFFLINE_SOURCES['basemap-de'], { z: 16, x: 34348, y: 22197 }))
      .toBe('https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/16/22197/34348.png');
  });
});

describe('Lizenz und Speicherlimit', () => {
  const base = { bounds: FIELD, sourceId: 'basemap-de' as const, minZoom: 12, maxZoom: 17, regions: [], freeBytes: 10 * GB };

  it('erlaubt ein normales Fährtengebiet', () => {
    const plan = planRegion(base);
    expect(plan.ok).toBe(true);
    expect(plan.estimatedBytes).toBe(plan.tileCount * ESTIMATED_TILE_BYTES);
  });

  it('verweigert Quellen ohne Offline-Erlaubnis (swisstopo bis zur Bestätigung)', () => {
    const ch: Bounds = { north: 47.38, south: 47.37, east: 8.55, west: 8.54 };
    expect(planRegion({ ...base, bounds: ch, sourceId: 'swisstopo' })).toMatchObject({ ok: false, error: 'source-blocked' });
  });

  it('verweigert Gebiete ausserhalb der Abdeckung', () => {
    const zurich: Bounds = { north: 47.38, south: 47.37, east: 8.55, west: 8.54 };
    const strasbourg: Bounds = { north: 48.59, south: 48.58, east: 7.76, west: 7.74 };
    const salzburg: Bounds = { north: 47.81, south: 47.8, east: 13.05, west: 13.04 };
    for (const b of [zurich, strasbourg, salzburg]) {
      expect(planRegion({ ...base, bounds: b })).toMatchObject({ ok: false, error: 'outside-coverage' });
    }
  });

  it('erlaubt Gebiete in ganz Deutschland, auch nahe der Grenze', () => {
    const places: Bounds[] = [
      { north: 52.53, south: 52.52, east: 13.41, west: 13.4 },  // Berlin
      { north: 47.66, south: 47.65, east: 9.48, west: 9.47 },   // Friedrichshafen
      { north: 54.79, south: 54.78, east: 9.44, west: 9.43 },   // Flensburg
      { north: 47.99, south: 47.98, east: 7.86, west: 7.85 },   // Freiburg
      { north: 51.16, south: 51.15, east: 14.97, west: 14.96 }, // Görlitz
      { north: 50.78, south: 50.77, east: 6.09, west: 6.08 },   // Aachen
    ];
    for (const b of places) expect(planRegion({ ...base, bounds: b }).ok).toBe(true);
  });

  it('begrenzt die Grösse eines Gebiets', () => {
    const huge: Bounds = { north: 51, south: 50, east: 10, west: 9 };
    const plan = planRegion({ ...base, bounds: huge });
    expect(plan.tileCount).toBeGreaterThan(OFFLINE_REGION_MAX_TILES);
    expect(plan).toMatchObject({ ok: false, error: 'too-many-tiles' });
  });

  it('hält das Gesamtbudget von 500 MB ein', () => {
    const full = region({ id: 'old', bytes: OFFLINE_MAPS_MAX_BYTES - 1000 });
    expect(planRegion({ ...base, regions: [full] })).toMatchObject({ ok: false, error: 'over-budget' });
  });

  it('lässt immer Gerätespeicher für Trainingsdaten frei', () => {
    expect(planRegion({ ...base, freeBytes: 100 * 1024 * 1024 })).toMatchObject({ ok: false, error: 'no-space' });
  });
});

describe('Download', () => {
  it('lädt alle Kacheln und markiert das Gebiet als vollständig', async () => {
    const { fs, files } = memFs();
    const r = region();
    const res = await downloadRegion({ region: r, otherRegions: [], baseDir: 'file:///doc/offline-tiles/basemap-de', fs, isCancelled: () => false });
    expect(res.outcome).toBe('complete');
    expect(res.region.status).toBe('complete');
    expect(files.size).toBe(r.tileCount);
    expect(res.region.bytes).toBe(r.tileCount * 1000);
    expect([...files.keys()][0]).toMatch(/^file:\/\/\/doc\/offline-tiles\/basemap-de\/\d+\/\d+\/\d+$/);
  });

  it('setzt fort, ohne vorhandene Kacheln erneut zu laden', async () => {
    const { fs, downloads } = memFs();
    let n = 0;
    const first = await downloadRegion({ region: region(), otherRegions: [], baseDir: 'b', fs, isCancelled: () => ++n > 5, concurrency: 1 });
    expect(first.outcome).toBe('cancelled');
    expect(first.region.status).toBe('partial');
    const before = downloads.length;
    const second = await downloadRegion({ region: first.region, otherRegions: [], baseDir: 'b', fs, isCancelled: () => false });
    expect(second.outcome).toBe('complete');
    expect(downloads.length - before).toBe(region().tileCount - before);
  });

  it('löscht fehlerhafte Antworten sofort wieder', async () => {
    const { fs, files } = memFs({ failUrl: u => u.includes('/16/') });
    const res = await downloadRegion({ region: region(), otherRegions: [], baseDir: 'b', fs, isCancelled: () => false });
    expect(res.outcome).toBe('failed');
    expect([...files.keys()].some(k => k.startsWith('b/16/'))).toBe(false);
  });

  it('stoppt am Speicherlimit', async () => {
    const { fs } = memFs({ size: 1000 });
    const other = region({ id: 'other', bounds: { north: 52.5, south: 52.49, east: 13.4, west: 13.39 }, bytes: OFFLINE_MAPS_MAX_BYTES - 5000 });
    const res = await downloadRegion({ region: region(), otherRegions: [other], baseDir: 'b', fs, isCancelled: () => false, concurrency: 1 });
    expect(res.outcome).toBe('limit');
    expect(res.region.status).toBe('partial');
  });
});

describe('Leere Kacheln', () => {
  it('zählt 404 jenseits der Grenze nicht als Fehler', async () => {
    const files = new Map<string, number>();
    const fs: TileFs = {
      exists: async uri => ({ exists: files.has(uri), size: files.get(uri) ?? 0 }), makeDir: async () => undefined,
      download: async (url, uri) => { files.set(uri, 10); return url.includes('/16/') ? { status: 404, contentType: 'text/plain' } : { status: 200, contentType: 'image/png' }; },
      remove: async uri => { files.delete(uri); }, freeBytes: async () => 10 * GB,
    };
    const res = await downloadRegion({ region: region(), otherRegions: [], baseDir: 'b', fs, isCancelled: () => false });
    expect(res.outcome).toBe('complete');
    expect([...files.keys()].some(k => k.startsWith('b/16/'))).toBe(false);
  });
});

describe('Löschen', () => {
  it('löscht nur Kacheln, die kein anderes Gebiet braucht', async () => {
    const { fs, files } = memFs();
    const a = region({ id: 'a' });
    const bBounds = { ...FIELD, west: 8.681, east: 8.69 };
    const b = region({ id: 'b', bounds: bBounds, tileCount: countTiles(bBounds, 14, 16) });
    await downloadRegion({ region: a, otherRegions: [], baseDir: 'b', fs, isCancelled: () => false });
    await downloadRegion({ region: b, otherRegions: [a], baseDir: 'b', fs, isCancelled: () => false });
    await deleteRegionTiles({ region: a, otherRegions: [b], baseDir: 'b', fs });
    const left = [...files.keys()].map(k => { const [, z, x, y] = k.split('/').map(Number); return { z, x, y }; });
    expect(left.length).toBe(b.tileCount);
    expect(left.every(t => tileInBounds(t, b.bounds))).toBe(true);
  });
});

describe('Gespeicherte Gebiete', () => {
  it('liest gültige Einträge und verwirft kaputte, ohne zu werfen', () => {
    const ok = region();
    expect(parseRegions([ok, { id: 'x' }, null, ok, { ...ok, id: 'r2', sourceId: 'osm' }])).toEqual([ok]);
    expect(parseRegions('kaputt')).toEqual([]);
  });
});
