import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FT } from '@/constants/colors';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { fmtClock, type LiveView } from '@/features/tracking/components/LiveChrome';
import { useTrackRun, SPEECH_AVAILABLE } from '@/features/tracking/hooks/useTrackRun';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { calculateDeviationFromTrack } from '@/features/tracking/utils/gpsFilter';
import { getTrackSessionDogName, setTrackLyingTime } from '@/features/tracking/services/trackService';
import { VoiceCommandButton } from '@/features/voice/components/VoiceCommandButton';
import type { VoiceCommand } from '@/features/voice/services/voiceCommandParser';

// Blinkender LIVE-Punkt (anyvoRec).
function RecDot() {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View className="w-2 h-2 rounded-full bg-ft-bad" style={{ opacity: op }} />;
}

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

  const metrics: { value: string; label: string; warn?: boolean }[] = [
    { value: `${Math.round(distanceMeters)} m`, label: 'Distanz' },
    { value: `${articlesFound}/${articlesTotal}`, label: 'Gegenst.' },
    { value: liveDev != null ? `${devOff ? '+' : ''}${liveDev.toFixed(1)} m` : '—', label: 'Abweich.', warn: devOff },
    { value: gpsAccuracy != null ? `${Math.round(gpsAccuracy)} m` : '—', label: 'GPS' },
  ];

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['top']} className="flex-1">
        {/* Top-Bar: Zurück · LIVE/LIEGT · Karte/Skizze */}
        <View className="flex-row items-center gap-3 px-[18px] pb-[10px]">
          <Pressable
            className="w-9 h-9 rounded-[11px] border border-ft-line-strong bg-white/5 items-center justify-center"
            onPress={handleCancel} hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={FT.text} />
          </Pressable>
          {isRunningTrack ? (
            <View className="flex-row items-center gap-[7px] px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,93,108,0.14)', borderWidth: 1, borderColor: 'rgba(255,93,108,0.3)' }}>
              <RecDot />
              <Text className="text-[11px] font-extrabold tracking-[1.4px] text-[#ff8a94]">LIVE</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-[6px] px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(21,230,195,0.13)', borderWidth: 1, borderColor: 'rgba(21,230,195,0.33)' }}>
              <Ionicons name="time-outline" size={13} color={FT.acc} />
              <Text className="text-[11px] font-extrabold tracking-[1.4px] text-ft-acc">LIEGT</Text>
            </View>
          )}
          <View className="flex-1" />
          <View className="flex-row bg-white/5 rounded-[11px] p-[3px] gap-[2px]">
            {(['map', 'sketch'] as const).map(k => {
              const on = view === k;
              return (
                <Pressable key={k} onPress={() => setView(k)} className={`px-[11px] py-1.5 rounded-lg ${on ? 'bg-ft-acc' : ''}`}>
                  <Text className={`text-[11.5px] font-bold ${on ? 'text-ft-acc-text' : 'text-ft-muted'}`}>{k === 'map' ? 'Karte' : 'Skizze'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Karte / Skizze */}
        <View className="flex-1 mx-[14px] rounded-[24px] overflow-hidden border border-ft-line bg-[#08100e]">
          {view === 'map' ? (
            <TrackingMap
              layPoints={trackPoints} runPoints={runPoints} markers={mapMarkers}
              currentPosition={currentPosition} heading={heading} follow={mapFollowMode} hideControls
            />
          ) : (
            <View className="flex-1 bg-[#08100e]"><TrackSketch legs={winkel} objects={articlesTotal} w={360} h={520} progress={1} /></View>
          )}

          {/* Timer (oben links) */}
          <View className="absolute top-[14px] left-[14px] rounded-[16px] px-4 py-[10px] bg-ft-glass border border-ft-glass-line">
            <Text className="text-[30px] text-ft-text font-black" style={{ fontVariant: ['tabular-nums'] }}>{fmtClock(isRunningTrack ? searchDurationSeconds : lyingSec)}</Text>
            <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{isRunningTrack ? 'Suchdauer' : 'Liegezeit'}</Text>
          </View>

          {/* Hunde-Pill (oben rechts) */}
          <View className="absolute top-[14px] right-[14px] flex-row items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 bg-ft-glass border border-ft-glass-line">
            <View className="w-[26px] h-[26px] rounded-full bg-ft-acc items-center justify-center">
              <Text className="text-[12px] font-extrabold text-ft-acc-text">{(dogName?.[0] ?? '?').toUpperCase()}</Text>
            </View>
            <Text className="text-[12.5px] font-bold text-ft-text">{dogName}</Text>
          </View>

          {/* Metrik-Leiste (unten) */}
          <View className="absolute left-[14px] right-[14px] bottom-[14px] flex-row rounded-[18px] py-3 px-2 bg-ft-glass border border-ft-glass-line">
            {metrics.map((mm, i) => (
              <View key={i} className={`flex-1 items-center ${i > 0 ? 'border-l border-ft-line' : ''}`}>
                <Text className={`text-[15px] font-black ${mm.warn ? 'text-ft-warn' : 'text-ft-text'}`} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>{mm.value}</Text>
                <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{mm.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Voice-Command */}
        <View className="items-center pt-3">
          <VoiceCommandButton onCommand={onVoiceCommand} />
        </View>

        {/* Steuerung */}
        <View className="flex-row gap-3 px-[18px] pt-[14px] pb-[26px] min-h-[86px]">
          {!isRunningTrack ? (
            <Pressable className="flex-1 h-[60px] rounded-[18px] flex-row items-center justify-center gap-2 bg-ft-acc" onPress={handleStart} disabled={starting}>
              {starting ? <ActivityIndicator color={FT.accText} /> : <Ionicons name="play" size={18} color={FT.accText} />}
              <Text className="text-[14px] font-extrabold text-ft-acc-text">Ausarbeiten starten · liegt {fmtClock(lyingSec)}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
                style={articlesFound >= articlesTotal ? { opacity: 0.45 } : undefined}
                onPress={() => run.foundArticle()} disabled={articlesFound >= articlesTotal}
              >
                <Ionicons name="flag" size={20} color={FT.text} />
                <Text className="text-[10.5px] font-extrabold text-ft-text">Gegenstand</Text>
              </Pressable>
              <Pressable
                className={`flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] ${voiceOn ? 'bg-ft-acc' : 'bg-white/5 border border-ft-line-strong'}`}
                onPress={() => setVoiceOn(v => !v)}
              >
                <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={20} color={voiceOn ? FT.accText : FT.text} />
                <Text className={`text-[10.5px] font-extrabold ${voiceOn ? 'text-ft-acc-text' : 'text-ft-text'}`}>{voiceOn ? 'Ton an' : 'Ton aus'}</Text>
              </Pressable>
              <Pressable
                className="h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-ft-bad"
                style={[{ flex: 1.3 }, finishing ? { opacity: 0.45 } : null]}
                onPress={handleFinish} disabled={finishing}
              >
                <Ionicons name="stop" size={20} color="#2a060a" />
                <Text className="text-[10.5px] font-extrabold text-[#2a060a]">Stop & Auswerten</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
