import { useSession } from '@/hooks/useSession';
import { ensureOwnTransferLocal } from '@/features/tracking-transfer/runtime';
import { dogPaceReference, currentPaceReference } from '@/features/tracking/utils/paceReference';
import { getDogPaceHistory } from '@/features/tracking/services/dogPaceHistoryService';
import { supabase } from '@/lib/supabase';
import { useDogTrackColor } from '@/features/tracking/hooks/useDogTrackColor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { getTrackSessionById } from '@/features/tracking/services/trackService';
import { getLocalTrackDetail, getLocalRunSupplement } from '@/features/tracking/services/trackHistoryService';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import type { MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackReplayMap } from '@/features/tracking/components/TrackReplayMap';
import { SegmentDetailSheet } from '@/features/tracking/components/SegmentDetailSheet';
import { extractTrackReplayData } from '@/features/tracking/utils/trackReplayData';
import {
  initialReplayState, tickReplay, playReplay, pauseReplay, seekReplay, setReplaySpeed,
  replayProgress, formatReplayClock, replayPositionAt, replayTraveledPoints, replayEventsFromSegments, segmentAtTime,
  REPLAY_SPEEDS, type ReplaySpeed, type ReplayEvent,
} from '@/features/tracking/engine/trackReplay';
import { buildHeatmapParts, PACE_BAND_COLORS, type HeatmapMetric } from '@/features/tracking/engine/trackHeatmap';
import type { AnalyticsSegment } from '@/features/tracking/engine/trackSegmentAnalysis';
import { isTrackAnalyticsV3 } from '@/features/tracking/engine/trackAnalyticsV3';

const HEATMAP_METRICS: HeatmapMetric[] = ['deviation', 'confidence', 'pace'];
const HEATMAP_METRIC_LABEL_KEY = {
  deviation: 'track.replay.heatmapDeviation',
  confidence: 'track.replay.heatmapConfidence',
  pace: 'track.replay.heatmapPace',
} as const;
const EVENT_ICON: Record<ReplayEvent['type'], React.ComponentProps<typeof Ionicons>['name']> = {
  corner: 'git-branch', object: 'flag', reacquisition: 'return-up-forward', high_deviation: 'warning',
};

