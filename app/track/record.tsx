import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { isNativeModuleAvailable } from '@/modules/anyvo-precision-location';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { MarkerBottomSheet } from '@/features/tracking/components/MarkerBottomSheet';
import { PrecisionDebugPanel } from '@/features/tracking/components/PrecisionDebugPanel';
import { TrackLayerToggle, trackLayerVisibility, type TrackLayer } from '@/features/tracking/components/TrackLayerToggle';
import { GpsQualityBadge } from '@/features/tracking/components/GpsQualityBadge';
import { TrackingStatusBadge, type TrackingDisplayStatus } from '@/features/tracking/components/TrackingStatusBadge';
import { WarmupOverlay } from '@/features/tracking/components/WarmupOverlay';
import {
  LiveButton, LiveDogPill, LiveMetricBar, LiveTimer, LiveTopBar, type LiveView,
} from '@/features/tracking/components/LiveChrome';
import { useTrackRecording } from '@/features/tracking/hooks/useTrackRecording';
import { useGpsWarmup } from '@/features/tracking/hooks/useGpsWarmup';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { getTrackSessionDogName, deleteTrackSession } from '@/features/tracking/services/trackService';
import { metersToSteps } from '@/features/tracking/utils/steps';
import { suggestAngleKind } from '@/features/tracking/utils/angleClassify';
import { classifyQuality } from '@/features/tracking/engine/gpsQuality';
import type { TrackPointStatus } from '@/features/tracking/engine/types';
import { VoiceCommandButton } from '@/features/voice/components/VoiceCommandButton';
import { VoiceRecorderCard } from '@/features/voice/components/VoiceRecorderCard';
import { uploadVoiceNote } from '@/features/voice/services/voiceUploadService';
import type { VoiceCommand } from '@/features/voice/services/voiceCommandParser';

// Anzeige-Status fürs TrackingStatusBadge während der Aufnahme.
// Priorität: Warmup → Drift → schlechtes GPS → Bewegung.
function liveDisplayStatus(
  phase: 'warmup' | 'recording', motion: TrackPointStatus | null, accuracy: number | null,
): TrackingDisplayStatus {
  if (phase === 'warmup') return 'gps_warmup';
  if (motion === 'drift') return 'drift';
  const q = classifyQuality(accuracy);
  if (q === 'bad' || q === 'poor') return 'gps_poor';
  switch (motion) {
    case 'moving':      return 'moving';
    case 'slow_moving': return 'slow_moving';
    case 'stationary':  return 'stationary';
    case 'sharp_turn':  return 'sharp_turn';
    default:            return 'recording';
  }
}

