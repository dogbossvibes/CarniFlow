import type { Bounds, Ring } from './tiles';

// Kartenquellen für Offline-Gebiete.
//
// LIZENZ (Stand 2026-11-28, Quellen im PR verlinkt):
// - Apple Maps / Google Maps (die normale Satelliten-/Hybridkarte der App) dürfen
//   nicht vorab gespeichert werden. Darum bleibt die Online-Karte unverändert und
//   offline liegt eine eigene, frei lizenzierte Karte darüber.
// - tile.openstreetmap.org verbietet Vorab-Download und Offline-Nutzung ausdrücklich
//   ("You must not: Bulk download tiles or offer prefetch features") → nicht verwenden.
// - basemap.de Web Raster (BKG): CC BY 4.0 bzw. DL-DE->BY-2.0. Vervielfältigung ist
//   erlaubt, Pflicht ist die deutlich sichtbare Namensnennung. → freigeschaltet.
// - swisstopo: freie Nutzung mit Quellenangabe, aber Fair-Use-Regel; für Offline-
//   Nutzung verweist swisstopo auf den Download-Dienst statt auf Kachel-Abrufe.
//   → vorbereitet, aber gesperrt, bis swisstopo das schriftlich bestätigt.
//
// Neue Quelle nur mit `offlineAllowed: true`, wenn ihre Lizenz Vorab-Download
// ausdrücklich erlaubt. Der Downloader verweigert alle anderen Quellen.

export type OfflineSourceId = 'basemap-de' | 'swisstopo';

export type OfflineMapSource = {
  id: OfflineSourceId;
  name: string;
  /** XYZ-Vorlage mit {z}, {x}, {y}. */
  urlTemplate: string;
  minZoom: number;
  maxZoom: number;
  coverage: Bounds;
  /** Grober Umriss (± einige km). Ohne Umriss gilt das Rechteck. */
  coverageRing?: Ring;
  coverageLabel: string;
  offlineAllowed: boolean;
  /** Pflicht-Namensnennung; {year} = Jahr des Datenbezugs. */
  attribution: string;
  licenseUrl: string;
};

// Vereinfachter Umriss Deutschlands ([lng, lat], im Uhrzeigersinn ab Ostfriesland).
// Bewusst grob: entscheidet nur, ob ein Gebiet angeboten wird.
const GERMANY_RING: Ring = [
  [6.6, 53.7], [8.0, 53.9], [8.0, 54.9], [8.6, 55.06], [9.4, 54.85], [10.0, 54.85], [11.0, 54.6], [12.0, 54.5],
  [13.0, 54.75], [14.0, 54.2], [14.25, 53.9], [14.45, 53.3], [14.15, 52.85], [14.6, 52.6], [14.7, 52.1],
  [14.75, 51.6], [15.05, 51.25], [15.0, 50.85], [14.4, 50.9], [14.0, 50.8], [13.5, 50.6], [12.9, 50.4],
  [12.1, 50.32], [12.5, 49.95], [12.4, 49.7], [12.9, 49.35], [13.4, 49.1], [13.85, 48.75], [13.75, 48.5],
  [13.45, 48.55], [13.0, 48.3], [12.75, 48.12], [12.95, 47.95], [13.0, 47.85], [12.98, 47.75], [13.08, 47.6],
  [13.05, 47.5], [12.75, 47.55], [12.2, 47.6], [11.6, 47.5], [11.2, 47.4], [10.9, 47.45], [10.45, 47.55],
  [10.2, 47.27], [9.95, 47.5], [9.6, 47.53], [9.5, 47.58], [9.2, 47.655], [8.9, 47.65], [8.7, 47.78],
  [8.55, 47.8], [8.4, 47.6], [8.2, 47.6], [7.6, 47.58], [7.55, 47.7], [7.53, 48.0], [7.6, 48.3], [7.7, 48.4],
  [7.79, 48.6], [8.0, 48.8], [8.2, 48.97], [7.6, 49.05], [7.0, 49.15], [6.35, 49.47], [6.4, 49.8], [6.1, 50.15],
  [6.4, 50.35], [6.15, 50.55], [6.0, 50.75], [5.9, 51.05], [6.2, 51.2], [6.2, 51.4], [5.95, 51.75], [6.0, 51.85],
  [6.8, 51.95], [7.05, 52.25], [6.7, 52.45], [7.05, 52.65], [7.2, 53.25], [6.9, 53.35],
];

export const OFFLINE_SOURCES: Record<OfflineSourceId, OfflineMapSource> = {
  'basemap-de': {
    id: 'basemap-de',
    name: 'basemap.de',
    urlTemplate: 'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png',
    minZoom: 10,
    maxZoom: 18,
    coverage: { north: 55.06, south: 47.27, east: 15.05, west: 5.86 },
    coverageRing: GERMANY_RING,
    coverageLabel: 'DE',
    offlineAllowed: true,
    attribution: '© GeoBasis-DE / BKG ({year}) CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  swisstopo: {
    id: 'swisstopo',
    name: 'swisstopo',
    urlTemplate: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    minZoom: 10,
    maxZoom: 18,
    coverage: { north: 47.81, south: 45.82, east: 10.49, west: 5.96 },
    coverageLabel: 'CH',
    offlineAllowed: false,
    attribution: '© Daten: swisstopo',
    licenseUrl: 'https://www.geo.admin.ch/de/allgemeine-nutzungsbedingungen-bgdi',
  },
};

export const DEFAULT_OFFLINE_SOURCE: OfflineSourceId = 'basemap-de';

export function isOfflineSourceId(v: unknown): v is OfflineSourceId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(OFFLINE_SOURCES, v);
}

export function tileUrl(source: OfflineMapSource, t: { z: number; x: number; y: number }): string {
  return source.urlTemplate.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
}

export function attributionText(source: OfflineMapSource, year: number): string {
  return source.attribution.replace('{year}', String(year));
}

/** Detailstufen für die Auswahl. Höchste Stufe zuerst begrenzen, das spart am meisten Speicher. */
export const OFFLINE_DETAIL_LEVELS = {
  standard: { minZoom: 12, maxZoom: 17 },
  high: { minZoom: 12, maxZoom: 18 },
} as const;
export type OfflineDetail = keyof typeof OFFLINE_DETAIL_LEVELS;
