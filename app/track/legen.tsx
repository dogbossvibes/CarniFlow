import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { hapticTap, hapticSuccess, hapticMarker, hapticAngle, hapticWarning } from '@/features/tracking/utils/haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { FT } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { useCapabilities } from '@/hooks/useCapabilities';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { useTrackRecorder } from '@/features/tracking/hooks/useTrackRecorder';
import { BackgroundLocationDisclosure } from '@/features/tracking/components/BackgroundLocationDisclosure';
import { useAutoDetectSetting } from '@/hooks/useAutoDetectSetting';
import { useStepLengthSetting } from '@/hooks/useStepLengthSetting';
import { useVolumeKeyArticleSetting } from '@/hooks/useVolumeKeyArticleSetting';
import { subscribeQuickAddArticle } from '@/features/tracking/quickAddArticleBus';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { reopenTarget, type ActiveFaehrte } from '@/features/tracking/store/activeFaehrtenModel';
import { clearPending } from '@/features/tracking/store/trackPersist';
import { createTrackSession } from '@/features/tracking/services/trackService';
import * as Crypto from 'expo-crypto';
import { claimNewbieQuota, quotaBlock } from '@/services/quotaService';
import { handleQuotaBlock } from '@/features/subscription/quotaUx';
import { fetchCurrentWeather, type CurrentWeather } from '@/services/weatherService';
import { ANGLE_LABEL } from '@/features/tracking/utils/angleClassify';
import { metersToSteps } from '@/features/tracking/utils/steps';
import { PrecisionDebugPanel } from '@/features/tracking/components/PrecisionDebugPanel';
import type { GpsStats } from '@/features/tracking/engine/types';
import { useToast } from '@/components/ui/Toast';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { HelpButton } from '@/components/help/HelpButton';
import type { AngleKind, MarkerMaterial } from '@/features/tracking/store/trackingStore';
import type { TrackSegmentType } from '@/features/tracking/utils/trackSegments';
import {
  TRACK_SEGMENT_TYPES,
  activeOrPlannedSegment,
  createActiveSegment,
  finalizeSegment,
  normalizeCustomSegmentLabel,
  segmentDisplayLabel,
} from '@/features/tracking/utils/trackSegments';
import { getTrackQuickPickerLayout } from '@/features/tracking/utils/quickPickerLayout';

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

const QUICK_PICKER_PANEL_STYLE = {
  backgroundColor: FT.surface2,
  borderColor:     FT.lineStrong,
  borderWidth:     1,
  borderRadius:    18,
  padding:         10,
  zIndex:          20,
  elevation:       8,
} satisfies ViewStyle;

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
const SEGMENT_ICONS: Record<TrackSegmentType, MatIcon> = {
  no_food: 'remove-circle-outline',
  low_food: 'leaf-outline',
  intensive_food: 'nutrition-outline',
  distraction: 'shuffle-outline',
  surface_change: 'layers-outline',
  custom: 'create-outline',
};

function speakTrackSegment(text: string) {
  try {
    Speech.stop();
    Speech.speak(text, { language: 'de-CH', pitch: 1.0, rate: 0.95 });
  } catch { /* best-effort */ }
}

