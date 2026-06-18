import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import {
  LiveButton, LiveDogPill, LiveMetricBar, LiveTimer, LiveTopBar, fmtClock, type LiveView,
} from '@/features/tracking/components/LiveChrome';
import { useTrackRun, SPEECH_AVAILABLE } from '@/features/tracking/hooks/useTrackRun';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { calculateDeviationFromTrack } from '@/features/tracking/utils/gpsFilter';
import { getTrackSessionDogName, setTrackLyingTime } from '@/features/tracking/services/trackService';
import { VoiceCommandButton } from '@/features/voice/components/VoiceCommandButton';
import type { VoiceCommand } from '@/features/voice/services/voiceCommandParser';

export default function TrackRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const voiceOnRef = useRef(SPEECH_AVAILABLE);
  const run = useTrackRun(voiceOnRef);
  const [voiceOn, setVoiceOn] = useState(SPEECH_AVAILABLE);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [view, setView] = useState<LiveView>('map');
  const [dogName, setDogName] = useState('Hund');

  const {
    trackPoints, runPoints, markers, currentPosition, heading, distanceMeters, searchDurationSeconds,
    articlesFound, isRunningTrack, gpsAccuracy, mapFollowMode, layFinishedAt, setCurrentPosition, setMapFollowMode,
  } = useTrackingStore();

  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  useEffect(() => { if (id) getTrackSessionDogName(id).then(r => { if (r.data) setDogName(r.data); }); }, [id]);

  // Liegezeit-Timer: zählt seit "Fertig gelegt" hoch, bis die Ausarbeitung startet.
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (isRunningTrack || !layFinishedAt) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunningTrack, layFinishedAt]);
  const lyingSec = layFinishedAt ? Math.max(0, Math.floor((nowMs - layFinishedAt) / 1000)) : 0;

  // Vorschau-Position vor Suchstart.
  useEffect(() => {
    if (isRunningTrack) return;
    (async () => {
      try {
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
        setCurrentPosition({ lat: fix.coords.latitude, lng: fix.coords.longitude }, fix.coords.accuracy);
      } catch { /* optional */ }
    })();
  }, []);

  const mapMarkers: MapMarker[] = markers.map(m => ({ type: m.type, lat: m.lat, lng: m.lng }));
  const articlesTotal = markers.filter(m => m.type === 'gegenstand').length;
  const winkel = markers.filter(m => m.type === 'winkel').length;
  // Abweichung nur sinnvoll, wenn eine gelegte Spur existiert (sonst Infinity).
  const rawDev = currentPosition && trackPoints.length > 1
    ? calculateDeviationFromTrack(currentPosition, trackPoints.map(p => ({ lat: p.lat, lng: p.lng }))).dist
    : null;
  const liveDev = rawDev != null && Number.isFinite(rawDev) ? rawDev : null;
  const devOff = liveDev != null && liveDev > 8;

  const handleStart = async () => {
    if (!id) return;
    setStarting(true);
    const { error } = await run.start(id);
    setStarting(false);
    if (error) { Alert.alert('Suche', error === 'Kein aktiver Ablauf.' ? error : 'Konnte nicht gestartet werden. Bitte erneut versuchen.'); return; }
    // Gemessene Liegezeit festhalten (non-blocking).
    if (layFinishedAt) void setTrackLyingTime(id, Math.round(lyingSec / 60));
  };

  const handleCancel = () => {
    Alert.alert('Ausarbeitung abbrechen?', 'Die Ausarbeitung wird nicht gespeichert. Die gelegte Fährte bleibt erhalten.', [
      { text: 'Weiter', style: 'cancel' },
      { text: 'Abbrechen', style: 'destructive', onPress: () => {
        useTrackingStore.getState().reset();
        router.replace('/track' as never);
      } },
    ]);
  };

  const handleFinish = () => {
    Alert.alert('Suche beenden?', 'Die Ausarbeitung wird gespeichert — danach geht es zur Auswertung.', [
      { text: 'Weiter suchen', style: 'cancel' },
      { text: 'Beenden', style: 'destructive', onPress: async () => {
        if (!id) return;
        setFinishing(true);
        const { error } = await run.finish(id);
        setFinishing(false);
        if (error) { Alert.alert('Speichern fehlgeschlagen', 'Training konnte nicht gespeichert werden. Bitte prüfe deine Verbindung.'); return; }
        router.replace(`/track/${id}` as never);
      } },
    ]);
  };

  const onVoiceCommand = (cmd: VoiceCommand) => {
    if (cmd.type === 'STOP_RECORDING') { handleFinish(); return; }
    if (cmd.type === 'CENTER_MAP') { setMapFollowMode(true); return; }
    if (cmd.type === 'AUDIO_ON') { setVoiceOn(true); return; }
    if (cmd.type === 'AUDIO_OFF') { setVoiceOn(false); return; }
    if (!isRunningTrack) return;
    if (cmd.type === 'ADD_MARKER' && cmd.markerType === 'gegenstand' && articlesFound < articlesTotal) run.foundArticle();
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.safe}>
        <LiveTopBar onBack={handleCancel} resting={!isRunningTrack} view={view} onView={setView} />

        <View style={s.mapWrap}>
          {view === 'map' ? (
            <TrackingMap
              layPoints={trackPoints} runPoints={runPoints} markers={mapMarkers}
              currentPosition={currentPosition} heading={heading} follow={mapFollowMode} hideControls
            />
          ) : (
            <View style={s.sketch}><TrackSketch legs={winkel} objects={articlesTotal} w={360} h={520} progress={1} /></View>
          )}

          <LiveTimer seconds={isRunningTrack ? searchDurationSeconds : lyingSec} label={isRunningTrack ? 'Suchdauer' : 'Liegezeit'} />
          <LiveDogPill name={dogName} />
          <LiveMetricBar items={[
            { value: `${Math.round(distanceMeters)} m`, label: 'Distanz' },
            { value: `${articlesFound}/${articlesTotal}`, label: 'Gegenst.' },
            { value: liveDev != null ? `${devOff ? '+' : ''}${liveDev.toFixed(1)} m` : '—', label: 'Abweich.', warn: devOff },
            { value: gpsAccuracy != null ? `${Math.round(gpsAccuracy)} m` : '—', label: 'GPS' },
          ]} />
        </View>

        <View style={s.voiceRow}>
          <VoiceCommandButton onCommand={onVoiceCommand} />
        </View>

        <View style={s.controls}>
          {!isRunningTrack ? (
            <AnyvoButton label={`Ausarbeiten starten · liegt ${fmtClock(lyingSec)}`} icon="play" onPress={handleStart} loading={starting} big style={{ flex: 1 }} />
          ) : (
            <>
              <LiveButton icon="flag" label="Gegenstand" onPress={() => run.foundArticle()} disabled={articlesFound >= articlesTotal} />
              <LiveButton
                icon={voiceOn ? 'volume-high' : 'volume-mute'} label={voiceOn ? 'Ton an' : 'Ton aus'}
                active={voiceOn} onPress={() => setVoiceOn(v => !v)}
              />
              <LiveButton icon="stop" label="Stop & Auswerten" variant="danger" flex={1.3} onPress={handleFinish} disabled={finishing} />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.trackBg },
  safe:     { flex: 1 },
  mapWrap:  { flex: 1, marginHorizontal: 14, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: '#08100e' },
  sketch:   { flex: 1, backgroundColor: '#08100e' },
  voiceRow: { alignItems: 'center', paddingTop: 12 },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26, minHeight: 86 },
});
