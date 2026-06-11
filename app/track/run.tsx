import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { GpsQualityPill } from '@/features/tracking/components/GpsQualityPill';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { CompassBottomSheet } from '@/features/tracking/components/CompassBottomSheet';
import { useTrackRun, SPEECH_AVAILABLE } from '@/features/tracking/hooks/useTrackRun';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { calculateDeviationFromTrack } from '@/features/tracking/utils/gpsFilter';

function fmtDur(sec: number) { const m = Math.floor(sec / 60), s = sec % 60; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }

export default function TrackRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const voiceOnRef = useRef(SPEECH_AVAILABLE);
  const run = useTrackRun(voiceOnRef);
  const [voiceOn, setVoiceOn] = useState(SPEECH_AVAILABLE);
  const [compass, setCompass] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const {
    trackPoints, runPoints, markers, currentPosition, heading, distanceMeters, searchDurationSeconds,
    articlesFound, isRunningTrack, gpsAccuracy, gpsQuality, mapFollowMode, mapOrientationMode,
    setMapFollowMode, setMapOrientationMode, setCurrentPosition,
  } = useTrackingStore();

  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

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
  const liveDev = currentPosition ? calculateDeviationFromTrack(currentPosition, trackPoints.map(p => ({ lat: p.lat, lng: p.lng }))).dist : null;
  const devOff = liveDev != null && liveDev > 8;

  const handleStart = async () => {
    if (!id) return;
    setStarting(true);
    const { error } = await run.start(id);
    setStarting(false);
    if (error) Alert.alert('Suche', error === 'Kein aktiver Ablauf.' ? error : 'Konnte nicht gestartet werden. Bitte erneut versuchen.');
  };

  const handleFinish = () => {
    Alert.alert('Suche beenden?', 'Die Ausarbeitung wird gespeichert.', [
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

  return (
    <View style={s.root}>
      <TrackingMap
        layPoints={trackPoints}
        runPoints={runPoints}
        markers={mapMarkers}
        currentPosition={currentPosition}
        heading={heading}
        follow={mapFollowMode}
        onToggleFollow={() => setMapFollowMode(!mapFollowMode)}
        onCompass={() => setCompass(true)}
      />

      <SafeAreaView edges={['top']} pointerEvents="box-none" style={s.top}>
        <View style={s.statsBar}>
          <Stat value={`${Math.round(distanceMeters)} m`} label="LÄNGE" />
          <Stat value={fmtDur(searchDurationSeconds)} label="SUCHDAUER" />
          <Stat value={`${articlesFound}/${articlesTotal}`} label="GEGENST." />
          <Stat value={liveDev != null ? `${devOff ? '+' : ''}${liveDev.toFixed(1)} m` : '—'} label="ABWEICH." warn={devOff} />
        </View>
        <View style={s.pillRow}><GpsQualityPill quality={gpsQuality} accuracy={gpsAccuracy} /></View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} pointerEvents="box-none" style={s.bottom}>
        {!isRunningTrack ? (
          <AnyvoButton label="Suche starten" icon="play" onPress={handleStart} loading={starting} big />
        ) : (
          <>
            <AnyvoButton label="Gegenstand gefunden" icon="checkmark-circle" onPress={() => run.foundArticle()} big disabled={articlesFound >= articlesTotal} />
            <View style={s.ctrlRow}>
              <TouchableOpacity style={[s.iconBtn, voiceOn && s.iconBtnOn]} onPress={() => setVoiceOn(v => !v)} activeOpacity={0.85}>
                <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={20} color={voiceOn ? '#04110F' : C.trackText} />
              </TouchableOpacity>
              <AnyvoButton label="Beenden" icon="stop" variant="danger" onPress={handleFinish} loading={finishing} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </SafeAreaView>

      <CompassBottomSheet visible={compass} onClose={() => setCompass(false)} heading={heading} mode={mapOrientationMode} onChangeMode={setMapOrientationMode} />
    </View>
  );
}

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statVal, warn && { color: C.trackWarning }]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.trackBg },
  top:     { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 6 },
  statsBar:{ flexDirection: 'row', backgroundColor: 'rgba(13,13,13,0.92)', borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 10 },
  stat:    { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 17, color: C.trackText, fontWeight: '900', letterSpacing: -0.4 },
  statLabel: { fontSize: 8.5, color: C.trackTextMut, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  pillRow: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 10 },
  bottom:  { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  ctrlRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconBtn: { width: 52, height: 48, borderRadius: 16, backgroundColor: C.trackCardAlt, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center' },
  iconBtnOn: { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
});
