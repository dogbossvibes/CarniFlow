import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { hapticTap, hapticSuccess, hapticMarker, hapticAngle, hapticWarning } from '@/features/tracking/utils/haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { FT } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { useTrackRecorder } from '@/features/tracking/hooks/useTrackRecorder';
import { useAutoDetectSetting } from '@/hooks/useAutoDetectSetting';
import { useVolumeKeyArticleSetting } from '@/hooks/useVolumeKeyArticleSetting';
import { subscribeQuickAddArticle } from '@/features/tracking/quickAddArticleBus';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { createTrackSession } from '@/features/tracking/services/trackService';
import { fetchCurrentWeather, type CurrentWeather } from '@/services/weatherService';
import { ANGLE_LABEL } from '@/features/tracking/utils/angleClassify';
import { metersToSteps } from '@/features/tracking/utils/steps';
import { PrecisionDebugPanel } from '@/features/tracking/components/PrecisionDebugPanel';
import type { GpsStats } from '@/features/tracking/engine/types';
import { useToast } from '@/components/ui/Toast';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import type { AngleKind, MarkerMaterial } from '@/features/tracking/store/trackingStore';

type MatIcon = React.ComponentProps<typeof Ionicons>['name'];
// Gegenstand-Materialien (Reihenfolge wie im Sheet).
const GEGENSTAND_MATERIALS: { material: MarkerMaterial; icon: MatIcon; label: string }[] = [
  { material: 'holz',     icon: 'leaf-outline',        label: 'Holz' },
  { material: 'duebel',   icon: 'git-commit-outline',  label: 'Dübel' },
  { material: 'stoff',    icon: 'shirt-outline',       label: 'Stoff' },
  { material: 'leder',    icon: 'bag-outline',         label: 'Leder' },
  { material: 'plastik',  icon: 'cube-outline',        label: 'Plastik' },
  { material: 'metall',   icon: 'magnet-outline',      label: 'Metall' },
  { material: 'teppich',  icon: 'grid-outline',        label: 'Teppich' },
  { material: 'diverses', icon: 'ellipsis-horizontal', label: 'Divers' },
];

function clock(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}


// GPS-Debug-Overlay nur im Dev-Build (nur lesend, beeinflusst die Aufnahme nicht).
const SHOW_GPS_DEBUG = __DEV__;

// Untergrund + Beschaffenheit (vor dem Legen wählbar, während GPS stabilisiert).
const SURFACES = ['Acker', 'Wiese', 'Wald', 'Mischung'] as const;
const CONDITIONS = ['Normal', 'Nass', 'Trocken', 'Schnee', 'Gefroren'] as const;

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

