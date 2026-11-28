import * as FileSystem from 'expo-file-system/legacy';
import type { OfflineSourceId } from './sources';
import type { TileKey } from './tiles';

// Dateiablage der Offline-Kacheln. Das Layout {z}/{x}/{y} (ohne Endung) ist genau
// das, was react-native-maps <UrlTile tileCachePath> auf iOS und Android liest.
// Eigener Ordner, getrennt von Fährten-, Medien- und Datenbankdateien: Löschen hier
// berührt nie Kundendaten.

export type TileFs = {
  exists(uri: string): Promise<{ exists: boolean; size: number }>;
  makeDir(uri: string): Promise<void>;
  download(url: string, uri: string, headers: Record<string, string>): Promise<{ status: number; contentType: string | null }>;
  remove(uri: string): Promise<void>;
  freeBytes(): Promise<number>;
};

const ROOT_NAME = 'offline-tiles';

export function offlineTilesRoot(): string | null {
  const doc = FileSystem.documentDirectory;
  return doc ? `${doc}${ROOT_NAME}/` : null;
}

/** Ohne abschliessenden Schrägstrich: react-native-maps hängt selbst "/" an. */
export function sourceCachePath(sourceId: OfflineSourceId): string | null {
  const root = offlineTilesRoot();
  return root ? `${root}${sourceId}` : null;
}

export const tileDir = (base: string, t: TileKey) => `${base}/${t.z}/${t.x}`;
export const tileFile = (base: string, t: TileKey) => `${base}/${t.z}/${t.x}/${t.y}`;

export const expoTileFs: TileFs = {
  async exists(uri) {
    const info = await FileSystem.getInfoAsync(uri);
    return { exists: info.exists && !info.isDirectory, size: info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0 };
  },
  makeDir: uri => FileSystem.makeDirectoryAsync(uri, { intermediates: true }),
  async download(url, uri, headers) {
    const res = await FileSystem.downloadAsync(url, uri, { headers });
    const ct = Object.entries(res.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? null;
    return { status: res.status, contentType: ct };
  },
  remove: uri => FileSystem.deleteAsync(uri, { idempotent: true }),
  freeBytes: () => FileSystem.getFreeDiskStorageAsync(),
};
