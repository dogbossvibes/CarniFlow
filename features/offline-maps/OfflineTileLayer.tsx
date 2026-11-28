import { useEffect, useState, type ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addNetListener, fetchIsOnline } from '@/features/sync/services/netinfo';
import { cachedOfflineRegions, loadOfflineRegions } from './regions';
import { OFFLINE_SOURCES, attributionText, type OfflineSourceId } from './sources';
import { sourceCachePath } from './storage';

// Früh laden, damit Karten beim ersten Rendern schon wissen, ob es Offline-Gebiete gibt.
void loadOfflineRegions().catch(() => undefined);

/**
 * Welche Quellen eine Karte als Offline-Ebene bekommt. Wird beim ERSTEN Rendern der
 * Karte festgelegt und danach nicht mehr geändert: Apple Maps legt nachträglich
 * eingefügte Ebenen immer obenauf, sie würden sonst die Fährtenlinie verdecken.
 * Ohne gespeicherte Gebiete bleibt die Karte exakt wie bisher (keine neue Ebene).
 */
export function useOfflineLayerSources(): OfflineSourceId[] {
  const [sources] = useState<OfflineSourceId[]>(() => {
    const regions = cachedOfflineRegions() ?? [];
    return [...new Set(regions.filter(r => r.downloadedTiles > 0 && OFFLINE_SOURCES[r.sourceId].offlineAllowed).map(r => r.sourceId))];
  });
  return sources;
}

/** Netzstatus nur, wenn die Karte überhaupt eine Offline-Ebene hat (sonst kein Listener, keine Änderung). */
export function useIsOnline(enabled: boolean): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchIsOnline().then(v => { if (alive) setOnline(v); }, () => undefined);
    const unsub = addNetListener(({ online: v }) => { if (alive) setOnline(v); });
    return () => { alive = false; try { unsub(); } catch { /* egal */ } };
  }, [enabled]);
  return online;
}

type UrlTileLike = ComponentType<{
  urlTemplate: string; tileCachePath?: string; offlineMode?: boolean; opacity?: number;
  maximumZ?: number; maximumNativeZ?: number; minimumZ?: number; zIndex?: number; tileSize?: number;
}>;

/**
 * Gespeicherte Kacheln als unterste Ebene. offlineMode ist IMMER an: die Ebene lädt
 * nie selbst aus dem Netz (kein Datenverbrauch, keine Last beim Kartendienst).
 * Online unsichtbar, damit die gewohnte Satellitenkarte bleibt.
 * Als ERSTES Kind der MapView rendern.
 */
export function OfflineTileLayers({ UrlTile, sources, online }: { UrlTile: UrlTileLike | undefined; sources: OfflineSourceId[]; online: boolean }) {
  if (!UrlTile || sources.length === 0) return null;
  return <>{sources.map(id => {
    const path = sourceCachePath(id);
    const src = OFFLINE_SOURCES[id];
    if (!path) return null;
    return <UrlTile key={`offline-${id}`} urlTemplate={src.urlTemplate} tileCachePath={path} offlineMode
      opacity={online ? 0 : 1} minimumZ={src.minZoom} maximumNativeZ={src.maxZoom} maximumZ={21} zIndex={-1} tileSize={256} />;
  })}</>;
}

/** Pflicht-Namensnennung, sichtbar solange die Offline-Karte angezeigt wird. */
export function OfflineAttribution({ sources, online, bottom = 4 }: { sources: OfflineSourceId[]; online: boolean; bottom?: number }) {
  if (online || sources.length === 0) return null;
  // CC BY verlangt das Jahr des Datenbezugs: jüngster Download der Quelle.
  const regions = cachedOfflineRegions() ?? [];
  const yearOf = (id: OfflineSourceId) => regions.filter(r => r.sourceId === id)
    .reduce((y, r) => Math.max(y, new Date(r.updatedAt).getFullYear() || 0), 0) || new Date().getFullYear();
  return (
    <View pointerEvents="none" style={[s.badge, { bottom }]}>
      <Text style={s.text} numberOfLines={2}>{sources.map(id => attributionText(OFFLINE_SOURCES[id], yearOf(id))).join(' · ')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { position: 'absolute', left: 4, maxWidth: '80%', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  text: { color: '#111', fontSize: 10 },
});
