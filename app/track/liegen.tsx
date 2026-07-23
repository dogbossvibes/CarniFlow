import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { FT } from '@/constants/colors';
import { useT } from '@/i18n';
import { useTrackingStore, type MarkerMaterial } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { loadPending } from '@/features/tracking/store/trackPersist';
import { restingElapsedSeconds, isRestingRecovery } from '@/features/tracking/store/restingTime';
import { startLiegezeitNotification, updateLiegezeitNotification, endLiegezeitNotification } from '@/features/tracking/native/liegezeitNotification';
import { setTrackLyingTime, getTrackSessionDogName } from '@/features/tracking/services/trackService';
import {
  TRACK_SEGMENT_COLORS,
  actualSegmentSteps,
  segmentDisplayLabel,
  type TrackSegment,
} from '@/features/tracking/utils/trackSegments';

// Liegezeit als h:mm:ss (ab 1 h) bzw. mm:ss — die Fährte kann Stunden reifen.
function fmtAge(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// WARTEPHASE zwischen Legen und Absuche: die gelegte Fährte „reift". Ein Timer
// zählt die Liegezeit ab `layFinishedAt` hoch; der Nutzer startet die Absuche
// per Knopf. Die gemessene Liegezeit (Minuten) wird auf der Session gespeichert.
// Der Lege-Store bleibt unangetastet, damit die Absuche ihn snapshotten kann.
function materialLabel(material: MarkerMaterial | null | undefined): string {
  switch (material) {
    case 'holz':     return 'Holz';
    case 'duebel':   return 'Dübel';
    case 'stoff':    return 'Stoff';
    case 'leder':    return 'Leder';
    case 'plastik':  return 'Plastik';
    case 'metall':   return 'Metall';
    case 'teppich':  return 'Teppich';
    case 'diverses': return 'Divers';
    default:         return 'Ohne Material';
  }
}

// Kennzahlen der gelegten Fährte für die Zusammenfassung.
function summarize(st: { distanceMeters: number; markers: { type: string; material?: MarkerMaterial | null }[]; segments?: TrackSegment[] }) {
  const objects = st.markers.filter(m => m.type === 'gegenstand');
  const completedSegments = (st.segments ?? []).filter(s => s.status === 'completed').sort((a, b) => a.startStep - b.startStep);
  return {
    distanceM: Math.round(st.distanceMeters),
    winkel:    st.markers.filter(m => m.type === 'winkel').length,
    objekte:   objects.length,
    materials: objects.map((m, i) => ({ index: i + 1, label: materialLabel(m.material) })),
    segments:  completedSegments,
  };
}

export default function TrackLiegenScreen() {
  const { id, dogId } = useLocalSearchParams<{ id: string; dogId?: string }>();
  const router = useRouter();
  const { t } = useT();
  useKeepAwake();   // Timer/Anzeige während der Liegezeit anlassen (Bildschirm nicht sperren)

  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);   // true ⇒ erlaubte Navigation (Absuche / bestätigt) — kein Abbruch-Dialog

  // Store hat die gelegte Fährte noch → sofort die zeitstempelbasierte Liegezeit-
  // Basis (layStartedAt, Fallback layFinishedAt) nutzen. Sonst (App wurde in der
  // Liegezeit gekillt) unten aus dem Offline-Puffer wiederherstellen.
  // Registry-Eintrag dieses Hundes (falls die Fährte gezielt wiederöffnet wird):
  // liefert die korrekte Liegezeit-Basis auch dann, wenn der Aufnahme-Store gerade
  // einen ANDEREN Hund hält (mehrere gleichzeitig liegende Fährten).
  const regEntry = dogId ? useActiveFaehrten.getState().get(dogId) : null;
  const hasStore = useTrackingStore.getState().trackPoints.length > 0 || useTrackingStore.getState().layStartedAt != null;
  const [startMs, setStartMs] = useState<number | null>(() =>
    regEntry?.layStartedAt != null ? regEntry.layStartedAt
    : hasStore ? (useTrackingStore.getState().layStartedAt ?? useTrackingStore.getState().layFinishedAt ?? Date.now())
    : null);
  const [now, setNow] = useState(Date.now());
  const [dogName, setDogName] = useState('Hund');
  const [starting, setStarting] = useState(false);
  const saveState = useTrackingStore(s => s.saveState);   // Hintergrund-Speicherung nach „Stoppen"
  const [summary, setSummary] = useState<ReturnType<typeof summarize> | null>(() =>
    hasStore ? summarize(useTrackingStore.getState())
    : regEntry ? { distanceM: regEntry.distanceMeters, winkel: regEntry.winkelCount, objekte: regEntry.objektCount, materials: [], segments: [] }
    : null);

  // Recovery / Wiederöffnen (EINMAL beim Betreten). Zwei Fälle:
  //  a) Vorwärts-Flow: der Aufnahme-Store hält bereits DIESEN Hund → nichts laden.
  //  b) Anderer Hund im Store ODER App-Kill (Store leer): die gelegte Fährte DIESES
  //     Hundes aus seinem eigenen Puffer-Slot (dog_id) zurückspielen — sonst würde
  //     die Absuche die falsche Spur verwenden. Zeit bleibt zeitstempelbasiert.
  useEffect(() => {
    let alive = true;
    const st = useTrackingStore.getState();
    const storeHasThisDog = dogId ? st.dogId === dogId : (st.trackPoints.length > 0 || st.layStartedAt != null);
    if (storeHasThisDog && (st.trackPoints.length > 0 || st.layStartedAt != null)) return;   // (a)
    loadPending(dogId).then(p => {
      if (!alive) return;
      if (p && (isRestingRecovery(p) || p.trackPoints.length > 0)) {
        useTrackingStore.getState().restorePending(p);   // KEINE neue sessionId, Status bleibt; setzt dogId
        setStartMs(p.layStartedAt ?? p.layFinishedAt ?? Date.now());
        setSummary(summarize(p));
      } else if (startMs == null) {
        setStartMs(Date.now());   // nichts wiederherstellbar → Timer ab jetzt
        setSummary({ distanceM: 0, winkel: 0, objekte: 0, materials: [], segments: [] });
      }
    });
    return () => { alive = false; };
    // Einmal beim Betreten (dogId ist pro Screen stabil).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogId]);

  // EIN Interval nur für die Anzeige (keine Zähllogik). Zeit kommt aus Date.now().
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // AppState: bei Rückkehr in den Vordergrund SOFORT aus Date.now() neu berechnen
  // (JS-Timer kann im Hintergrund pausiert haben) und die System-Anzeige auffrischen.
  // Kein zweites Interval.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      setNow(Date.now());
      if (startMs != null && useTrackingStore.getState().sessionStatus === 'resting') {
        void updateLiegezeitNotification({ sessionId: id ?? useTrackingStore.getState().currentSessionId, dogName, startedAt: startMs });
      }
    });
    return () => sub.remove();
  }, [startMs, dogName, id]);

  useEffect(() => { if (id) getTrackSessionDogName(id).then(r => { if (r.data) setDogName(r.data); }); }, [id]);

  // P4: systemnahe Liegezeit-Anzeige (Android-Notification / iOS Live Activity) starten,
  // solange status='resting'. Kein GPS/Standort. Beendet wird sie bei Absuche/Abbruch.
  const sessionStatus = useTrackingStore(s => s.sessionStatus);
  useEffect(() => {
    if (startMs == null || sessionStatus !== 'resting') return;
    void startLiegezeitNotification({ sessionId: id ?? useTrackingStore.getState().currentSessionId, dogName, startedAt: startMs });
  }, [startMs, sessionStatus, dogName, id]);

  const elapsedS = restingElapsedSeconds(startMs, now);

  const startSearch = async () => {
    if (starting || startMs == null) return;   // erst starten, wenn Liegezeit-Start feststeht
    setStarting(true);
    allowLeaveRef.current = true;   // beabsichtigte Navigation → kein Abbruch-Dialog
    void endLiegezeitNotification();   // Liegezeit-Anzeige entfernen (Übergang → Absuche)
    const minutes = Math.max(0, Math.round((Date.now() - startMs) / 60000));
    if (id) await setTrackLyingTime(id, minutes).catch(() => {});
    // Bewusst KEIN Statuswechsel auf 'searching' hier: die Suchzeit startet erst am
    // Fährtenansatz (Arming im Run-Screen). Bis dahin bleibt die Fährte 'resting'.
    router.replace((id ? `/track/run?id=${id}${dogId ? `&dogId=${dogId}` : ''}` : `/track/run${dogId ? `?dogId=${dogId}` : ''}`) as never);
  };

  // ── Abbruchschutz: kein stiller Abbruch bei Back/Swipe/Header-Back ──
  const confirmCancel = (action: unknown) => {
    Alert.alert('Fährte abbrechen?', 'Die gelegte Fährte bleibt lokal gespeichert. Nur die Liegezeit wird beendet.', [
      { text: 'Nein', style: 'cancel' },   // Event ist bereits verhindert → auf dem Screen bleiben
      { text: 'Ja, abbrechen', style: 'destructive', onPress: () => {
        useTrackingStore.getState().setSessionStatus('cancelled');   // status='cancelled', sofort persistiert
        if (dogId) useActiveFaehrten.getState().remove(dogId);   // Registry: Fährte des Hundes entfernen
        void endLiegezeitNotification();   // Anzeige entfernen (cancelled)
        allowLeaveRef.current = true;
        // @ts-expect-error react-navigation action aus dem beforeRemove-Event
        navigation.dispatch(action);
      } },
    ]);
  };
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (allowLeaveRef.current) return;   // erlaubte Navigation → durchlassen
      e.preventDefault();                   // Standard-Back/Swipe/Header-Back blocken
      Alert.alert(
        'Liegezeit läuft',
        'Die Liegezeit läuft weiter, auch wenn du die App verlässt. Möchtest du zur App zurückkehren oder die Fährte wirklich abbrechen?',
        [
          { text: 'Zurück', style: 'cancel' },   // Dialog schliessen, auf dem Screen bleiben
          { text: 'Weiterlaufen lassen', onPress: () => { allowLeaveRef.current = true; navigation.dispatch(e.data.action); } },
          { text: 'Fährte abbrechen', style: 'destructive', onPress: () => confirmCancel(e.data.action) },
        ],
      );
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['top']} className="flex-1">
        {/* Top-Bar */}
        <View className="flex-row items-center gap-3 px-[18px] pb-[10px]">
          <Pressable className="w-9 h-9 rounded-[11px] border border-ft-line-strong bg-white/5 items-center justify-center" onPress={() => router.replace('/track' as never)} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={FT.text} />
          </Pressable>
          <Text className="text-[15px] font-extrabold text-ft-text">{t('track.lyingTime')}</Text>
          {saveState === 'saving' && (
            <View className="flex-row items-center gap-1.5 ml-auto px-2.5 py-1 rounded-full bg-white/5 border border-ft-line">
              <Ionicons name="cloud-upload-outline" size={12} color={FT.muted} />
              <Text className="text-[10px] font-bold text-ft-muted">{t('track.saving')}</Text>
            </View>
          )}
          {saveState === 'error' && (
            <View className="flex-row items-center gap-1.5 ml-auto px-2.5 py-1 rounded-full bg-ft-bad/15 border border-ft-bad/40">
              <Ionicons name="warning-outline" size={12} color={FT.bad} />
              <Text className="text-[10px] font-bold text-ft-bad">{t('track.saveError')}</Text>
            </View>
          )}
        </View>

        {/* Timer in der Mitte */}
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-[150px] h-[150px] rounded-full items-center justify-center mb-7 border-2 border-[rgba(21,230,195,0.35)] bg-ft-acc-dim">
            <Ionicons name="hourglass-outline" size={30} color={FT.acc} />
          </View>
          <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1.4px] uppercase mb-1">{t('track.laidSince')}</Text>
          <Text className="text-[58px] leading-[62px] text-ft-text font-black" style={{ fontVariant: ['tabular-nums'] }}>{fmtAge(elapsedS)}</Text>
          <Text className="text-[13px] text-ft-muted font-semibold text-center mt-3 max-w-[280px]">
            {t('track.matureHint', { dog: dogName })}
          </Text>

          {/* Kennzahlen der gelegten Fährte */}
          <View className="flex-row gap-2 mt-7">
            {[
              { v: `${summary?.distanceM ?? 0} m`, l: t('track.distance') },
              { v: String(summary?.winkel ?? 0),   l: t('track.angle') },
              { v: String(summary?.objekte ?? 0),  l: t('track.objectsShort') },
            ].map((x, i) => (
              <View key={i} className="items-center px-5 py-3 rounded-[16px] bg-white/5 border border-ft-line">
                <Text className="text-[17px] font-black text-ft-text" style={{ fontVariant: ['tabular-nums'] }}>{x.v}</Text>
                <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{x.l}</Text>
              </View>
            ))}
          </View>

          {(summary?.materials.length ?? 0) > 0 && (
            <View className="mt-5 w-full max-w-[340px]">
              <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1.4px] uppercase mb-2 text-center">Materialien</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
              >
                {summary!.materials.map(item => (
                  <View key={item.index} className="min-w-[86px] px-3 py-2 rounded-[14px] bg-white/5 border border-ft-line">
                    <Text className="text-[10px] font-black text-ft-acc tracking-[1px] uppercase text-center">{`G${item.index}`}</Text>
                    <Text className="text-[12px] font-extrabold text-ft-text text-center mt-0.5" numberOfLines={1} adjustsFontSizeToFit>
                      {item.label}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {(summary?.segments.length ?? 0) > 0 && (
            <View className="mt-5 w-full max-w-[360px] rounded-[18px] p-4 bg-white/5 border border-ft-line">
              <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1.4px] uppercase mb-3 text-center">Teilstrecken</Text>
              <View className="gap-3">
                {summary!.segments.map((segment, index) => (
                  <View key={segment.id} className="flex-row items-start gap-3">
                    <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: TRACK_SEGMENT_COLORS[segment.type] }}>
                      <Text className="text-[10px] font-black text-[#04110F]">{index + 1}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[13px] font-extrabold text-ft-text">{segmentDisplayLabel(segment)}</Text>
                      <Text className="text-[11px] font-semibold text-ft-muted">
                        {actualSegmentSteps(segment)} Schritte · Beginn bei Schritt {segment.startStep}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <View className="flex-row flex-wrap gap-3 mt-4 pt-3 border-t border-ft-line">
                <View className="flex-row items-center gap-1.5">
                  <View className="w-3 h-1 rounded-full bg-ft-acc" />
                  <Text className="text-[10.5px] font-semibold text-ft-muted">normale Fährte</Text>
                </View>
                {Array.from(new Set(summary!.segments.map(s => s.type))).map(type => (
                  <View key={type} className="flex-row items-center gap-1.5">
                    <View className="w-3 h-1 rounded-full" style={{ backgroundColor: TRACK_SEGMENT_COLORS[type] }} />
                    <Text className="text-[10.5px] font-semibold text-ft-muted">{segmentDisplayLabel({ type })}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Absuche starten */}
        <View className="px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            className="h-[60px] rounded-[18px] flex-row items-center justify-center gap-2 bg-ft-acc"
            style={starting || startMs == null ? { opacity: 0.5 } : undefined}
            onPress={startSearch} disabled={starting || startMs == null}
          >
            <Ionicons name="play" size={18} color={FT.accText} />
            <Text className="text-[14px] font-extrabold text-ft-acc-text">{t('track.search')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
