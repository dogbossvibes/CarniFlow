import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { MarkerBottomSheet } from '@/features/tracking/components/MarkerBottomSheet';
import {
  LiveButton, LiveDogPill, LiveMetricBar, LiveTimer, LiveTopBar, type LiveView,
} from '@/features/tracking/components/LiveChrome';
import { useTrackRecording } from '@/features/tracking/hooks/useTrackRecording';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { getTrackSessionDogName } from '@/features/tracking/services/trackService';
import { metersToSteps } from '@/features/tracking/utils/steps';

export default function TrackRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const rec = useTrackRecording();
  const startedRef = useRef(false);
  const [sheet, setSheet] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [view, setView] = useState<LiveView>('map');
  const [dogName, setDogName] = useState('Hund');

  const {
    trackPoints, markers, currentPosition, heading, distanceMeters, durationSeconds,
    isPaused, mapFollowMode,
  } = useTrackingStore();

  useEffect(() => {
    if (!id || startedRef.current) return;
    startedRef.current = true;
    rec.start(id).then(({ error }) => {
      if (error) { Alert.alert('Aufnahme', error, [{ text: 'OK', onPress: () => router.back() }]); }
    });
    getTrackSessionDogName(id).then(r => { if (r.data) setDogName(r.data); });
  }, [id]);

  const mapMarkers: MapMarker[] = markers.map(m => ({ type: m.type, lat: m.lat, lng: m.lng }));
  const gegenstaende = markers.filter(m => m.type === 'gegenstand').length;
  const winkel = markers.filter(m => m.type === 'winkel').length;
  const steps = metersToSteps(distanceMeters);

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

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.safe}>
        <LiveTopBar onBack={() => router.back()} paused={isPaused} view={view} onView={setView} />

        <View style={s.mapWrap}>
          {view === 'map' ? (
            <TrackingMap
              layPoints={trackPoints} markers={mapMarkers} currentPosition={currentPosition}
              heading={heading} follow={mapFollowMode} hideControls
            />
          ) : (
            <View style={s.sketch}><TrackSketch legs={winkel} objects={gegenstaende} w={360} h={520} progress={1} /></View>
          )}

          <LiveTimer seconds={durationSeconds} label="Aufnahme" />
          <LiveDogPill name={dogName} />
          <LiveMetricBar items={[
            { value: String(steps), label: 'Schritte' },
            { value: `${Math.round(distanceMeters)} m`, label: 'Distanz' },
            { value: String(gegenstaende), label: 'Gegenst.' },
            { value: String(winkel), label: 'Winkel' },
          ]} />
        </View>

        <View style={s.controls}>
          <LiveButton icon="add-circle-outline" label="Marker" onPress={() => setSheet(true)} />
          <LiveButton
            icon={isPaused ? 'play' : 'pause'} label={isPaused ? 'Weiter' : 'Pause'}
            active={isPaused} onPress={() => (isPaused ? rec.resume() : rec.pause())}
          />
          <LiveButton icon="stop" label="Stop & Weiter" variant="danger" flex={1.3} onPress={handleFinish} disabled={finishing} />
        </View>
      </SafeAreaView>

      <MarkerBottomSheet visible={sheet} onClose={() => setSheet(false)}
        onSelect={c => rec.addMarker(c.type, { material: c.material })} />
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.trackBg },
  safe:     { flex: 1 },
  mapWrap:  { flex: 1, marginHorizontal: 14, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: '#08100e' },
  sketch:   { flex: 1, backgroundColor: '#08100e' },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26 },
});