export default function TrackRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const rec = useTrackRecording();
  const [sheet, setSheet] = useState(false);
  const [voiceMarker, setVoiceMarker] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [view, setView] = useState<LiveView>('map');
  const [dogName, setDogName] = useState('Hund');
  const [debug, setDebug] = useState(false);
  const [layer, setLayer] = useState<TrackLayer>('clean');   // normale Nutzer: Clean
  const [phase, setPhase] = useState<'warmup' | 'recording'>('warmup');
  const beganRef = useRef(false);

  const {
    trackPoints, rawTrackPoints, rejectedTrackPoints, gpsStats, motionStatus,
    markers, currentPosition, heading, distanceMeters, durationSeconds,
    isPaused, mapFollowMode,
  } = useTrackingStore();

  const layerVis = trackLayerVisibility(layer);

  // GPS-Warmup läuft, solange wir in der Warmup-Phase sind.
  const warmup = useGpsWarmup(phase === 'warmup');

  useEffect(() => {
    if (!id) return;
    getTrackSessionDogName(id).then(r => { if (r.data) setDogName(r.data); });
  }, [id]);

  const beginRecording = useCallback(async () => {
    if (!id || beganRef.current) return;
    beganRef.current = true;
    await warmup.stop();
    const { error } = await rec.start(id);
    if (error) { beganRef.current = false; Alert.alert('Aufnahme', error, [{ text: 'OK', onPress: () => router.back() }]); return; }
    setPhase('recording');
  }, [id, warmup, rec, router]);

  // Auto-Start, sobald GPS stabil ist (accuracy ≤ 15 m, ≥ 5 s).
  useEffect(() => {
    if (phase === 'warmup' && warmup.phase === 'ready') void beginRecording();
  }, [phase, warmup.phase, beginRecording]);

  const mapMarkers: MapMarker[] = markers.map(m => ({ type: m.type, lat: m.lat, lng: m.lng }));
  const suggestedAngle = suggestAngleKind(trackPoints.map(p => ({ lat: p.lat, lng: p.lng })));
  const gegenstaende = markers.filter(m => m.type === 'gegenstand').length;
  const winkel = markers.filter(m => m.type === 'winkel').length;
  const steps = metersToSteps(distanceMeters);
  const engineLabel = isNativeModuleAvailable() ? 'Native Precision' : 'Fallback';

  const handleCancel = () => {
    Alert.alert('Fährte abbrechen?', 'Die laufende Aufnahme wird verworfen und nichts gespeichert.', [
      { text: 'Weiter aufnehmen', style: 'cancel' },
      { text: 'Verwerfen', style: 'destructive', onPress: async () => {
        rec.stopAll();
        useTrackingStore.getState().reset();
        if (id) await deleteTrackSession(id);
        router.replace('/track' as never);
      } },
    ]);
  };

  // Abbruch noch in der Warmup-Phase (es wurde noch nichts aufgezeichnet).
  const handleWarmupCancel = useCallback(async () => {
    await warmup.stop();
    useTrackingStore.getState().reset();
    if (id) await deleteTrackSession(id);
    router.replace('/track' as never);
  }, [warmup, id, router]);

  const handleFinish = () => {
    Alert.alert('Fährte gelegt?', 'Die gelegte Fährte wird gespeichert — danach geht es zur Ausarbeitung.', [
      { text: 'Weiter legen', style: 'cancel' },
      { text: 'Fertig gelegt', onPress: async () => {
        if (!id) return;
        setFinishing(true);
        const { error } = await rec.finish(id);
        setFinishing(false);
        if (error) { Alert.alert('Speichern fehlgeschlagen', 'Training konnte nicht gespeichert werden. Bitte prüfe deine Verbindung.'); return; }
        router.replace(`/track/run?id=${id}` as never);
      } },
    ]);
  };

  const onVoiceCommand = (cmd: VoiceCommand) => {
    if (cmd.type === 'ADD_MARKER') rec.addMarker(cmd.markerType, { angleKind: cmd.angleKind });
    else if (cmd.type === 'PAUSE') { if (!isPaused) rec.pause(); }
    else if (cmd.type === 'RESUME') { if (isPaused) rec.resume(); }
    else if (cmd.type === 'STOP_RECORDING') handleFinish();
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.safe}>
        <LiveTopBar onBack={handleCancel} paused={isPaused} view={view} onView={setView} />

        <View style={s.mapWrap}>
          {view === 'map' ? (
            <TrackingMap
              layPoints={layerVis.showClean ? trackPoints : []}
              rawPoints={layerVis.showRaw ? rawTrackPoints : undefined}
              rejectedPoints={debug ? rejectedTrackPoints : undefined}
              markers={mapMarkers} currentPosition={currentPosition}
              heading={heading} follow={mapFollowMode} hideControls
            />
          ) : (
            <View style={s.sketch}><TrackSketch legs={winkel} objects={gegenstaende} w={360} h={520} progress={1} /></View>
          )}

          <LiveTimer seconds={durationSeconds} label="Aufnahme" />
          <LiveDogPill name={dogName} />
          {/* GPS-Qualität + Bewegungsstatus (Anyvo-Badges) */}
          <View style={s.statusBadges} pointerEvents="none">
            <GpsQualityBadge accuracy={gpsStats.lastAccuracy} showMessage={false} />
            <TrackingStatusBadge status={liveDisplayStatus(phase, motionStatus, gpsStats.lastAccuracy)} />
          </View>
          <LiveMetricBar items={[
            { value: String(steps), label: 'Schritte' },
            { value: `${Math.round(distanceMeters)} m`, label: 'Distanz' },
            { value: String(gegenstaende), label: 'Gegenst.' },
            { value: String(winkel), label: 'Winkel' },
          ]} />

          {/* Precision Debug: Toggle + Panel (kein Redesign, nur Overlay) */}
          <TrackLayerToggle
            value={layer}
            onChange={setLayer}
            debug={debug}
            onToggleDebug={() => { setDebug(d => !d); setLayer('clean'); }}
          />
          {debug && (
            <PrecisionDebugPanel
              engineLabel={engineLabel}
              stats={gpsStats}
              status={motionStatus}
              devMode={debug}
              isNativePrecision={isNativeModuleAvailable()}
              platform={Platform.OS as 'ios' | 'android' | 'web'}
              phase={phase}
              heading={heading}
              warmupMs={warmup.elapsedMs}
              startAllowed={warmup.canStart}
            />
          )}
        </View>

        <View style={s.voiceRow}>
          <VoiceCommandButton onCommand={onVoiceCommand} />
        </View>

        <View style={s.controls}>
          <LiveButton icon="cube" label="Gegenstand" variant="accent" flex={1.2} onPress={() => rec.addMarker('gegenstand')} />
          <LiveButton icon="add-circle-outline" label="Marker" onPress={() => setSheet(true)} />
          <LiveButton
            icon={isPaused ? 'play' : 'pause'} label={isPaused ? 'Weiter' : 'Pause'}
            active={isPaused} onPress={() => (isPaused ? rec.resume() : rec.pause())}
          />
          <LiveButton icon="stop" label="Stop & Weiter" variant="danger" flex={1.3} onPress={handleFinish} disabled={finishing} />
        </View>
      </SafeAreaView>

      <MarkerBottomSheet visible={sheet} onClose={() => setSheet(false)} suggestedAngle={suggestedAngle}
        onSelect={c => { if (c.type === 'sprachmarker') setVoiceMarker(true); else rec.addMarker(c.type, { material: c.material, angleKind: c.angleKind }); }} />

      {/* Sprachmarker: Notiz an aktueller Position aufnehmen */}
      <Modal visible={voiceMarker} transparent animationType="slide" onRequestClose={() => setVoiceMarker(false)}>
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Sprachmarker</Text>
            <VoiceRecorderCard
              onCancel={() => setVoiceMarker(false)}
              onSave={async (uri, duration) => {
                setVoiceMarker(false);
                const pos = currentPosition;
                rec.addMarker('sprachmarker');
                await uploadVoiceNote({
                  localUri: uri, context: 'track_marker', trainingSessionId: id, durationSeconds: duration,
                  metadata: { latitude: pos?.lat ?? null, longitude: pos?.lng ?? null, distanceFromStart: Math.round(distanceMeters), timestamp: Date.now() },
                });
              }}
            />
          </View>
        </View>
      </Modal>

      {/* GPS-Warmup vor der Aufnahme: Permission + Stabilisierung + Freigabe */}
      {phase === 'warmup' && (
        <WarmupOverlay state={warmup} onStart={beginRecording} onCancel={handleWarmupCancel} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.trackBg },
  safe:     { flex: 1 },
  mapWrap:  { flex: 1, marginHorizontal: 14, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: '#08100e' },
  statusBadges: { position: 'absolute', top: 92, left: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, maxWidth: '72%' },
  voiceRow: { alignItems: 'center', paddingTop: 12 },
  sheetBackdrop:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: C.trackBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 36, borderTopWidth: 1, borderColor: C.trackBorder },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderLight, marginBottom: 14 },
  sheetTitle: { fontSize: 16, color: C.trackText, fontWeight: '800', marginBottom: 14, marginLeft: 2 },
  sketch:   { flex: 1, backgroundColor: '#08100e' },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26 },
});
