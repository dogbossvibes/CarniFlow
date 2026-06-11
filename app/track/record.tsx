import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { GpsQualityPill } from '@/features/tracking/components/GpsQualityPill';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackStatsPanel } from '@/features/tracking/components/TrackStatsPanel';
import { MarkerBottomSheet } from '@/features/tracking/components/MarkerBottomSheet';
import { useTrackRecording } from '@/features/tracking/hooks/useTrackRecording';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';

export default function TrackRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const rec = useTrackRecording();
  const startedRef = useRef(false);
  const [sheet, setSheet] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const {
    trackPoints, markers, currentPosition, heading, distanceMeters, durationSeconds,
    gpsAccuracy, gpsQuality, isPaused, mapFollowMode, setMapFollowMode,
  } = useTrackingStore();

  useEffect(() => {
    if (!id || startedRef.current) return;
    startedRef.current = true;
    rec.start(id).then(({ error }) => {
      if (error) { Alert.alert('Aufnahme', error, [{ text: 'OK', onPress: () => router.back() }]); }
    });
  }, [id]);

  const mapMarkers: MapMarker[] = markers.map(m => ({ type: m.type, lat: m.lat, lng: m.lng }));
  const gegenstaende = markers.filter(m => m.type === 'gegenstand').length;

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
      <TrackingMap
        layPoints={trackPoints}
        markers={mapMarkers}
        currentPosition={currentPosition}
        heading={heading}
        follow={mapFollowMode}
        onToggleFollow={() => setMapFollowMode(!mapFollowMode)}
      />

      <SafeAreaView edges={['top']} pointerEvents="box-none" style={s.topSafe}>
        <View style={s.topBar}>
          <View>
            <Text style={s.eyebrow}>FÄHRTE AUFNEHMEN</Text>
            <Text style={s.title}>{isPaused ? 'Pausiert' : 'Fährte legen'}</Text>
          </View>
          <GpsQualityPill quality={gpsQuality} accuracy={gpsAccuracy} />
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={s.bottom} pointerEvents="box-none">
        <TrackStatsPanel distanceMeters={distanceMeters} durationSeconds={durationSeconds} articles={String(gegenstaende)} />
        <AnyvoButton label="Marker setzen" icon="add-circle" variant="secondary" onPress={() => setSheet(true)} style={{ marginTop: 12 }} />
        <View style={s.ctrlRow}>
          <AnyvoButton label={isPaused ? 'Fortsetzen' : 'Pause'} icon={isPaused ? 'play' : 'pause'} variant="secondary" onPress={() => (isPaused ? rec.resume() : rec.pause())} style={{ flex: 1 }} />
          <AnyvoButton label="Beenden" icon="stop" variant="danger" onPress={handleFinish} loading={finishing} style={{ flex: 1 }} />
        </View>
      </SafeAreaView>

      <MarkerBottomSheet visible={sheet} onClose={() => setSheet(false)} onSelect={type => rec.addMarker(type)} />
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.trackBg },
  topSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  eyebrow: { fontSize: 9, color: C.trackPrimary, fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 20, color: C.trackText, fontWeight: '900', letterSpacing: -0.4 },
  bottom:  { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 8 },
  ctrlRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
});