// FÄHRTE LEGEN — Live-GPS-Recorder auf Satellitenkarte. Kein Vorab-Planen:
// nach GPS-Warmup wird direkt eine Session angelegt und aufgezeichnet. Winkel
// (rechts/links/spitz) werden automatisch erkannt, Haptik bei jeder Erkennung.
export default function LegenScreen() {
  const router = useRouter();
  useKeepAwake();   // Display während des Legens anlassen (Bildschirm nicht sperren)
  const params = useLocalSearchParams<{ dogId?: string }>();
  const { session } = useSession();
  const { dogs } = useDogs();
  const { showToast, toast } = useToast();

  const [phase, setPhase] = useState<'warmup' | 'recording'>('warmup');
  const phaseRef = useRef(phase); phaseRef.current = phase;   // Stale-Closure-Schutz für Trigger
  const [view, setView] = useState<'map' | 'sketch'>('map');
  const [surface, setSurface] = useState<string>('Acker');         // Untergrund
  const [condition, setCondition] = useState<string | null>(null); // Beschaffenheit
  const [weather, setWeather] = useState<CurrentWeather | null>(null);  // echtes Wetter (Open-Meteo)
  const [weatherState, setWeatherState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const weatherFetchedRef = useRef(false);
  const [lastAngle, setLastAngle] = useState<AngleKind | null>(null);
  const [warmupElapsed, setWarmupElapsed] = useState(0);
  const [materialSheet, setMaterialSheet] = useState(false);   // Gegenstand-Material wählen
  const [selectedDogId, setSelectedDogId] = useState<string | null>((params.dogId as string) ?? null);
  const beganRef = useRef(false);
  const warmupStartedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Automatisch erkannter Winkel (rechts/links/spitz) → Haptik + Hinweis.
  // Der Marker wird im Recorder direkt am Scheitel gesetzt.
  const onAngle = useCallback((kind: AngleKind) => {
    setLastAngle(kind);
    // Automatisch erkannt → gedrosselt: Abriss als Warnung, sonst Winkel-Impuls.
    if (kind === 'abriss') hapticWarning(); else hapticAngle();
    showToast(`${ANGLE_LABEL[kind]} erkannt`);
  }, [showToast]);

  const { autoDetect, setAutoDetect } = useAutoDetectSetting();
  const { enabled: volumeKeyArticle } = useVolumeKeyArticleSetting();
  const rec = useTrackRecorder({ onAngle, autoDetect });

  // Zuletzt gewähltes Gegenstand-Material → Default für den Schnell-Gegenstand.
  const lastMaterialRef = useRef<MarkerMaterial>('diverses');

  // Gegenstand mit gewähltem Material setzen. Erst, wenn der Startanker steht —
  // sonst würde er im Warmup-Drift landen (kein Crash, nur Hinweis).
  const placeGegenstand = useCallback((material: MarkerMaterial) => {
    setMaterialSheet(false);
    if (!useTrackingStore.getState().startAnchor) { showToast('Kurz warten – Startpunkt wird noch gesetzt.'); return; }
    hapticMarker();                 // sofort, VOR dem Speichern
    lastMaterialRef.current = material;
    void rec.addMarker('gegenstand', { material });
  }, [rec, showToast]);

  // Schnell-Gegenstand (Hardware-Taste / Kurzbefehl): ohne Material-Auswahl, am
  // zuletzt gewählten Material. Nur während laufender Aufnahme.
  const quickAddArticle = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    if (!useTrackingStore.getState().startAnchor) { showToast('Kurz warten – Startpunkt wird noch gesetzt.'); return; }
    hapticMarker();                 // sofort, VOR dem Speichern
    void rec.addMarker('gegenstand', { material: lastMaterialRef.current });
    showToast('Gegenstand gesetzt');
  }, [rec, showToast]);

  // iOS-Kurzbefehl (Deep-Link) → Schnell-Gegenstand, solange aufgenommen wird.
  useEffect(() => {
    if (phase !== 'recording') return;
    return subscribeQuickAddArticle(quickAddArticle);
  }, [phase, quickAddArticle]);

  // Android: Lautstärke-Taste → Schnell-Gegenstand (nur wenn Setting an + Aufnahme).
  useEffect(() => {
    if (Platform.OS !== 'android' || phase !== 'recording' || !volumeKeyArticle) return;
    let VolumeManager: typeof import('react-native-volume-manager').VolumeManager | null = null;
    try { VolumeManager = require('react-native-volume-manager').VolumeManager; } catch { VolumeManager = null; }
    if (!VolumeManager) return;

    const BASELINE = 0.5;
    let last = 0;
    void VolumeManager.showNativeVolumeUI({ enabled: false });
    void VolumeManager.setVolume(BASELINE, { showUI: false });
    const sub = VolumeManager.addVolumeListener(() => {
      const now = Date.now();
      if (now - last < 600) return;           // Entprellung gegen Doppel-Trigger
      last = now;
      quickAddArticle();
      void VolumeManager?.setVolume(BASELINE, { showUI: false });  // Baseline halten → beide Richtungen feuern
    });
    return () => { sub.remove(); void VolumeManager?.showNativeVolumeUI({ enabled: true }); };
  }, [phase, volumeKeyArticle, quickAddArticle]);

  const activeDog = dogs.find(d => d.id === selectedDogId) ?? dogs[0] ?? null;

  const {
    trackPoints, markers, currentPosition, heading, gpsAccuracy,
    distanceMeters, durationSeconds, isPaused, mapFollowMode, setMapFollowMode,
    startAnchor, startLockActive, startDriftRejectedCount,
  } = useTrackingStore();

  // GPS wirklich bereit (gute Genauigkeit) vs. nur manuell freigegeben (nach 15 s).
  const gpsReady = gpsAccuracy != null && gpsAccuracy <= 15;
  const canStart = gpsReady || warmupElapsed >= 15;

  // EINEN GPS-Stream beim Öffnen starten (Warmup). Genau einmal.
  useEffect(() => {
    if (warmupStartedRef.current) return;
    warmupStartedRef.current = true;
    rec.startWarmup().then(r => { if (r.error) showToast(r.error); });
  }, [rec, showToast]);

  // Warmup-Sekundenzähler (für die 15-s-Freigabe).
  useEffect(() => {
    if (phase !== 'warmup') return;
    const t = setInterval(() => setWarmupElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Echtes Wetter zur GPS-Position holen — einmalig, sobald eine Position vorliegt.
  useEffect(() => {
    if (weatherFetchedRef.current || !currentPosition) return;
    weatherFetchedRef.current = true;
    setWeatherState('loading');
    fetchCurrentWeather(currentPosition.lat, currentPosition.lng).then(w => {
      if (w) { setWeather(w); setWeatherState('idle'); }
      else { setWeatherState('failed'); }
    });
  }, [currentPosition]);

  // Aufnahme scharf schalten — LOKAL ZUERST: die Aufnahme darf NIE an Login/Netz
  // hängen. Erst sofort recorden (Timer + Linie laufen), dann die Remote-Session
  // best-effort im Hintergrund anlegen und ihre ID nachreichen.
  const begin = useCallback(async () => {
    if (beganRef.current) return;
    beganRef.current = true;
    hapticSuccess();   // SOFORT beim Start-Tap — vor jedem await/GPS/Netz

    const r = await rec.beginRecording(null);   // sofort scharf (recording=true, Timer)
    if (r.error) { beganRef.current = false; showToast(r.error); return; }
    setPhase('recording');
    showToast('Fährte läuft');

    // Remote-Session im Hintergrund (blockiert die Aufnahme nicht).
    const uid = session?.user.id;
    if (uid && activeDog) {
      createTrackSession(uid, {
        dogId: activeDog.id, surfaceTypes: [surface], terrainConditions: condition ? [condition] : [],
        lyingTimeMinutes: 0, notes: null, locationName: null,
        temperature:      weather?.temperature ?? null,
        weatherCondition: weather?.weatherCondition ?? null,
        windSpeed:        weather?.windSpeed ?? null,
        humidity:         weather?.humidity ?? null,
        latitude: currentPosition?.lat ?? null, longitude: currentPosition?.lng ?? null,
        distraction: false,
      }).then(({ data, error }) => {
        if (!error && data) { sessionIdRef.current = data.id; useTrackingStore.getState().setCurrentSession(data.id); }
        else showToast('Offline — wird später synchronisiert.');
      }).catch(() => showToast('Offline — wird später synchronisiert.'));
    }
  }, [session, activeDog, rec, showToast, surface, condition, weather, currentPosition]);

  useEffect(() => () => { rec.stopAll(); }, [rec.stopAll]);

  const mapMarkers: MapMarker[] = markers.map(mk => ({ type: mk.type, lat: mk.lat, lng: mk.lng, angleKind: mk.angleKind, material: mk.material }));
  const gegenstaende = markers.filter(mk => mk.type === 'gegenstand').length;
  const winkel = markers.filter(mk => mk.type === 'winkel').length;
  // Echte Positionen für die Skizze (deckt sich mit der Aufnahme).
  const angleMarkers = markers.filter(mk => mk.type === 'winkel' && mk.lat != null && mk.lng != null).map(mk => ({ lat: mk.lat as number, lng: mk.lng as number }));
  const objectMarkers = markers.filter(mk => mk.type === 'gegenstand' && mk.lat != null && mk.lng != null).map(mk => ({ lat: mk.lat as number, lng: mk.lng as number }));

  const onStop = async () => {
    hapticSuccess();   // SOFORT beim Stop-Tap, vor await finish
    const id = sessionIdRef.current;
    await rec.finish(id);   // toleriert null (offline → nur lokal gesichert)
    if (id) {
      router.replace(`/track/liegen?id=${id}` as never);   // → Wartephase (Liegezeit) → Ausarbeiten
    } else {
      showToast('Lokal gesichert — Auswertung nach Sync verfügbar.');
      router.canGoBack() ? router.back() : router.replace('/track' as never);
    }
  };

  // GPS ab >45 m warnen — dann landen keine Linienpunkte (Filter), Distanz bleibt 0.
  const gpsPoor = gpsAccuracy != null && gpsAccuracy > 45;
  const metrics: { value: string; label: string; warn?: boolean }[] = [
    { value: `${Math.round(distanceMeters)} m`, label: `${metersToSteps(distanceMeters)} Schr.` },
    { value: String(gegenstaende), label: 'Gegenst.' },
    { value: String(winkel), label: 'Winkel' },
    { value: gpsAccuracy != null ? `±${Math.round(gpsAccuracy)} m` : '–', label: 'GPS', warn: gpsPoor },
  ];

  // GPS-Debug (nur Dev): schlankes gpsDebug → GpsStats fürs PrecisionDebugPanel (nur lesend).
  const dbg = rec.gpsDebug;
  const rej = dbg?.rejectedCount ?? 0;
  const gpsDebugStats: GpsStats = {
    rawCount:      trackPoints.length + rej,
    filteredCount: trackPoints.length,
    rejectedCount: rej,
    rejectionRate: (trackPoints.length + rej) > 0 ? rej / (trackPoints.length + rej) : 0,
    lastAccuracy:  gpsAccuracy ?? null,
    bestAccuracy:  null,
  };

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['top']} className="flex-1">
        {/* Top-Bar: Zurück · LIVE · Karte/Skizze */}
        <View className="flex-row items-center gap-3 px-[18px] pt-2 pb-3">
          <Pressable
            className="w-10 h-10 rounded-[12px] border border-ft-line-strong bg-white/10 items-center justify-center"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/track' as never))} hitSlop={10}
          >
            <Ionicons name="chevron-back" size={20} color={FT.text} />
          </Pressable>
          {phase === 'recording' && (
            <View
              className="flex-row items-center gap-[7px] px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(255,93,108,0.24)', borderWidth: 1, borderColor: 'rgba(255,93,108,0.55)' }}
            >
              <RecDot />
              <Text className="text-[12px] font-extrabold tracking-[1.4px] text-[#ff9aa2]">LIVE</Text>
            </View>
          )}
          <View className="flex-1" />
          <View className="flex-row bg-white/10 rounded-[12px] p-[3px] gap-[2px]">
            {(['map', 'sketch'] as const).map(k => {
              const on = view === k;
              return (
                <Pressable key={k} onPress={() => setView(k)} className={`px-[12px] py-1.5 rounded-lg ${on ? 'bg-ft-acc' : ''}`}>
                  <Text className={`text-[12px] font-extrabold ${on ? 'text-ft-acc-text' : 'text-white/80'}`}>
                    {k === 'map' ? 'Karte' : 'Skizze'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Karte / Skizze */}
        <View className="flex-1 mx-[14px] rounded-[24px] overflow-hidden border border-ft-line bg-[#08100e]">
          {view === 'map' ? (
            <TrackingMap
              layPoints={trackPoints}
              markers={mapMarkers}
              startAnchor={startAnchor}
              currentPosition={currentPosition}
              heading={heading}
              follow={mapFollowMode}
              onToggleFollow={() => setMapFollowMode(!mapFollowMode)}
              onUserPan={() => { if (mapFollowMode) setMapFollowMode(false); }}
              controlsTop={64}
              mapType="hybrid"
            />
          ) : (
            <View className="flex-1 bg-[#08100e]">
              <TrackSketch points={trackPoints} angleMarkers={angleMarkers} objectMarkers={objectMarkers} legs={winkel} objects={gegenstaende} w={340} h={520} progress={1} />
            </View>
          )}

          {/* Timer (oben links) */}
          <View className="absolute top-[14px] left-[14px] rounded-[16px] px-4 py-[10px] bg-ft-glass border border-ft-glass-line">
            <Text className="text-[30px] text-ft-text font-black" style={{ fontVariant: ['tabular-nums'] }}>{clock(durationSeconds)}</Text>
            <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">Laufzeit</Text>
          </View>

          {/* Hunde-Anzeige (oben rechts) — Auswahl erfolgt im Warmup-Setup */}
          {activeDog && (
            <View className="absolute top-[14px] right-[14px] flex-row items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 bg-ft-glass border border-ft-glass-line">
              <View className="w-[26px] h-[26px] rounded-full bg-ft-acc items-center justify-center">
                <Text className="text-[12px] font-extrabold text-ft-acc-text">{(activeDog.name?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <Text className="text-[12.5px] font-bold text-ft-text">{activeDog.name}</Text>
            </View>
          )}

          {/* Metrik-Leiste (unten) */}
          <View className="absolute left-[14px] right-[14px] bottom-[14px] flex-row rounded-[18px] py-3 px-2 bg-ft-glass border border-ft-glass-line">
            {metrics.map((mm, i) => (
              <View key={i} className={`flex-1 items-center ${i > 0 ? 'border-l border-ft-line' : ''}`}>
                <Text className={`text-[15px] font-black ${mm.warn ? 'text-ft-warn' : 'text-ft-text'}`} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>{mm.value}</Text>
                <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{mm.label}</Text>
              </View>
            ))}
          </View>

          {/* Start-Lock: Hinweis während der Stabilisierungsphase (keine Linie/Distanz). */}
          {phase === 'recording' && startLockActive && (
            <View className="absolute top-[64px] left-0 right-0 items-center px-4" pointerEvents="none">
              <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-ft-glass border border-ft-glass-line">
                <ActivityIndicator size="small" color={FT.acc} />
                <Text className="text-[11px] font-bold text-ft-text">Startpunkt wird gesetzt … kurz stehen bleiben</Text>
              </View>
            </View>
          )}

          {/* Warmup-Overlay: GPS-Status + Bedingungen wählen + Start */}
          {phase === 'warmup' && (
            <View className="absolute inset-0 bg-black/75">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 22 }}
              >
                <View className="items-center gap-[8px]">
                  {gpsReady
                    ? <Ionicons name="checkmark-circle" size={40} color={FT.acc} />
                    : <ActivityIndicator size="large" color={FT.acc} />}
                  <Text className="text-[18px] text-ft-text font-extrabold mt-1.5">
                    {gpsReady ? 'GPS bereit' : 'GPS wird stabilisiert'}
                  </Text>
                  <Text className="text-[14px] font-semibold mb-2" style={{ color: gpsReady ? FT.acc : FT.muted }}>
                    {gpsAccuracy != null ? `±${Math.round(gpsAccuracy)} m` : 'Suche Satelliten…'}
                  </Text>

                  {/* Hund */}
                  {dogs.length > 0 && (
                    <>
                      <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">Hund</Text>
                      <View className="flex-row flex-wrap gap-2 self-start mb-1">
                        {dogs.map(d => {
                          const on = d.id === activeDog?.id;
                          return (
                            <Pressable key={d.id} onPress={() => setSelectedDogId(d.id)}
                              className={`flex-row items-center gap-1.5 pl-1.5 pr-[12px] py-1.5 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line'}`}>
                              <View className="w-[22px] h-[22px] rounded-full bg-ft-acc items-center justify-center">
                                <Text className="text-[10px] font-extrabold text-ft-acc-text">{(d.name?.[0] ?? '?').toUpperCase()}</Text>
                              </View>
                              <Text className={`text-[13px] font-semibold ${on ? 'text-ft-acc' : 'text-ft-muted'}`}>{d.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {/* Untergrund */}
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">Untergrund</Text>
                  <View className="flex-row flex-wrap gap-2 self-start mb-1">
                    {SURFACES.map(sfc => {
                      const on = surface === sfc;
                      return (
                        <Pressable key={sfc} onPress={() => setSurface(sfc)}
                          className={`px-[13px] py-2 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line'}`}>
                          <Text className={`text-[13px] font-semibold ${on ? 'text-ft-acc' : 'text-ft-muted'}`}>{sfc}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Beschaffenheit */}
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">Beschaffenheit</Text>
                  <View className="flex-row flex-wrap gap-2 self-start mb-1">
                    {CONDITIONS.map(c => {
                      const on = condition === c;
                      return (
                        <Pressable key={c} onPress={() => setCondition(on ? null : c)}
                          className={`px-[13px] py-2 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line'}`}>
                          <Text className={`text-[13px] font-semibold ${on ? 'text-ft-acc' : 'text-ft-muted'}`}>{c}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Winkel-Erkennung: vollautomatisch vs. alles manuell.
                      Gegenstände sind davon ausgenommen — die immer manuell. */}
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">Winkel-Erkennung</Text>
                  <View className="flex-row gap-2 self-stretch">
                    {([['auto', 'Automatisch', 'flash'], ['manual', 'Manuell', 'hand-left']] as const).map(([val, label, icon]) => {
                      const on = autoDetect === (val === 'auto');
                      return (
                        <Pressable key={val} onPress={() => void setAutoDetect(val === 'auto')}
                          className={`flex-1 flex-row items-center justify-center gap-1.5 px-[13px] py-2.5 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line'}`}>
                          <Ionicons name={icon} size={15} color={on ? FT.acc : FT.muted} />
                          <Text className={`text-[13px] font-semibold ${on ? 'text-ft-acc' : 'text-ft-muted'}`}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="text-[11px] text-ft-faint self-start mb-1">
                    {autoDetect
                      ? 'Winkel, Spitzwinkel & Abriss werden automatisch erkannt. Gegenstände setzt du selbst.'
                      : 'Du setzt alle Winkel & Abrisse selbst. Gegenstände sind ohnehin manuell.'}
                  </Text>

                  {/* Wetter — echt & automatisch zur GPS-Position (Open-Meteo), nicht eingetippt */}
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">Wetter</Text>
                  <View className="self-stretch rounded-[14px] px-4 py-3 bg-white/5 border border-ft-line">
                    {weatherState === 'loading' ? (
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color={FT.muted} />
                        <Text className="text-[13px] font-semibold text-ft-muted">Wetter wird geladen…</Text>
                      </View>
                    ) : weather ? (
                      <>
                        <View className="flex-row items-center gap-2 mb-1">
                          <Ionicons name="partly-sunny-outline" size={17} color={FT.acc} />
                          <Text className="text-[15px] font-extrabold text-ft-text">{weather.weatherCondition}</Text>
                        </View>
                        <View className="flex-row flex-wrap gap-x-4 gap-y-0.5">
                          <Text className="text-[13px] font-semibold text-ft-muted">🌡️ {weather.temperature.toFixed(1)} °C</Text>
                          <Text className="text-[13px] font-semibold text-ft-muted">💨 {weather.windSpeed.toFixed(0)} km/h</Text>
                          <Text className="text-[13px] font-semibold text-ft-muted">💧 {weather.humidity.toFixed(0)} %</Text>
                        </View>
                      </>
                    ) : (
                      <Text className="text-[13px] font-semibold text-ft-muted">Wetter nicht verfügbar (kein Netz)</Text>
                    )}
                  </View>

                  {/* Start (frei ab GPS bereit; nach 15 s manuell trotz Ungenauigkeit) */}
                  <Pressable
                    className={`flex-row items-center justify-center gap-2 mt-4 rounded-[16px] px-[20px] py-3 self-stretch ${canStart ? 'bg-ft-acc' : 'bg-white/10'}`}
                    onPress={() => { if (canStart) void begin(); }}
                    disabled={!canStart}
                  >
                    <Ionicons name="play" size={16} color={canStart ? FT.accText : FT.muted} />
                    <Text className={`text-[14px] font-extrabold ${canStart ? 'text-ft-acc-text' : 'text-ft-muted'}`}>
                      {canStart ? 'Fährte legen' : 'Warte auf GPS…'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* Steuerung */}
        <View className="flex-row gap-3 px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            onPress={() => setMaterialSheet(true)} disabled={phase !== 'recording'}
          >
            <Ionicons name="cube-outline" size={20} color={FT.text} />
            <Text className="text-[10.5px] font-extrabold text-ft-text">Gegenstand</Text>
          </Pressable>
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            onPress={() => { hapticTap(); isPaused ? rec.resume() : rec.pause(); }} disabled={phase !== 'recording'}
          >
            <Ionicons name={isPaused ? 'play' : 'pause'} size={20} color={FT.text} />
            <Text className="text-[10.5px] font-extrabold text-ft-text">{isPaused ? 'Weiter' : 'Pause'}</Text>
          </Pressable>
          <Pressable
            className="h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-ft-bad"
            style={{ flex: 1.3 }} onPress={onStop} disabled={phase !== 'recording'}
          >
            <Ionicons name="stop" size={20} color="#2a060a" />
            <Text className="text-[10.5px] font-extrabold text-[#2a060a]">Stop & Auswerten</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Gegenstand: Material wählen */}
      <AnyvoBottomSheet visible={materialSheet} onClose={() => setMaterialSheet(false)} title="Gegenstand-Material">
        <View className="flex-row flex-wrap gap-[10px] pb-2">
          {GEGENSTAND_MATERIALS.map(m => (
            <Pressable
              key={m.material}
              onPress={() => placeGegenstand(m.material)}
              style={{ width: '30.5%', flexGrow: 1 }}
              className="items-center gap-[7px] py-[14px] rounded-[16px] bg-white/5 border border-ft-line-strong"
            >
              <View className="w-[42px] h-[42px] rounded-[13px] items-center justify-center bg-ft-acc-dim">
                <Ionicons name={m.icon} size={20} color={FT.acc} />
              </View>
              <Text className="text-[12.5px] font-bold text-ft-text">{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </AnyvoBottomSheet>

      {SHOW_GPS_DEBUG && (
        <PrecisionDebugPanel
          engineLabel={dbg?.source === 'native' ? 'native' : 'expo'}
          stats={gpsDebugStats}
          status={null}
          phase={phase}
          isNativePrecision={dbg?.source === 'native'}
          provider={dbg?.provider ?? null}
          nativeAvailable={dbg?.isNativeAvailable ?? null}
          rawGnssAvailable={dbg?.rawGnssSupported ?? null}
          rawPointCount={trackPoints.length}
          startLockActive={startLockActive}
          startAnchorSet={!!startAnchor}
          startAnchorAccuracy={startAnchor?.accuracy ?? null}
          startDriftRejectedCount={startDriftRejectedCount}
          devMode
        />
      )}

      {toast}
    </View>
  );
}
