import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FT } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { useTrackRecording } from '@/features/tracking/hooks/useTrackRecording';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { createTrackSession } from '@/features/tracking/services/trackService';
import { findSharpTurns } from '@/features/tracking/engine/turnDetection';
import { ANGLE_LABEL } from '@/features/tracking/utils/angleClassify';
import { useToast } from '@/components/ui/Toast';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

function clock(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const haptic = (fn: () => void) => { try { fn(); } catch { /* haptics optional */ } };

// Untergrund + Beschaffenheit (vor dem Legen wählbar, während GPS stabilisiert).
const SURFACES = ['Acker', 'Wiese', 'Wald', 'Mischung'] as const;
const CONDITIONS = ['Nass', 'Trocken', 'Schnee', 'Gefroren'] as const;

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
  const params = useLocalSearchParams<{ dogId?: string }>();
  const { session } = useSession();
  const { dogs } = useDogs();
  const rec = useTrackRecording();
  const { showToast, toast } = useToast();

  const [phase, setPhase] = useState<'warmup' | 'recording'>('warmup');
  const [view, setView] = useState<'map' | 'sketch'>('map');
  const [surface, setSurface] = useState<string>('Acker');        // Untergrund
  const [condition, setCondition] = useState<string | null>(null); // Beschaffenheit
  const [lastAngle, setLastAngle] = useState<AngleKind | null>(null);
  const [warmupElapsed, setWarmupElapsed] = useState(0);
  const beganRef = useRef(false);
  const warmupStartedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const markedTurns = useRef<Set<number>>(new Set());

  const activeDog = dogs.find(d => d.id === params.dogId) ?? dogs[0] ?? null;

  const {
    trackPoints, markers, currentPosition, heading, gpsAccuracy,
    distanceMeters, durationSeconds, isPaused, mapFollowMode,
  } = useTrackingStore();

  // GPS bereit, sobald Genauigkeit ≤ 15 m — oder manuell nach 15 s.
  const canStart = (gpsAccuracy != null && gpsAccuracy <= 15) || warmupElapsed >= 15;

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

  // Aufnahme scharf schalten: Session anlegen, denselben Stream aufnehmen lassen.
  const begin = useCallback(async () => {
    if (beganRef.current) return;
    const uid = session?.user.id;
    if (!uid || !activeDog) return;
    beganRef.current = true;
    const { data, error } = await createTrackSession(uid, {
      dogId: activeDog.id, surfaceTypes: [surface], terrainConditions: condition ? [condition] : [],
      lyingTimeMinutes: 0, notes: null, locationName: null, temperature: null,
      weatherCondition: null, latitude: null, longitude: null, distraction: false,
      humidity: null, windSpeed: null,
    });
    if (error || !data) { beganRef.current = false; showToast('Fährte konnte nicht gestartet werden.'); return; }
    sessionIdRef.current = data.id;
    const r = await rec.beginRecording(data.id);
    if (r.error) { beganRef.current = false; showToast(r.error); return; }
    setPhase('recording');
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); // Abriss
    showToast('Abriss gesetzt — Fährte läuft');
  }, [session, activeDog, rec, showToast, surface, condition]);

  // Automatische Winkel-Erkennung auf der Clean-Linie (rechts/links/spitz) + Haptik.
  useEffect(() => {
    if (phase !== 'recording') return;
    const pts = trackPoints.map(p => ({ lat: p.lat, lng: p.lng }));
    if (pts.length < 3) return;
    for (const turn of findSharpTurns(pts)) {
      if (markedTurns.current.has(turn.index)) continue;
      markedTurns.current.add(turn.index);
      const kind: AngleKind = turn.turnDeg > 110 ? 'spitz' : turn.direction;
      setLastAngle(kind);
      rec.addMarker('winkel', { angleKind: kind });
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      showToast(`${ANGLE_LABEL[kind]} erkannt`);
    }
  }, [trackPoints, phase, rec, showToast]);

  useEffect(() => () => { rec.stopAll(); }, [rec]);

  const mapMarkers: MapMarker[] = markers.map(mk => ({ type: mk.type, lat: mk.lat, lng: mk.lng }));
  const gegenstaende = markers.filter(mk => mk.type === 'gegenstand').length;
  const winkel = markers.filter(mk => mk.type === 'winkel').length;

  const onStop = async () => {
    const id = sessionIdRef.current;
    if (!id) { router.canGoBack() ? router.back() : router.replace('/track' as never); return; }
    await rec.finish(id);
    router.replace(`/track/run?id=${id}` as never);   // → Liegezeit / Ausarbeiten
  };

  const metrics: [string, string][] = [
    [`${Math.round(distanceMeters)} m`, 'Distanz'],
    [String(gegenstaende), 'Gegenst.'],
    [String(winkel), 'Winkel'],
    [lastAngle ? ANGLE_LABEL[lastAngle].replace('winkel', 'w.') : '–', 'Letzter'],
  ];

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['top']} className="flex-1">
        {/* Top-Bar: Zurück · LIVE · Karte/Skizze */}
        <View className="flex-row items-center gap-3 px-[18px] pb-[10px]">
          <Pressable
            className="w-9 h-9 rounded-[11px] border border-ft-line-strong bg-white/5 items-center justify-center"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/track' as never))} hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={FT.text} />
          </Pressable>
          <View
            className="flex-row items-center gap-[7px] px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'rgba(255,93,108,0.14)', borderWidth: 1, borderColor: 'rgba(255,93,108,0.3)' }}
          >
            <RecDot />
            <Text className="text-[11px] font-extrabold tracking-[1.4px] text-[#ff8a94]">LIVE</Text>
          </View>
          <View className="flex-1" />
          <View className="flex-row bg-white/5 rounded-[11px] p-[3px] gap-[2px]">
            {(['map', 'sketch'] as const).map(k => {
              const on = view === k;
              return (
                <Pressable key={k} onPress={() => setView(k)} className={`px-[11px] py-1.5 rounded-lg ${on ? 'bg-ft-acc' : ''}`}>
                  <Text className={`text-[11.5px] font-bold ${on ? 'text-ft-acc-text' : 'text-ft-muted'}`}>
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
              currentPosition={currentPosition}
              heading={heading}
              follow={mapFollowMode}
              mapType="hybrid"
              hideControls
            />
          ) : (
            <View className="flex-1 bg-[#08100e]">
              <TrackSketch legs={winkel} objects={gegenstaende} w={340} h={520} progress={1} />
            </View>
          )}

          {/* Timer (oben links) */}
          <View className="absolute top-[14px] left-[14px] rounded-[16px] px-4 py-[10px] bg-ft-glass border border-ft-glass-line">
            <Text className="text-[30px] text-ft-text font-black" style={{ fontVariant: ['tabular-nums'] }}>{clock(durationSeconds)}</Text>
            <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">Laufzeit</Text>
          </View>

          {/* Hunde-Pill (oben rechts) */}
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
            {metrics.map(([val, cap], i) => (
              <View key={i} className={`flex-1 items-center ${i > 0 ? 'border-l border-ft-line' : ''}`}>
                <Text className="text-[15px] font-black text-ft-text" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>{val}</Text>
                <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{cap}</Text>
              </View>
            ))}
          </View>

          {/* Warmup-Overlay: GPS-Status + Untergrund/Beschaffenheit wählen + Start */}
          {phase === 'warmup' && (
            <View className="absolute inset-0 bg-black/70 items-center justify-center px-6 gap-[8px]">
              <ActivityIndicator size="large" color={FT.acc} />
              <Text className="text-[18px] text-ft-text font-extrabold mt-1.5">GPS wird stabilisiert</Text>
              <Text className="text-[14px] text-ft-muted font-semibold mb-2">
                {gpsAccuracy != null ? `±${Math.round(gpsAccuracy)} m` : 'Suche Satelliten…'}
              </Text>

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
              <View className="flex-row flex-wrap gap-2 self-start">
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
          )}
        </View>

        {/* Steuerung */}
        <View className="flex-row gap-3 px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            onPress={() => rec.addMarker('gegenstand')} disabled={phase !== 'recording'}
          >
            <Ionicons name="cube-outline" size={20} color={FT.text} />
            <Text className="text-[10.5px] font-extrabold text-ft-text">Gegenstand</Text>
          </Pressable>
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            onPress={() => (isPaused ? rec.resume() : rec.pause())} disabled={phase !== 'recording'}
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
      {toast}
    </View>
  );
}
