import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { MAPS_AVAILABLE, RNMaps } from '@/components/tracking/TrackMap';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { deleteRegionTiles, downloadRegion, planRegion, type DownloadOutcome, type DownloadProgress, type PlanError } from './downloader';
import {
  OFFLINE_MAPS_MAX_BYTES, OFFLINE_REGIONS_MAX, loadOfflineRegions, saveOfflineRegions, upsertOfflineRegion,
  usedBytes, useOfflineRegions, type OfflineRegion,
} from './regions';
import { DEFAULT_OFFLINE_SOURCE, OFFLINE_DETAIL_LEVELS, type OfflineDetail } from './sources';
import { expoTileFs, sourceCachePath } from './storage';
import { approxAreaKm2, regionToBounds, type Bounds } from './tiles';
import { OFFLINE_MAPS_NS } from './i18n';

type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
const START: MapRegion = { latitude: 51.0, longitude: 10.3, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const MB = 1024 * 1024;
const mb = (b: number) => (b / MB < 10 ? (b / MB).toFixed(1) : String(Math.round(b / MB)));
const KEEP_AWAKE_TAG = 'anyvo-offline-maps';

const PLAN_TEXT: Record<PlanError, string> = {
  invalid: 'errInvalid', 'source-blocked': 'errSource', 'outside-coverage': 'errCoverage',
  'too-many-tiles': 'errTiles', 'over-budget': 'errBudget', 'no-space': 'errSpace', 'too-many-regions': 'errRegions',
};
const OUTCOME_TEXT: Record<DownloadOutcome, string> = {
  complete: 'done', cancelled: 'cancelled', limit: 'errLimit', 'no-space': 'errNoSpace', failed: 'failed',
};

export default function OfflineMapsScreen() {
  const { t } = useTranslation(OFFLINE_MAPS_NS);
  const regions = useOfflineRegions();
  const [view, setView] = useState<MapRegion>(START);
  const [detail, setDetail] = useState<OfflineDetail>('standard');
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelled = useRef(false);
  const alive = useRef(true);
  const map = useRef<{ animateToRegion(region: object, ms?: number): void } | null>(null);
  const busy = progress != null;

  useEffect(() => {
    alive.current = true;
    expoTileFs.freeBytes().then(v => { if (alive.current) setFreeBytes(v); }, () => undefined);
    // Verlassen der Ansicht bricht ab; bisher geladene Teile bleiben und lassen sich fortsetzen.
    return () => { alive.current = false; cancelled.current = true; deactivateKeepAwake(KEEP_AWAKE_TAG); };
  }, []);

  const say = (text: string) => { if (!alive.current) return; setNotice(text); AccessibilityInfo.announceForAccessibility(text); };
  const bounds: Bounds = useMemo(() => regionToBounds(view), [view]);
  const level = OFFLINE_DETAIL_LEVELS[detail];
  const plan = useMemo(() => planRegion({
    bounds, sourceId: DEFAULT_OFFLINE_SOURCE, minZoom: level.minZoom, maxZoom: level.maxZoom,
    regions: regions ?? [], freeBytes,
  }), [bounds, level, regions, freeBytes]);
  const used = usedBytes(regions ?? []);

  const run = async (region: OfflineRegion) => {
    const base = sourceCachePath(region.sourceId);
    if (!base || busy) return;
    cancelled.current = false;
    setNotice(null);
    setProgress({ done: 0, total: region.tileCount, bytes: region.bytes, failed: 0 });
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    try {
      const all = await loadOfflineRegions();
      await upsertOfflineRegion(region);
      const { outcome } = await downloadRegion({
        region, otherRegions: all.filter(r => r.id !== region.id), baseDir: base, fs: expoTileFs,
        isCancelled: () => cancelled.current,
        onProgress: p => { if (alive.current) setProgress(p); },
        persist: r => upsertOfflineRegion(r),
      });
      say(t(OUTCOME_TEXT[outcome], { max: Math.round(OFFLINE_MAPS_MAX_BYTES / MB) }));
    } catch {
      say(t('failed'));
    } finally {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      if (alive.current) setProgress(null);
      expoTileFs.freeBytes().then(v => { if (alive.current) setFreeBytes(v); }, () => undefined);
    }
  };

  const startNew = () => {
    if (!plan.ok) return;
    const now = new Date().toISOString();
    void run({
      id: Crypto.randomUUID(), name: t('regionName', { n: (regions?.length ?? 0) + 1 }), sourceId: DEFAULT_OFFLINE_SOURCE,
      bounds, minZoom: plan.minZoom, maxZoom: plan.maxZoom, tileCount: plan.tileCount, downloadedTiles: 0, bytes: 0,
      status: 'partial', createdAt: now, updatedAt: now,
    });
  };

  const remove = (region: OfflineRegion) => Alert.alert(t('removeTitle'), t('removeBody'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('removeConfirm'), style: 'destructive', onPress: () => { void (async () => {
      const all = await loadOfflineRegions();
      const others = all.filter(r => r.id !== region.id);
      // Erst den Eintrag entfernen, dann die Dateien: bricht das Löschen ab, bleibt
      // höchstens ungenutzter Kartenplatz übrig, nie ein Eintrag ohne Karte.
      await saveOfflineRegions(others);
      const base = sourceCachePath(region.sourceId);
      if (base) await deleteRegionTiles({ region, otherRegions: others, baseDir: base, fs: expoTileFs });
    })().catch(() => undefined); } },
  ]);

  const show = (r: OfflineRegion) => map.current?.animateToRegion({
    latitude: (r.bounds.north + r.bounds.south) / 2, longitude: (r.bounds.east + r.bounds.west) / 2,
    latitudeDelta: r.bounds.north - r.bounds.south, longitudeDelta: r.bounds.east - r.bounds.west,
  }, 300);

  const MapView = RNMaps?.default, Polygon = RNMaps?.Polygon;
  const maxMb = Math.round(OFFLINE_MAPS_MAX_BYTES / MB);
  const planError = plan.ok ? null : t(PLAN_TEXT[plan.error], { max: maxMb, n: OFFLINE_REGIONS_MAX });

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        <ContactScreenHeader title={t('title')} />
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.body}>{t('intro')}</Text>
          <Text style={s.hint}>{t('coverage')}</Text>
          {MAPS_AVAILABLE && MapView ? (
            <View style={s.map} accessible accessibilityLabel={t('mapLabel')}>
              <MapView ref={map as never} style={StyleSheet.absoluteFill} provider={RNMaps!.PROVIDER_DEFAULT} mapType="hybrid"
                initialRegion={START} onRegionChangeComplete={(r: MapRegion) => setView(r)}
                showsUserLocation toolbarEnabled={false} pitchEnabled={false} rotateEnabled={false}>
                {Polygon ? (regions ?? []).map(r => <Polygon key={r.id} coordinates={[
                  { latitude: r.bounds.north, longitude: r.bounds.west }, { latitude: r.bounds.north, longitude: r.bounds.east },
                  { latitude: r.bounds.south, longitude: r.bounds.east }, { latitude: r.bounds.south, longitude: r.bounds.west },
                ]} strokeColor={C.trackPrimary} fillColor="rgba(0,255,204,0.12)" strokeWidth={2} />) : null}
              </MapView>
              <View pointerEvents="none" style={s.frame} />
            </View>
          ) : null}
          <Text style={s.hint}>{t('howTo')}</Text>

          <Text style={s.section} accessibilityRole="header">{t('detail')}</Text>
          <View style={s.chips} accessibilityRole="radiogroup">
            {(['standard', 'high'] as const).map(d => {
              const selected = detail === d;
              return <Pressable key={d} accessibilityRole="radio" accessibilityState={{ selected, disabled: busy }} disabled={busy}
                onPress={() => setDetail(d)} style={[s.chip, selected && s.chipOn]}>
                <Text style={[s.chipText, selected && s.chipTextOn]}>{t(d === 'standard' ? 'detailStandard' : 'detailHigh')}</Text>
              </Pressable>;
            })}
          </View>
          <Text style={s.hint}>{t('estimate', { mb: mb(plan.estimatedBytes), km2: approxAreaKm2(bounds).toFixed(1) })}</Text>
          {planError && !busy ? <Text style={s.warn} accessibilityRole="alert">{planError}</Text> : null}

          {busy ? (
            <View style={s.progressBox} accessibilityLiveRegion="polite">
              <Text style={s.body}>{t('progress', { done: progress.done, total: progress.total, mb: mb(progress.bytes) })}</Text>
              <View style={s.bar}><View style={[s.barFill, { width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }]} /></View>
              <Text style={s.hint}>{t('keepOpen')}</Text>
              <AnyvoButton label={t('cancel')} variant="secondary" onPress={() => { cancelled.current = true; }} />
            </View>
          ) : (
            <AnyvoButton label={t('download')} icon="cloud-download-outline" disabled={!plan.ok || !regions} onPress={startNew} />
          )}
          {notice ? <Text style={s.notice} accessibilityRole="alert">{notice}</Text> : null}
          <Text style={s.hint}>{t('onlineHint')}</Text>

          <Text style={s.section} accessibilityRole="header">{t('regions')}</Text>
          <Text style={s.hint}>{t('used', { used: mb(used), max: maxMb })}</Text>
          <View style={s.card}>
            {!regions?.length ? <Text style={[s.hint, s.empty]}>{t('none')}</Text> : regions.map((r, i) => (
              <View key={r.id} style={[s.row, i > 0 && s.rowLine]}>
                <Ionicons name={r.status === 'complete' ? 'map' : 'map-outline'} size={20} color={C.trackPrimary} accessible={false} />
                <Pressable style={s.rowMain} accessibilityRole="button" accessibilityLabel={`${t('show')}: ${r.name}`} onPress={() => show(r)}>
                  <Text style={s.rowText}>{r.name}{r.status === 'partial' ? ` · ${t('partial')}` : ''}</Text>
                  <Text style={s.hint}>{t('regionMeta', { mb: mb(r.bytes), date: new Date(r.updatedAt).toLocaleDateString() })}</Text>
                </Pressable>
                {r.status === 'partial' && !busy ? (
                  <Pressable style={s.icon} accessibilityRole="button" accessibilityLabel={`${t('resume')}: ${r.name}`} onPress={() => { void run(r); }}>
                    <Ionicons name="refresh" size={20} color={C.trackText} accessible={false} />
                  </Pressable>
                ) : null}
                <Pressable style={s.icon} accessibilityRole="button" accessibilityLabel={t('remove', { name: r.name })} disabled={busy}
                  onPress={() => remove(r)}>
                  <Ionicons name="trash-outline" size={20} color={C.trackDanger} accessible={false} />
                </Pressable>
              </View>
            ))}
          </View>
          <Text style={s.license}>{t('license')}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg }, flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  body: { color: C.trackText, fontSize: 15, lineHeight: 22 },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 21 },
  warn: { color: C.trackDanger, fontSize: 14, lineHeight: 21 },
  notice: { color: C.trackText, fontSize: 14, lineHeight: 21 },
  map: { height: 300, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  frame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, margin: 6, borderRadius: 14, borderWidth: 2, borderColor: C.trackPrimary, borderStyle: 'dashed' },
  section: { color: C.trackText, fontSize: 16, fontWeight: '700', marginTop: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  chipText: { color: C.trackText, fontSize: 15, fontWeight: '600' },
  chipTextOn: { color: '#04110F' },
  progressBox: { gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: C.trackPrimary },
  card: { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 14 },
  empty: { paddingVertical: 14 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.trackBorder },
  rowMain: { flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 6 },
  rowText: { color: C.trackText, fontSize: 15 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  license: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 8 },
});