export default function TrackReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const [data, setData] = useState<any | null>(null);
  const { color: layColor } = useDogTrackColor(data?.dog_id);
  const [loading, setLoading] = useState(true);
  const { session } = useSession();
  const generation = useRef(0);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => { const { data: auth } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { generation.current++; setData(null); setEpoch(n => n + 1); }
  }); return () => auth.subscription.unsubscribe(); }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true; const token = generation.current, userId = session?.user.id;
    setData(null); setLoading(true);
    (async () => {
      const r = await getTrackSessionById(id);
      let d = r.data;
      if (d?.track_data?.trackTransferReceipt) {
        if (!alive || token !== generation.current) return;
        if (!userId || d.owner_id !== userId) throw new Error('ACCOUNT_CHANGED');
        const restored = await ensureOwnTransferLocal(id);
        if (restored.error) throw new Error(restored.error);
        d = await getLocalTrackDetail(id, userId);
      }
      if (!d) {
        d = await getLocalTrackDetail(id, userId).catch(() => null);
      } else if (!(d.runs?.length)) {
        const sup = await getLocalRunSupplement(id, userId).catch(() => null);
        if (sup?.runs?.length) d = { ...d, runs: sup.runs, track_data: { ...(d.track_data ?? {}), ...sup.track_data } };
      }
      if (!alive || token !== generation.current) return;
      setData(d);
      setLoading(false);
    })().catch(() => { if (alive && token === generation.current) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, [id, session?.user.id, epoch]);

  const replayData = useMemo(() => extractTrackReplayData(data), [data]);
  const [paceHistory,setPaceHistory]=useState<unknown[]>([]);
  useEffect(()=>{let active=true;setPaceHistory([]);
    if(data?.dog_id)void (async()=>{
      try {const {data:{session}}=await supabase.auth.getSession();
        if(!session?.user)return;
        const rows=await getDogPaceHistory(session.user.id, data.dog_id);
        if(active)setPaceHistory(rows);
      } catch { /* Offline: retain the explicit current-search fallback. */ }
    })();
    return()=>{active=false;};
  },[data?.id,data?.dog_id]);
  const paceReference=useMemo(()=>dogPaceReference(data,paceHistory) ?? currentPaceReference(replayData?.analytics.segments ?? []),[data,paceHistory,replayData]);
  const detailMap = useMemo(() => (data ? buildTrackDetailMap(data) : null), [data]);
  const markers: MapMarker[] = useMemo(
    () => (detailMap ? detailMap.markers.map(m => ({ id: m.id, type: m.type, lat: m.lat, lng: m.lng, angleKind: m.angleKind, material: m.material, distanceFromStart: m.distanceFromStart, objectIndex: m.objectIndex, legIndex: m.legIndex })) : []),
    [detailMap],
  );
  const layPoints = useMemo(() => detailMap?.lay ?? [], [detailMap]);

  const [state, setState] = useState(initialReplayState());
  const [metric, setMetric] = useState<HeatmapMetric>('deviation');
  const [selectedSegment, setSelectedSegment] = useState<AnalyticsSegment | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  // Punkt 20: requestAnimationFrame-Schleife, EIN kleiner State-Update pro
  // Frame (elapsedSec) — Heatmap-Polylines/Segment-Geometrie sind unten
  // separat memoiziert und werden NICHT pro Frame neu berechnet.
  useEffect(() => {
    if (!state.playing || !replayData) return;
    let mounted = true;
    lastFrameRef.current = null;
    const tick = (ts: number) => {
      if (!mounted) return;
      if (lastFrameRef.current != null) {
        const dt = (ts - lastFrameRef.current) / 1000;
        setState(prev => tickReplay(prev, dt, replayData.geometry));
      }
      lastFrameRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [state.playing, replayData]);

  const heatmapParts = useMemo(
    () => (replayData ? buildHeatmapParts(replayData.geometry, replayData.analytics.segments, metric, paceReference) : []),
    [replayData, metric, paceReference],
  );
  const puckPosition = useMemo(
    () => (replayData ? replayPositionAt(replayData.geometry, state.elapsedSec) : null),
    [replayData, state.elapsedSec],
  );
  // Volle gelaufene Absuche-Route (alle run_points, stabil) + bereits
  // abgespielter Teil (bis elapsedSec, endet am Puck) — beide aus derselben
  // Replay-Geometrie, keine zweite Datenquelle. Die volle Route bleibt beim
  // Spulen/Abspielen immer sichtbar.
  const fullRoutePoints = useMemo(() => replayData?.geometry.points ?? [], [replayData]);
  const playedRoutePoints = useMemo(
    () => (replayData ? replayTraveledPoints(replayData.geometry, state.elapsedSec) : []),
    [replayData, state.elapsedSec],
  );
  const events = useMemo(() => (replayData ? replayEventsFromSegments(replayData.analytics.segments) : []), [replayData]);
  // Historische v2-Highlights haben die Eckdauer fälschlich als „schnellste
  // Neuaufnahme“ interpretiert. Beide irrelevanten/missverständlichen Chips
  // in der normalen Replay-UI ausblenden; Rohdaten bleiben im Payload erhalten.
  const highlights = (replayData?.analytics.segmentHighlights ?? []).filter(highlight =>
    highlight.labelKey !== 'track.segments.highlights.lowestDeviation'
    && highlight.labelKey !== 'track.segments.highlights.fastestReacquisition');
  const totalSec = replayData?.geometry.pointsTimeSec.length
    ? replayData.geometry.pointsTimeSec[replayData.geometry.pointsTimeSec.length - 1] : 0;

  const barWidthRef = useRef(1);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => seekToX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => seekToX(e.nativeEvent.locationX),
    }),
  ).current;

  function seekToX(x: number) {
    if (!replayData) return;
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, barWidthRef.current)));
    setState(prev => seekReplay(prev, ratio * totalSec, replayData.geometry));
  }

  function jumpToEvent(ev: ReplayEvent) {
    if (!replayData) return;
    setState(prev => pauseReplay(seekReplay(prev, ev.timeSec, replayData.geometry)));
    setSelectedSegment(segmentAtTime(replayData.analytics.segments, ev.timeSec));
  }

  function openMarker(marker: MapMarker) {
    if (!replayData || marker.type !== 'gegenstand' || marker.objectIndex == null) return;
    const segment = replayData.analytics.segments.find(item => item.type === 'object_zone' && item.objectIndex === marker.objectIndex! - 1) ?? null;
    if (!segment) return;
    setSelectedSegment(segment);
    if (segment.startTimeSec != null) setState(previous => pauseReplay(seekReplay(previous, segment.startTimeSec!, replayData.geometry)));
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.trackPrimary} size="large" /></View>;
  }
  if (!replayData) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={22} color={C.trackText} />
          </Pressable>
          <Text style={s.headerTitle}>{t('track.replay.title')}</Text>
          <View style={s.backBtn} />
        </View>
        <View style={s.center}>
          <Ionicons name="play-circle-outline" size={40} color={C.trackTextMut} />
          <Text style={s.unavailableTxt}>{t('track.replay.unavailable')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const progress = replayProgress(state, replayData.geometry);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={C.trackText} />
        </Pressable>
        <Text style={s.headerTitle}>{t('track.replay.title')}</Text>
        <View style={s.backBtn} />
      </View>

      <View style={s.mapWrap}>
        <TrackReplayMap
          layColor={layColor}
          layPoints={layPoints} markers={markers} heatmapParts={heatmapParts} puckPosition={puckPosition}
          runPoints={fullRoutePoints} playedPoints={playedRoutePoints}
          startAnchor={detailMap?.start ?? null}
          endPoint={detailMap?.end ?? null}
          onMarkerPress={openMarker}
        />
      </View>

      {/* Heatmap-Modus-Umschalter (Punkt 10/11) */}
      <ScrollView style={{flex:1}} contentContainerStyle={{paddingBottom:16}}>
      <View style={s.metricRow}>
        <Text style={s.metricLabel}>{t('track.replay.heatmapModeLabel')}</Text>
        <View style={s.metricChips}>
          {HEATMAP_METRICS.map(m => (
            <Pressable key={m} onPress={() => setMetric(m)} style={[s.metricChip, metric === m && s.metricChipActive]}>
              <Text style={[s.metricChipTxt, metric === m && s.metricChipTxtActive]}>
                {t(HEATMAP_METRIC_LABEL_KEY[m])}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {metric==='pace'&&<View style={{paddingHorizontal:16,paddingTop:8,gap:4}}>
        <Text style={s.metricChipTxt}>{paceReference?.source==='dog_history'?t('track.pace.history',{count:paceReference.sessionCount}):paceReference?t('track.pace.session'):t('track.pace.missing')}</Text>
        {paceReference && <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
          {(['slow','normal','fast'] as const).map((band,index)=><View key={band} style={{flexDirection:'row',alignItems:'center',gap:5}}>
            <View style={{width:12,height:4,backgroundColor:PACE_BAND_COLORS[band]}} />
            <Text style={s.metricChipTxt}>{t((['track.replay.legend.paceSlow','track.replay.legend.paceNormal','track.replay.legend.paceFast'] as const)[index])}</Text>
          </View>)}
        </View>}
        {paceReference && <Text style={s.metricChipTxt}>{t('track.pace.legend')}</Text>}
        <Text style={s.metricChipTxt}>{t('track.pace.meaning')}</Text>
      </View>}

      {/* Play/Pause + Zeit + Fortschritt (Punkt 7) */}
      <View style={s.controlsRow}>
        <Pressable
          onPress={() => setState(prev => (prev.playing ? pauseReplay(prev) : playReplay(prev, replayData.geometry)))}
          style={s.playBtn}
          accessibilityRole="button"
          accessibilityLabel={state.playing ? t('track.replay.pauseLabel') : t('track.replay.playLabel')}
        >
          <Ionicons name={state.playing ? 'pause' : 'play'} size={20} color="#04110F" />
        </Pressable>
        <View
          style={s.progressBar}
          onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width; }}
          {...panResponder.panHandlers}
        >
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <Text style={s.clock}>{formatReplayClock(state.elapsedSec)} / {formatReplayClock(totalSec)}</Text>
      </View>

      {/* Geschwindigkeit (Punkt 7) */}
      <View style={s.speedRow}>
        <Text style={s.metricLabel}>{t('track.replay.speedLabel')}</Text>
        <View style={s.metricChips}>
          {REPLAY_SPEEDS.map((sp: ReplaySpeed) => (
            <Pressable key={sp} onPress={() => setState(prev => setReplaySpeed(prev, sp))} style={[s.metricChip, state.speed === sp && s.metricChipActive]}>
              <Text style={[s.metricChipTxt, state.speed === sp && s.metricChipTxtActive]}>{sp}×</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Timeline mit Events (Punkt 9) */}
      {events.length > 0 && (
        <View style={s.timelineWrap}>
          <View style={s.timelineTrack} />
          {isTrackAnalyticsV3(replayData.analytics) && replayData.analytics.objects.map(object => object.proximityWindowStartSec != null && object.proximityWindowEndSec != null ? (
            <View
              key={`contact-${object.objectId ?? object.objectIndex}`}
              pointerEvents="none"
              style={[s.contactPhase, {
                left: `${(totalSec > 0 ? object.proximityWindowStartSec / totalSec : 0) * 100}%`,
                width: `${Math.max(1.5, (totalSec > 0 ? (object.proximityWindowEndSec - object.proximityWindowStartSec) / totalSec : 0) * 100)}%`,
              }]}
            />
          ) : null)}
          {events.map((ev, i) => (
            <Pressable
              key={`${ev.segmentId}-${i}`}
              onPress={() => jumpToEvent(ev)}
              style={[s.timelineDot, { left: `${(totalSec > 0 ? ev.timeSec / totalSec : 0) * 100}%` }]}
            >
              <Ionicons name={EVENT_ICON[ev.type]} size={12} color={C.trackPrimary} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Highlights (Punkt 16) */}
      {highlights.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.highlightsRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {highlights.map((h, i) => (
            <Pressable
              key={i}
              style={s.highlightChip}
              onPress={() => {
                const seg = replayData.analytics.segments[h.segmentIndex] ?? null;
                setSelectedSegment(seg);
              }}
            >
              <Text style={s.highlightLabel}>{t(h.labelKey)}</Text>
              <Text style={s.highlightValue}>{h.valueText}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      </ScrollView>

      <SegmentDetailSheet segment={selectedSegment} analytics={replayData.analytics} visible={!!selectedSegment} onClose={() => setSelectedSegment(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.trackBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.trackBg, gap: 10, paddingHorizontal: 32 },
  unavailableTxt: { fontSize: 14, color: C.trackTextMut, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 48 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: C.trackText },

  mapWrap: { height: '42%', marginHorizontal: 14, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder },

  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  metricLabel: { fontSize: 10, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  metricChips: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap' },
  metricChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  metricChipActive: { backgroundColor: C.trackPrimary },
  metricChipTxt: { fontSize: 11, color: C.trackTextSec, fontWeight: '700' },
  metricChipTxtActive: { color: '#04110F' },

  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginTop: 14 },
  playBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center' },
  progressBar: { flex: 1, height: 28, justifyContent: 'center' },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: C.trackBorder, overflow: 'hidden' },
  progressFill: { height: 5, backgroundColor: C.trackPrimary },
  clock: { fontSize: 12, color: C.trackTextSec, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },

  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 10 },

  timelineWrap: { height: 26, marginHorizontal: 16, marginTop: 14, justifyContent: 'center' },
  timelineTrack: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: C.trackBorder },
  contactPhase: { position: 'absolute', top: 7, height: 12, borderRadius: 6, backgroundColor: C.trackPurple + '66' },
  timelineDot: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: C.trackSurface, borderWidth: 1, borderColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },

  highlightsRow: { marginTop: 14, flexGrow: 0 },
  highlightChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder, minWidth: 120 },
  highlightLabel: { fontSize: 9, color: C.trackTextSec, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  highlightValue: { fontSize: 15, color: C.trackText, fontWeight: '900', marginTop: 2 },
});
