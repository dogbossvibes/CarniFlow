import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { FT } from '@/constants/colors';
import { startPositionSource } from '@/features/tracking/utils/positionSource';
import { calculateDistance, shouldAcceptTrackPoint, getGpsQuality } from '@/features/tracking/utils/gpsFilter';
import {
  CALIBRATION_STEPS, calibrateStepLength, isAcceptableCalibration,
  MIN_CALIBRATED_STEP_LENGTH_M, MAX_CALIBRATED_STEP_LENGTH_M,
} from '@/features/tracking/utils/stepCalibration';
import { useStepLengthSetting } from '@/hooks/useStepLengthSetting';
import { useToast } from '@/components/ui/Toast';
import { HelpButton } from '@/components/help/HelpButton';

const cm = (m: number) => Math.round(m * 100);

// SCHRITTLÄNGE KALIBRIEREN — der Nutzer geht CALIBRATION_STEPS echte Fährtenschritte
// (zählt selbst) und tippt „Fertig". ANYVO misst die Gehstrecke über die bestehende
// positionSource (kumulierte Haversine, Runtime-only — KEINE Fährte/Session/Persistenz)
// und leitet die persönliche Schrittlänge ab.
export default function StepCalibrationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useKeepAwake();
  const { stepLengthM, setStepLengthM } = useStepLengthSetting();
  const { showToast, toast } = useToast();

  const [phase, setPhase]   = useState<'intro' | 'measuring' | 'result'>('intro');
  const [distanceM, setDistanceM] = useState(0);
  const [accuracy, setAccuracy]   = useState<number | null>(null);
  const [result, setResult]       = useState<number | null>(null);   // berechnete Schrittlänge (m), NICHT gerundet

  const stopRef   = useRef<(() => void) | null>(null);
  const lastPtRef = useRef<{ lat: number; lng: number; accuracy: number | null; t: number } | null>(null);
  const accumRef  = useRef(0);

  const stopSource = useCallback(() => { stopRef.current?.(); stopRef.current = null; }, []);
  useEffect(() => () => stopSource(), [stopSource]);

  const startMeasuring = useCallback(async () => {
    // Berechtigung (nur Permission, keine parallele GPS-Abfrage — Position via positionSource).
    let granted = (await Location.getForegroundPermissionsAsync()).status === 'granted';
    if (!granted) granted = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
    if (!granted) { showToast('Standortberechtigung fehlt.'); return; }

    accumRef.current = 0; lastPtRef.current = null;
    setDistanceM(0); setAccuracy(null); setResult(null);
    setPhase('measuring');

    try {
      const handle = await startPositionSource((s) => {
        const next = { lat: s.lat, lng: s.lng, accuracy: s.accuracy ?? null, t: s.t ?? Date.now() };
        setAccuracy(s.accuracy ?? null);
        // Bestehende Filterprinzipien (Accuracy-/Speed-/Distanz-Gate) wiederverwenden.
        if (shouldAcceptTrackPoint(lastPtRef.current, next)) {
          if (lastPtRef.current) accumRef.current += calculateDistance(lastPtRef.current, next);
          lastPtRef.current = next;
          setDistanceM(accumRef.current);
        }
      }, { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 });
      stopRef.current = handle.stop;
    } catch {
      showToast('GPS konnte nicht gestartet werden.');
      setPhase('intro');
    }
  }, [showToast]);

  const finishMeasuring = useCallback(() => {
    stopSource();
    const dist = accumRef.current;
    setDistanceM(dist);
    setResult(calibrateStepLength(dist, CALIBRATION_STEPS));   // ungerundet
    setPhase('result');
  }, [stopSource]);

  const cancel = useCallback(() => {
    stopSource();
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile' as never);
  }, [router, stopSource]);

  const acceptable = result != null && isAcceptableCalibration(distanceM, CALIBRATION_STEPS);

  const applyResult = useCallback(async () => {
    if (result == null || !acceptable) return;
    await setStepLengthM(result);   // ungerundet persistiert (useStepLengthSetting)
    showToast(`Schrittlänge gespeichert: ≈ ${cm(result)} cm`);
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile' as never);
  }, [result, acceptable, setStepLengthM, showToast, router]);

  const remeasure = useCallback(() => { setPhase('intro'); setResult(null); setDistanceM(0); }, []);

  const currentLabel = stepLengthM != null ? `Persönlich: ${cm(stepLengthM)} cm` : 'Standard: 75 cm';
  const qual = getGpsQuality(accuracy);

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <View className="flex-row items-center gap-3 px-[18px] pb-3" style={{ paddingTop: insets.top + 4 }}>
          <Pressable className="w-10 h-10 rounded-[12px] border border-ft-line-strong bg-white/10 items-center justify-center" onPress={cancel} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={FT.text} />
          </Pressable>
          <Text className="text-[18px] font-black text-ft-text">Schrittlänge kalibrieren</Text>
          <View className="flex-1" />
          <HelpButton topicId="track_step_calibration" autoShow tint={FT.text} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} showsVerticalScrollIndicator={false}>
          {phase === 'intro' && (
            <>
              <View className="rounded-[20px] p-4 bg-white/5 border border-ft-line-strong gap-2">
                <Text className="text-[13px] text-ft-muted">Aktuell</Text>
                <Text className="text-[22px] font-black text-ft-text">{currentLabel}</Text>
              </View>
              <Text className="text-[14px] text-ft-text leading-[21px]">
                Gehe <Text className="font-black">{CALIBRATION_STEPS} normale Fährtenschritte</Text>. Zähle die
                Schritte selbst und tippe nach Schritt {CALIBRATION_STEPS} auf Fertig.
              </Text>
              <Text className="text-[12.5px] text-ft-muted leading-[19px]">
                Für ein gutes Ergebnis möglichst gerade Strecke und guten GPS-Empfang verwenden. ANYVO zählt die
                Schritte nicht automatisch.
              </Text>
              <Pressable onPress={startMeasuring} className="flex-row items-center justify-center gap-2 mt-2 rounded-[16px] px-6 py-3.5 bg-ft-acc">
                <Ionicons name="walk" size={18} color={FT.accText} />
                <Text className="text-[15px] font-black text-ft-acc-text">Kalibrierung starten</Text>
              </Pressable>
              {stepLengthM != null && (
                <Pressable
                  onPress={() => Alert.alert('Auf Standard zurücksetzen?', 'Die persönliche Schrittlänge wird gelöscht (zurück auf 0,75 m).', [
                    { text: 'Abbrechen', style: 'cancel' },
                    { text: 'Zurücksetzen', style: 'destructive', onPress: async () => { await setStepLengthM(null); showToast('Auf Standard (75 cm) zurückgesetzt.'); } },
                  ])}
                  className="flex-row items-center justify-center gap-2 rounded-[16px] px-6 py-3 bg-white/5 border border-ft-line-strong"
                >
                  <Ionicons name="refresh" size={16} color={FT.muted} />
                  <Text className="text-[14px] font-bold text-ft-muted">Auf Standard zurücksetzen</Text>
                </Pressable>
              )}
            </>
          )}

          {phase === 'measuring' && (
            <>
              <Text className="text-[13px] text-ft-muted font-bold tracking-[1.4px] uppercase">Kalibrierung läuft</Text>
              <Text className="text-[16px] font-black text-ft-text">{CALIBRATION_STEPS} Schritte gehen</Text>
              <View className="rounded-[20px] p-5 bg-white/5 border border-ft-line-strong items-center gap-1 mt-2">
                <Text className="text-[48px] font-black text-ft-text" style={{ fontVariant: ['tabular-nums'] }}>{distanceM.toFixed(1)} m</Text>
                <Text className="text-[10px] text-ft-muted font-bold tracking-[1.4px] uppercase">gemessene Strecke</Text>
              </View>
              <View className="flex-row items-center justify-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-ft-line self-center">
                <Ionicons name="navigate" size={13} color={accuracy != null && accuracy <= 15 ? FT.acc : FT.warn} />
                <Text className="text-[12px] font-bold text-ft-text">
                  {accuracy != null ? `GPS ±${Math.round(accuracy)} m` : 'GPS wird gesucht…'}
                </Text>
              </View>
              {accuracy != null && accuracy > 20 && (
                <Text className="text-[12px] text-ft-warn font-semibold text-center">GPS noch zu ungenau. Bitte kurz stehen bleiben.</Text>
              )}
              <Pressable onPress={finishMeasuring} className="flex-row items-center justify-center gap-2 mt-2 rounded-[16px] px-6 py-3.5 bg-ft-acc">
                <Ionicons name="checkmark" size={18} color={FT.accText} />
                <Text className="text-[15px] font-black text-ft-acc-text">Fertig – {CALIBRATION_STEPS} Schritte</Text>
              </Pressable>
              <Pressable onPress={cancel} className="flex-row items-center justify-center gap-2 rounded-[16px] px-6 py-3 bg-white/5 border border-ft-line-strong">
                <Text className="text-[14px] font-bold text-ft-muted">Abbrechen</Text>
              </Pressable>
              <Text className="text-[11px] text-ft-faint text-center">GPS-Qualität: {qual}</Text>
            </>
          )}

          {phase === 'result' && result != null && (
            <>
              <View className="rounded-[20px] p-5 bg-white/5 border border-ft-line-strong gap-3">
                <View>
                  <Text className="text-[11px] text-ft-muted font-bold tracking-[1.2px] uppercase">Gemessene Strecke</Text>
                  <Text className="text-[20px] font-black text-ft-text">{distanceM.toFixed(1)} m · {CALIBRATION_STEPS} Schritte</Text>
                </View>
                <View>
                  <Text className="text-[11px] text-ft-muted font-bold tracking-[1.2px] uppercase">Deine Schrittlänge</Text>
                  <Text className="text-[34px] font-black text-ft-acc" style={{ fontVariant: ['tabular-nums'] }}>{result.toFixed(3)} m</Text>
                  <Text className="text-[13px] text-ft-muted">≈ {cm(result)} cm pro Schritt</Text>
                </View>
              </View>

              {!acceptable && (
                <View className="rounded-[16px] p-3 bg-white/5 border border-[rgba(255,181,71,0.5)] flex-row items-start gap-2">
                  <Ionicons name="warning-outline" size={16} color={FT.warn} />
                  <Text className="text-[12.5px] text-ft-warn font-semibold flex-1 leading-[19px]">
                    Das Messergebnis wirkt unplausibel (erwartet {cm(MIN_CALIBRATED_STEP_LENGTH_M)}–{cm(MAX_CALIBRATED_STEP_LENGTH_M)} cm bei gutem GPS). Bitte wiederhole die Kalibrierung.
                  </Text>
                </View>
              )}

              <Pressable
                onPress={applyResult} disabled={!acceptable}
                className={`flex-row items-center justify-center gap-2 rounded-[16px] px-6 py-3.5 ${acceptable ? 'bg-ft-acc' : 'bg-white/10'}`}
              >
                <Ionicons name="checkmark-circle" size={18} color={acceptable ? FT.accText : FT.muted} />
                <Text className={`text-[15px] font-black ${acceptable ? 'text-ft-acc-text' : 'text-ft-muted'}`}>Schrittlänge übernehmen</Text>
              </Pressable>
              <Pressable onPress={remeasure} className="flex-row items-center justify-center gap-2 rounded-[16px] px-6 py-3 bg-white/5 border border-ft-line-strong">
                <Ionicons name="refresh" size={16} color={FT.text} />
                <Text className="text-[14px] font-bold text-ft-text">Erneut messen</Text>
              </Pressable>
              <Pressable onPress={cancel} className="flex-row items-center justify-center gap-2 rounded-[16px] px-6 py-2.5">
                <Text className="text-[13px] font-bold text-ft-muted">Abbrechen</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      {toast}
    </View>
  );
}