function localizedSegmentLabel(type: TrackSegmentType, t: (key: TranslationKey) => string): string {
  switch (type) {
    case 'no_food': return t('track.segmentNoFood');
    case 'low_food': return t('track.segmentLowFood');
    case 'intensive_food': return t('track.segmentIntensiveFood');
    case 'distraction': return t('track.segmentDistraction');
    case 'surface_change': return t('track.segmentSurfaceChange');
    case 'custom': return t('track.segmentCustom');
  }
}

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
  const { t } = useT();
  const insets = useSafeAreaInsets();   // sichere Abstände (Dynamic Island / Statusbar)
  const { height: windowHeight } = useWindowDimensions();
  useKeepAwake();   // Display während des Legens anlassen (Bildschirm nicht sperren)
  const params = useLocalSearchParams<{ dogId?: string }>();
  const { session } = useSession();
  const { dogs } = useDogs();
  const { isPro, loading: capLoading } = useCapabilities();
  const { showToast, toast } = useToast();

  // NEWBIE (Nicht-Pro) hat keine Fährtenfunktion mehr: Aufnahme-Screen sperren und
  // auf die bestehende Upgrade-Ansicht (Active) leiten. Nutzt das bestehende isPro-Gate.
  useEffect(() => {
    if (!capLoading && !isPro) router.replace('/premium' as never);
  }, [capLoading, isPro, router]);

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
  const [gsPicker, setGsPicker] = useState(false);   // Gegenstand-Schnellauswahl (Inline, kein Sheet)
  const [winkelSheet, setWinkelSheet] = useState(false);       // Winkeltyp wählen (GW/OW/BW/Abriss)
  const [segmentSheet, setSegmentSheet] = useState(false);
  const [segmentType, setSegmentType] = useState<TrackSegmentType>('no_food');
  const [segmentCustomLabel, setSegmentCustomLabel] = useState('');
  const segmentLabel = useCallback((type: TrackSegmentType) => localizedSegmentLabel(type, t), [t]);
  const [segmentVoiceEnabled, setSegmentVoiceEnabled] = useState(true);
  const [selectedDogId, setSelectedDogId] = useState<string | null>((params.dogId as string) ?? null);
  const beganRef = useRef(false);
  const trackClaimRef = useRef<string | null>(null);   // stabile Fährten-ID für den idempotenten NEWBIE-Quota-Claim
  const [showBgDisclosure, setShowBgDisclosure] = useState(false);   // Play-Disclosure VOR Aufnahmestart
  const [startAfterClose, setStartAfterClose] = useState(false);     // begin() erst NACH Schliessen des Dialogs
  const warmupStartedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const stoppingRef = useRef(false);   // Doppelklick-Guard für „Stoppen"

  // Automatisch erkannter Winkel (rechts/links/spitz) → Haptik + Hinweis.
  // Der Marker wird im Recorder direkt am Scheitel gesetzt.
  const onAngle = useCallback((kind: AngleKind) => {
    setLastAngle(kind);
    // Automatisch erkannt → gedrosselt: Abriss als Warnung, sonst Winkel-Impuls.
    if (kind === 'abriss') hapticWarning(); else hapticAngle();
    showToast(`${ANGLE_LABEL[kind]} erkannt`);
  }, [showToast]);

  const { autoDetect, setAutoDetect } = useAutoDetectSetting();
  const { stepLengthM } = useStepLengthSetting();   // optionale persönliche Schrittlänge (Default 0,75 m)
  const { enabled: volumeKeyArticle } = useVolumeKeyArticleSetting();
  const rec = useTrackRecorder({ onAngle, autoDetect });

  // Zuletzt gewähltes Gegenstand-Material → Default für den Schnell-Gegenstand.
  const lastMaterialRef = useRef<MarkerMaterial>('diverses');

  // Gegenstand mit gewähltem Material setzen. Erst, wenn der Startanker steht —
  // sonst würde er im Warmup-Drift landen (kein Crash, nur Hinweis).
  const placeGegenstand = useCallback((material: MarkerMaterial) => {
    setGsPicker(false);
    const st = useTrackingStore.getState();
    // Ohne Startanker UND valide aktuelle Position kein (koordinatenloser) Gegenstand.
    if (!st.startAnchor || !st.currentPosition) { showToast(t('toast.startPointWait')); return; }
    hapticMarker();                 // sofort, VOR dem Speichern
    lastMaterialRef.current = material;
    void rec.addMarker('gegenstand', { material });
  }, [rec, showToast, t]);

  // Schnell-Gegenstand (Hardware-Taste / Kurzbefehl): ohne Material-Auswahl, am
  // zuletzt gewählten Material. Nur während laufender Aufnahme.
  const quickAddArticle = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    if (!useTrackingStore.getState().startAnchor) { showToast(t('toast.startPointWait')); return; }
    hapticMarker();                 // sofort, VOR dem Speichern
    void rec.addMarker('gegenstand', { material: lastMaterialRef.current });
    showToast(t('toast.objectSet'));
  }, [rec, showToast, t]);

  // Manuell einen Fachwinkel (GW/OW/BW) ODER Abriss an der aktuellen Position setzen.
  // Nutzt dieselbe currentPosition/positionSource wie die Aufnahme (keine extra GPS-Abfrage).
  const placeWinkel = useCallback((angleKind: AngleKind) => {
    if (phaseRef.current !== 'recording') return;
    const st = useTrackingStore.getState();
    // Fachliche Annahme ZUERST: ohne Startanker UND ohne valide aktuelle Position
    // wird KEIN (koordinatenloser) Marker gesetzt und KEIN Erfolg gemeldet.
    if (!st.startAnchor || !st.currentPosition) { showToast(t('toast.startPointWait')); return; }
    // addMarker fügt den Marker (mit currentPosition) SYNCHRON in den Store ein
    // (commitMarker → s.addMarker vor dem ersten await) → Karte reagiert sofort.
    void rec.addMarker('winkel', { angleKind });
    if (angleKind === 'abriss') hapticWarning(); else hapticAngle();   // Feedback nach der Annahme
    showToast(`${ANGLE_LABEL[angleKind]} gesetzt`);
    setWinkelSheet(false);
  }, [rec, showToast, t]);

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
  const conflictShownRef = useRef(false);
  const quickPickerLayout = getTrackQuickPickerLayout({
    windowHeight,
    safeAreaTop: insets.top,
    safeAreaBottom: insets.bottom,
  });

  // Regel 4: pro Hund max. EINE aktive Fährte. Der eigentliche Aufnahmestart
  // (Disclosure → begin). Ausgelagert, da ihn sowohl der normale Pfad als auch
  // „Fährte abbrechen" im Konflikt-Dialog aufrufen.
  const proceedToStart = useCallback(() => { hapticTap(); setShowBgDisclosure(true); }, []);

  // Konflikt-Dialog: eine aktive Fährte dieses Hundes existiert bereits.
  const showConflict = useCallback((dId: string, entry: ActiveFaehrte) => {
    Alert.alert(
      'Aktive Fährte vorhanden',
      'Für diesen Hund existiert bereits eine aktive Fährte. Was möchtest du tun?',
      [
        { text: 'Fährte fortsetzen', onPress: () => router.replace(reopenTarget(entry) as never) },
        { text: 'Fährte abbrechen', style: 'destructive', onPress: () => {
            // Bestehende Fährte DIESES Hundes verwerfen (keine Fremdfährte berühren).
            useActiveFaehrten.getState().remove(dId);
            void clearPending(dId);
            if (useTrackingStore.getState().dogId === dId) useTrackingStore.getState().setSessionStatus('cancelled');
            proceedToStart();   // erst danach darf eine neue Fährte entstehen
          } },
        { text: 'Abbrechen', style: 'cancel' },
      ],
    );
  }, [router, proceedToStart]);

  // Start-Taste: erst prüfen, ob der gewählte Hund bereits eine aktive Fährte hat.
  const handleStartPress = useCallback(() => {
    const dId = activeDog?.id ?? null;
    const entry = dId ? useActiveFaehrten.getState().get(dId) : null;
    if (dId && entry) { showConflict(dId, entry); return; }   // KEINE zweite Fährte
    proceedToStart();
  }, [activeDog?.id, showConflict, proceedToStart]);

  // Beim Betreten mit einem Hund, der bereits eine aktive Fährte hat, sofort den
  // Dialog zeigen (einmalig) — statt still eine zweite Aufnahme vorzubereiten.
  useEffect(() => {
    const dId = (params.dogId as string) ?? null;
    if (!dId || conflictShownRef.current) return;
    const entry = useActiveFaehrten.getState().get(dId);
    if (entry) { conflictShownRef.current = true; showConflict(dId, entry); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    trackPoints, markers, currentPosition, heading, gpsAccuracy,
    distanceMeters, durationSeconds, isPaused, mapFollowMode, setMapFollowMode,
    startAnchor, startLockActive, startDriftRejectedCount, segments,
  } = useTrackingStore();
  const activeSegment = activeOrPlannedSegment(segments);
  const currentStep = metersToSteps(distanceMeters, stepLengthM);

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

  // Aufnahme scharf schalten — wird ERST nach Bestätigung der Hintergrundstandort-
  // Disclosure („Weiter") aufgerufen. Vorher startet weder GPS-Aufnahme noch Timer.
  // LOKAL ZUERST: die Aufnahme darf NIE an Login/Netz hängen. Erst sofort recorden
  // (Timer + Linie laufen), dann die Remote-Session best-effort im Hintergrund
  // anlegen und ihre ID nachreichen.
  const begin = useCallback(async () => {
    if (beganRef.current) return;
    beganRef.current = true;
    hapticSuccess();   // SOFORT beim Start-Tap — vor jedem await/GPS/Netz

    // NEWBIE-Quota: max. 1 neue Fährte/Kalendermonat. Claim VOR dem Recorder-Start.
    // Idempotent auf trackClaimRef → ein Retry nach Fehler (beganRef zurückgesetzt)
    // verbraucht KEIN zweites Kontingent; der erlaubte Start darf die Fährte komplett
    // abschließen (kein zweiter Check im weiteren Verlauf). Premium überspringt.
    if (!isPro) {
      if (!trackClaimRef.current) trackClaimRef.current = Crypto.randomUUID();
      const block = quotaBlock((await claimNewbieQuota('track', trackClaimRef.current)).status);
      if (block) {
        beganRef.current = false;
        hapticWarning();
        handleQuotaBlock(block, 'track', t, () => router.push('/premium' as never));
        return;
      }
    }

    // Führende Session-ID SOFORT (kein Warten auf Supabase, kein getUser). Dieselbe UUID
    // wird später deterministisch als training_sessions.id verwendet (idempotenter Sync).
    const uid = session?.user?.id;
    const clientUuid = Crypto.randomUUID();
    sessionIdRef.current = null;   // Remote-ID erst nach erfolgreichem Insert (unten)
    const r = await rec.beginRecording({
      localId: clientUuid,
      ownerId: uid,
      dogId:   activeDog?.id ?? null,
      meta: {
        surfaceTypes:      [surface],
        terrainConditions: condition ? [condition] : [],
        temperature:       weather?.temperature ?? null,
        weatherCondition:  weather?.weatherCondition ?? null,
        windSpeed:         weather?.windSpeed ?? null,
        humidity:          weather?.humidity ?? null,
        latitude:          currentPosition?.lat ?? null,
        longitude:         currentPosition?.lng ?? null,
      },
    });   // sofort scharf (recording=true, Timer); lokale Session ist angelegt
    if (r.error) { beganRef.current = false; showToast(r.error); return; }
    setPhase('recording');
    showToast(t('toast.trackRunning'));

    // Registry: Fährte gehört ab jetzt dem Hund (dog_id) — bleibt bei Navigation/
    // Hundewechsel erhalten. Sofort persistiert, damit ein Kill nichts verliert.
    // Wetter-Snapshot + Start-Uhrzeit + GPS werden EINMALIG hier festgehalten.
    if (activeDog) {
      const snap = weather
        ? { temperature: weather.temperature, windSpeed: weather.windSpeed, humidity: weather.humidity, condition: weather.weatherCondition }
        : null;
      useActiveFaehrten.getState().upsert(activeDog.id, {
        status: 'laying', sessionId: null, startedAt: Date.now(),
        gpsAccuracy: useTrackingStore.getState().gpsAccuracy, weather: snap,
      });
    }

    // Remote-Session im Hintergrund (blockiert die Aufnahme nicht). Dieselbe clientUuid
    // als training_sessions.id → deterministisch, keine Duplikate beim späteren Sync.
    if (uid && activeDog) {
      createTrackSession(uid, {
        id: clientUuid,
        dogId: activeDog.id, surfaceTypes: [surface], terrainConditions: condition ? [condition] : [],
        lyingTimeMinutes: 0, notes: null, locationName: null,
        temperature:      weather?.temperature ?? null,
        weatherCondition: weather?.weatherCondition ?? null,
        windSpeed:        weather?.windSpeed ?? null,
        humidity:         weather?.humidity ?? null,
        latitude: currentPosition?.lat ?? null, longitude: currentPosition?.lng ?? null,
        distraction: false,
      }).then(({ data, error }) => {
        if (!error && data) {
          sessionIdRef.current = data.id;
          useTrackingStore.getState().setCurrentSession(data.id);
          useActiveFaehrten.getState().upsert(activeDog.id, { sessionId: data.id });   // ID nachreichen
        }
        else showToast(t('toast.offlineSync'));
      }).catch(() => showToast(t('toast.offlineSync')));
    }
  }, [session, activeDog, rec, showToast, t, surface, condition, weather, currentPosition, isPro, router]);

  // Aufnahme erst starten, NACHDEM der Disclosure-Dialog geschlossen ist:
  // „Weiter" setzt startAfterClose + schliesst den Dialog (showBgDisclosure=false).
  // Dieser Effect feuert im Render NACH dem Schliessen → dann erst begin().
  // Kein künstliches Delay; begin() awaitet intern die Berechtigung vor GPS/Timer.
  useEffect(() => {
    if (startAfterClose && !showBgDisclosure) {
      setStartAfterClose(false);
      void begin();
    }
  }, [startAfterClose, showBgDisclosure, begin]);

  useEffect(() => () => { rec.stopAll(); }, [rec.stopAll]);

  // Wetter-Snapshot nachreichen, falls er erst NACH dem Start eintrifft (einmalig
  // je Aufnahme — Registry-Merge überschreibt nur das Wetterfeld).
  useEffect(() => {
    if (phase !== 'recording' || !activeDog || !weather) return;
    useActiveFaehrten.getState().upsert(activeDog.id, {
      weather: { temperature: weather.temperature, windSpeed: weather.windSpeed, humidity: weather.humidity, condition: weather.weatherCondition },
    });
  }, [phase, activeDog, weather]);

  // GPS-Genauigkeit + Strecke gedrosselt (4 s) in die Registry spiegeln, damit die
  // Dog-Hub-/Logbuch-Karte während der Aufnahme aktuelle Werte zeigt. Nur vorhandene
  // Daten aus dem Store — keine neue GPS-Engine.
  useEffect(() => {
    if (phase !== 'recording' || !activeDog) return;
    const iv = setInterval(() => {
      const st = useTrackingStore.getState();
      useActiveFaehrten.getState().upsert(activeDog.id, {
        gpsAccuracy: st.gpsAccuracy, distanceMeters: Math.round(st.distanceMeters),
      });
    }, 4000);
    return () => clearInterval(iv);
  }, [phase, activeDog]);

  const mapMarkers: MapMarker[] = markers.map(mk => ({ id: mk.id, type: mk.type, lat: mk.lat, lng: mk.lng, angleKind: mk.angleKind, material: mk.material }));
  const gegenstaende = markers.filter(mk => mk.type === 'gegenstand').length;
  const winkel = markers.filter(mk => mk.type === 'winkel').length;
  // Echte Positionen für die Skizze (deckt sich mit der Aufnahme).
  const angleMarkers = markers.filter(mk => mk.type === 'winkel' && mk.lat != null && mk.lng != null).map(mk => ({ lat: mk.lat as number, lng: mk.lng as number }));
  const objectMarkers = markers.filter(mk => mk.type === 'gegenstand' && mk.lat != null && mk.lng != null).map(mk => ({ lat: mk.lat as number, lng: mk.lng as number }));

  // TS starten: SOFORT scharf am aktuellen TrackPoint (keine Vorab-Schrittzahl).
  const startTrackSegment = useCallback(() => {
    if (phaseRef.current !== 'recording' || !activeDog) return;
    const st = useTrackingStore.getState();
    if (activeOrPlannedSegment(st.segments)) return;   // nur EINE aktive Teilstrecke
    const label = normalizeCustomSegmentLabel(segmentCustomLabel);
    if (segmentType === 'custom' && !label) { showToast(t('track.segmentCustomRequired')); return; }
    const idx = st.trackPoints.length - 1;
    // Kein gültiger TrackPoint / keine Position → kein Segment, kein Erfolgsfeedback.
    if (idx < 0 || !st.currentPosition) { showToast(t('toast.startPointWait')); return; }
    const segment = createActiveSegment({
      dogId: activeDog.id,
      trackSessionId: sessionIdRef.current,
      type: segmentType,
      customLabel: label,
      currentStep: metersToSteps(st.distanceMeters, stepLengthM),   // abgeleitet aus realer Distanz
      startTrackPointIndex: idx,
      startCoordinate: st.currentPosition,
      voiceEnabled: segmentVoiceEnabled,
    });
    st.addSegment(segment);
    setSegmentSheet(false);
    hapticSuccess();
    if (segment.voiceEnabled) speakTrackSegment(t('track.segmentStarted'));
  }, [activeDog, segmentCustomLabel, segmentType, segmentVoiceEnabled, showToast, t, stepLengthM]);

  // TS stoppen: aktuellen TrackPoint als Ende; plannedLengthSteps = tatsächliche Länge.
  const stopTrackSegment = useCallback(() => {
    const st = useTrackingStore.getState();
    const segment = activeOrPlannedSegment(st.segments);
    if (!segment) return;   // keine aktive Teilstrecke → kein Erfolgsfeedback
    const done = finalizeSegment(segment, {
      currentStep: metersToSteps(st.distanceMeters, stepLengthM),
      endTrackPointIndex: Math.max(0, st.trackPoints.length - 1),
      endCoordinate: st.currentPosition,
    });
    st.updateSegment(segment.id, done);
    hapticSuccess();
    if (segment.voiceEnabled) speakTrackSegment(t('track.segmentEnded'));
  }, [stepLengthM, t]);

  // TS-Button = Start/Stop-Toggle. Ohne aktive TS → schlankes Sheet (Typ/Voice) → Start;
  // mit aktiver TS stoppt der Tap sofort.
  const handleTsToggle = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    if (activeOrPlannedSegment(useTrackingStore.getState().segments)) { stopTrackSegment(); return; }
    hapticTap();
    setSegmentSheet(true);
  }, [stopTrackSegment]);

  const cancelActiveSegment = useCallback(() => {
    const st = useTrackingStore.getState();
    const segment = activeOrPlannedSegment(st.segments);
    if (!segment) return;
    st.updateSegment(segment.id, { status: 'cancelled', completedAt: Date.now() });
    hapticWarning();
  }, []);

  const onStop = () => {
    if (stoppingRef.current) return;   // Doppelklick abfangen
    stoppingRef.current = true;
    // Phase 12.12: eine noch aktive Teilstrecke am letzten gültigen TrackPoint
    // sauber abschliessen — kein offenes active-Segment in einer fertigen Fährte.
    {
      const st = useTrackingStore.getState();
      const active = activeOrPlannedSegment(st.segments);
      if (active) {
        st.updateSegment(active.id, finalizeSegment(active, {
          currentStep: metersToSteps(st.distanceMeters, stepLengthM),
          endTrackPointIndex: Math.max(0, st.trackPoints.length - 1),
          endCoordinate: st.currentPosition,
        }));
      }
    }
    hapticSuccess();   // SOFORT beim Stop-Tap
    const id = sessionIdRef.current;
    // rec.finish stoppt synchron, startet die Liegezeit und speichert im
    // HINTERGRUND (saveState). Wir navigieren SOFORT — kein await, keine 2–5 s.
    rec.finish(id);   // toleriert null (offline → nur lokal gesichert)

    // Registry: Übergang laying → resting. Liegezeit-Start = jetzt (deckt sich mit
    // dem Store-Übergang in setLayFinishedAt). Kennzahlen für die Karten mitgeben.
    if (activeDog) {
      useActiveFaehrten.getState().upsert(activeDog.id, {
        status: 'resting', sessionId: id, layStartedAt: Date.now(),
        distanceMeters: Math.round(distanceMeters), winkelCount: winkel, objektCount: gegenstaende,
      });
    }
    const dq = activeDog ? `&dogId=${activeDog.id}` : '';
    if (id) {
      router.replace(`/track/liegen?id=${id}${dq}` as never);   // → Wartephase (Liegezeit) → Ausarbeiten
    } else {
      // Offline: noch keine Session-ID, aber die Fährte gehört dem Hund → Liegen mit dogId.
      if (activeDog) router.replace(`/track/liegen?dogId=${activeDog.id}` as never);
      else {
        showToast(t('toast.localSaved'));
        if (router.canGoBack()) router.back();
        else router.replace('/track' as never);
      }
    }
  };

  // GPS ab >45 m warnen — dann landen keine Linienpunkte (Filter), Distanz bleibt 0.
  const gpsPoor = gpsAccuracy != null && gpsAccuracy > 45;
  const metrics: { value: string; label: string; warn?: boolean }[] = [
    { value: `${Math.round(distanceMeters)} m`, label: `≈ ${metersToSteps(distanceMeters, stepLengthM)} ${t('track.stepsShort')}` },
    { value: String(gegenstaende), label: t('track.objectsShort') },
    { value: String(winkel), label: t('track.angle') },
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

  // Fährtenaufnahme ist Pro-only — Nicht-Pro sieht die Aufnahme-UI nie (Redirect oben).
  if (!capLoading && !isPro) return null;

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['bottom']} className="flex-1">
        {/* Top-Bar: Zurück · LIVE · Karte/Skizze — explizit unter Dynamic Island/Statusbar. */}
        <View className="flex-row items-center gap-3 px-[18px] pb-3" style={{ paddingTop: insets.top + 8 }}>
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
              <Text className="text-[12px] font-extrabold tracking-[1.4px] text-[#ff9aa2]">{t('track.liveLive')}</Text>
            </View>
          )}
          <View className="flex-1" />
          <HelpButton topicId="track_laying" autoShow tint={FT.text} />
          <View className="flex-row bg-white/10 rounded-[12px] p-[3px] gap-[2px]">
            {(['map', 'sketch'] as const).map(k => {
              const on = view === k;
              return (
                <Pressable key={k} onPress={() => setView(k)} className={`px-[12px] py-1.5 rounded-lg ${on ? 'bg-ft-acc' : ''}`}>
                  <Text className={`text-[12px] font-extrabold ${on ? 'text-ft-acc-text' : 'text-white/80'}`}>
                    {k === 'map' ? t('track.viewMap') : t('track.viewSketch')}
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
              segments={segments}
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
            <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{t('track.runtime')}</Text>
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
                <Text className="text-[11px] font-bold text-ft-text">{t('track.startPointSetting')}</Text>
              </View>
            </View>
          )}

          {phase === 'recording' && activeSegment && (
            <View className="absolute left-[14px] right-[14px] bottom-[88px] rounded-[18px] p-3 bg-ft-glass border border-ft-glass-line">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.2px] uppercase">{t('track.segmentActive')}</Text>
                  <Text className="text-[15px] text-ft-text font-black mt-0.5">{activeSegment.type === 'custom' ? segmentDisplayLabel(activeSegment) : segmentLabel(activeSegment.type)}</Text>
                  <Text className="text-[12px] text-ft-muted font-semibold mt-1">
                    {t('track.segmentSince', { steps: Math.max(0, currentStep - activeSegment.startStep) })}
                  </Text>
                </View>
                <View className="items-end gap-2">
                  <Text className="text-[12px] text-ft-acc font-extrabold" style={{ fontVariant: ['tabular-nums'] }}>
≈ +{Math.max(0, currentStep - activeSegment.startStep)} {t('track.stepsShort')}
                  </Text>
                  <View className="flex-row gap-2">
                    <Pressable
                      accessibilityLabel={t('track.segmentStop')}
                      accessibilityHint={t('track.segmentStopHint')}
                      onPress={stopTrackSegment}
                      className="px-3 py-2 rounded-[10px] bg-ft-acc"
                    >
                      <Text className="text-[11px] font-black text-ft-acc-text">{t('common.stop')}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={t('track.segmentCancel')}
                      accessibilityHint={t('track.segmentCancelHint')}
                      onPress={cancelActiveSegment}
                      className="px-3 py-2 rounded-[10px] bg-white/10 border border-ft-line"
                    >
                      <Text className="text-[11px] font-black text-ft-text">{t('common.cancel')}</Text>
                    </Pressable>
                  </View>
                </View>
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
                    {gpsReady ? t('track.gpsReady') : t('track.gpsStabilizing')}
                  </Text>
                  <Text className="text-[14px] font-semibold mb-2" style={{ color: gpsReady ? FT.acc : FT.muted }}>
                    {gpsAccuracy != null ? `±${Math.round(gpsAccuracy)} m` : t('track.searchSatellites')}
                  </Text>

                  {/* Hund */}
                  {dogs.length > 0 && (
                    <>
                      <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">{t('track.dog')}</Text>
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
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">{t('track.surface')}</Text>
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
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">{t('track.condition')}</Text>
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
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">{t('track.angleDetection')}</Text>
                  <View className="flex-row gap-2 self-stretch">
                    {([['auto', t('track.auto'), 'flash'], ['manual', t('track.manual'), 'hand-left']] as const).map(([val, label, icon]) => {
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
                      ? t('track.autoHint')
                      : t('track.manualHint')}
                  </Text>

                  {/* Wetter — echt & automatisch zur GPS-Position (Open-Meteo), nicht eingetippt */}
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">{t('track.weather')}</Text>
                  <View className="self-stretch rounded-[14px] px-4 py-3 bg-white/5 border border-ft-line">
                    {weatherState === 'loading' ? (
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color={FT.muted} />
                        <Text className="text-[13px] font-semibold text-ft-muted">{t('track.weatherLoading')}</Text>
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
                      <Text className="text-[13px] font-semibold text-ft-muted">{t('track.weatherUnavailable')}</Text>
                    )}
                  </View>

                  {/* Start (frei ab GPS bereit; nach 15 s manuell trotz Ungenauigkeit) */}
                  <Pressable
                    className={`flex-row items-center justify-center gap-2 mt-4 rounded-[16px] px-[20px] py-3 self-stretch ${canStart ? 'bg-ft-acc' : 'bg-white/10'}`}
                    onPress={() => { if (canStart) handleStartPress(); }}
                    disabled={!canStart}
                  >
                    <Ionicons name="play" size={16} color={canStart ? FT.accText : FT.muted} />
                    <Text className={`text-[14px] font-extrabold ${canStart ? 'text-ft-acc-text' : 'text-ft-muted'}`}>
                      {canStart ? t('track.lay') : t('track.waitingGps')}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* Gegenstand-Schnellauswahl: Inline-Popover über der Steuerleiste (kein
            Sheet). Tap auf Typ setzt sofort + schliesst; Backdrop-Tap schliesst
            ohne Marker. Dübel als roter Mini-Zylinder erkennbar. */}
        {gsPicker && phase === 'recording' && (
          <>
            <Pressable accessibilityLabel={t('track.closeObjectPicker')} className="absolute inset-0" onPress={() => setGsPicker(false)} />
            <View
              style={{
                ...QUICK_PICKER_PANEL_STYLE,
                position: 'absolute',
                left: 14,
                right: 14,
                bottom: quickPickerLayout.bottomOffset,
                maxHeight: quickPickerLayout.maxHeight,
              }}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
              >
                {GEGENSTAND_MATERIALS.map(m => (
                  <Pressable
                    key={m.material}
                    accessibilityLabel={t('track.setObject', { label: m.label })}
                    onPress={() => placeGegenstand(m.material)}
                    style={{ width: '23%', flexGrow: 1 }}
                    className="h-[58px] rounded-[14px] items-center justify-center gap-[3px] bg-ft-glass border border-ft-glass-line"
                  >
                    {m.material === 'duebel' ? (
                      <View style={{ width: 12, height: 17, borderRadius: 4, backgroundColor: FT.bad, borderWidth: 1, borderColor: '#3a0000', alignItems: 'center' }}>
                        <View style={{ width: 12, height: 5, borderRadius: 3, backgroundColor: '#ff8a94', borderWidth: 1, borderColor: '#3a0000', marginTop: -1 }} />
                      </View>
                    ) : (
                      <Ionicons name={m.icon} size={20} color={FT.acc} />
                    )}
                    <Text numberOfLines={1} className="text-[10px] font-extrabold text-ft-text">{m.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {/* Winkel-Schnellwahl: Inline-Popover direkt über dem Winkel-Button — KEIN
            BottomSheet. Tap auf GW/OW/BW/Abriss setzt sofort + schliesst; Tap
            außerhalb (Backdrop) schliesst ohne Marker. */}
        {winkelSheet && phase === 'recording' && (
          <>
            <Pressable
              accessibilityLabel={t('track.closeAnglePicker')}
              className="absolute inset-0"
              onPress={() => setWinkelSheet(false)}
            />
            <View
              style={{
                ...QUICK_PICKER_PANEL_STYLE,
                position: 'absolute',
                left: 14,
                right: 14,
                bottom: quickPickerLayout.bottomOffset,
                maxHeight: quickPickerLayout.maxHeight,
              }}
            >
              <View className="flex-row gap-2">
                {([
                  { kind: 'gw',     short: 'GW',     icon: 'square-outline'   },
                  { kind: 'ow',     short: 'OW',     icon: 'triangle-outline' },
                  { kind: 'bw',     short: 'BW',     icon: 'ellipse-outline'  },
                  { kind: 'abriss', short: 'Abriss', icon: 'close'            },
                ] as const).map(o => (
                  <Pressable
                    key={o.kind}
                    accessibilityLabel={t('track.setAngle', { label: ANGLE_LABEL[o.kind] })}
                    onPress={() => placeWinkel(o.kind)}
                    className="flex-1 h-[64px] rounded-[16px] items-center justify-center gap-[3px] bg-ft-glass border border-ft-glass-line"
                  >
                    <Ionicons name={o.icon} size={22} color={o.kind === 'abriss' ? FT.warn : FT.acc} />
                    <Text numberOfLines={1} className="text-[10.5px] font-extrabold text-ft-text">{o.short}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Steuerung */}
        <View className="flex-row gap-3 px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            accessibilityLabel={activeSegment ? t('track.segmentStop') : t('track.segmentStart')}
            accessibilityHint={t('track.segmentStopHint')}
            className={`flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] border ${activeSegment ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line-strong'}`}
            onPress={handleTsToggle} disabled={phase !== 'recording'}
          >
            <Ionicons name={activeSegment ? 'stop-circle-outline' : 'trail-sign-outline'} size={20} color={activeSegment ? FT.acc : FT.text} />
            <Text numberOfLines={1} className={`text-[10.5px] font-extrabold ${activeSegment ? 'text-ft-acc' : 'text-ft-text'}`}>TS</Text>
          </Pressable>
          <Pressable
            className={`flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] border ${gsPicker ? 'bg-ft-acc border-ft-acc' : 'bg-white/5 border-ft-line-strong'}`}
            accessibilityLabel={t('track.setObjectButton')}
            onPress={() => { hapticTap(); setWinkelSheet(false); setGsPicker(v => !v); }} disabled={phase !== 'recording'}
          >
            <Ionicons name="cube-outline" size={20} color={gsPicker ? FT.accText : FT.text} />
            <Text numberOfLines={1} className={`text-[10.5px] font-extrabold ${gsPicker ? 'text-ft-acc-text' : 'text-ft-text'}`}>GS</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('track.setAngleButton')}
            accessibilityHint={t('track.setAngleHint')}
            className={`flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] border ${winkelSheet ? 'bg-ft-acc border-ft-acc' : 'bg-white/5 border-ft-line-strong'}`}
            onPress={() => { hapticTap(); setGsPicker(false); setWinkelSheet(v => !v); }} disabled={phase !== 'recording'}
          >
            <Ionicons name="git-branch-outline" size={20} color={winkelSheet ? FT.accText : FT.text} />
            <Text numberOfLines={1} className={`text-[10.5px] font-extrabold ${winkelSheet ? 'text-ft-acc-text' : 'text-ft-text'}`}>{t('track.angle')}</Text>
          </Pressable>
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            onPress={() => { hapticTap(); if (isPaused) rec.resume(); else rec.pause(); }} disabled={phase !== 'recording'}
          >
            <Ionicons name={isPaused ? 'play' : 'pause'} size={20} color={FT.text} />
            <Text numberOfLines={1} className="text-[10.5px] font-extrabold text-ft-text">{isPaused ? t('track.resume') : t('track.pause')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('common.stop')}
            accessibilityHint={t('track.stopLayingHint')}
            className="h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-ft-bad"
            style={{ flex: 1.3 }} onPress={onStop} disabled={phase !== 'recording'}
          >
            <Ionicons name="stop" size={20} color="#2a060a" />
            <Text numberOfLines={1} className="text-[10.5px] font-extrabold text-[#2a060a]">{t('common.stop')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <AnyvoBottomSheet visible={segmentSheet} onClose={() => setSegmentSheet(false)} title={t('track.segmentStart')}>
        <View className="gap-4 pb-2">
          <View className="flex-row flex-wrap gap-[10px]">
            {TRACK_SEGMENT_TYPES.map(type => {
              const on = segmentType === type;
              return (
                <Pressable
                  key={type}
                  accessibilityLabel={`${segmentLabel(type)} ${t('common.select').toLowerCase()}`}
                  onPress={() => setSegmentType(type)}
                  style={{ width: '47%', flexGrow: 1 }}
                  className={`flex-row items-center gap-2 px-3 py-3 rounded-[14px] border ${on ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line-strong'}`}
                >
                  <Ionicons name={SEGMENT_ICONS[type]} size={18} color={on ? FT.acc : FT.muted} />
                  <Text className={`text-[12.5px] font-bold ${on ? 'text-ft-acc' : 'text-ft-text'}`}>{segmentLabel(type)}</Text>
                </Pressable>
              );
            })}
          </View>

          {segmentType === 'custom' && (
            <TextInput
              accessibilityLabel={t('track.segmentCustomLabel')}
              accessibilityHint={t('track.segmentCustomHint')}
              value={segmentCustomLabel}
              onChangeText={setSegmentCustomLabel}
              maxLength={40}
              placeholder={t('track.segmentLabel')}
              placeholderTextColor={FT.faint}
              className="rounded-[14px] px-4 py-3 bg-white/5 border border-ft-line-strong text-ft-text font-semibold"
            />
          )}

          <Pressable
            accessibilityLabel={t('track.segmentVoiceToggleLabel')}
            accessibilityHint={t('track.segmentVoiceToggleHint')}
            onPress={() => setSegmentVoiceEnabled(v => !v)}
            className="flex-row items-center justify-between rounded-[16px] px-4 py-3 bg-white/5 border border-ft-line-strong"
          >
            <Text className="text-[13px] text-ft-text font-bold">{t('track.segmentVoiceToggle')}</Text>
            <View className={`w-12 h-7 rounded-full p-1 ${segmentVoiceEnabled ? 'bg-ft-acc' : 'bg-white/15'}`}>
              <View className={`w-5 h-5 rounded-full bg-[#04110F] ${segmentVoiceEnabled ? 'self-end' : 'self-start'}`} />
            </View>
          </Pressable>

          <Pressable
            accessibilityLabel={t('track.segmentStartNow')}
            onPress={startTrackSegment}
            className="flex-row items-center justify-center gap-2 rounded-[16px] px-4 py-3 bg-ft-acc"
          >
            <Ionicons name="play" size={16} color={FT.accText} />
            <Text className="text-[14px] font-black text-ft-acc-text">{t('track.segmentStartNow')}</Text>
          </Pressable>
        </View>
      </AnyvoBottomSheet>

      {/* Play-Pflicht: Hintergrundstandort-Disclosure VOR Aufnahmestart.
          „Weiter" → Aufnahme (Berechtigung → GPS → Timer). „Abbrechen" → nichts. */}
      <BackgroundLocationDisclosure
        visible={showBgDisclosure}
        onCancel={() => setShowBgDisclosure(false)}
        onContinue={() => { setStartAfterClose(true); setShowBgDisclosure(false); }}
      />

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
          angleMarkersCount={dbg?.angleCount ?? null}
          acuteAngleMarkersCount={dbg?.acuteAngleCount ?? null}
          lastAngleType={dbg?.lastAngleType ?? null}
          lastAngleDegrees={dbg?.lastAngleDeg ?? null}
          lastAngleDirection={dbg?.lastAngleDir ?? null}
          lastAngleRejectedReason={dbg?.lastAngleReject ?? null}
          devMode
        />
      )}

      {toast}
    </View>
  );
}
