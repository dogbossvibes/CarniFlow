import { isScoredObject, isTrainingJoker } from '@/features/tracking/utils/objectMarkers';
import { useTranslation } from 'react-i18next';
import { SpecialAnglePicker } from '@/features/tracking/components/SpecialAnglePicker';
import { countLaidCorners, projectAngleMarkers, type SpecialGeometry } from '@/features/tracking/utils/specialAngleGeometry';
import { mapBottomOverlayLayout } from '@/features/tracking/utils/mapScaleBar';
import { loadLayRecovery } from '@/features/tracking/services/trackRecoveryService';
import { useDogTrackColor } from '@/features/tracking/hooks/useDogTrackColor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { hapticTap, hapticSuccess, hapticMarker, hapticAngle, hapticWarning } from '@/features/tracking/utils/haptics';
import { useFocusEffect, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { requestVoice, resetVoiceEvents } from '@/features/tracking/utils/voiceEvents';
import { useTrackVoiceAudioSession } from '@/features/tracking/utils/trackVoiceAudioSession';
import { C, FT } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { getGpsQuality } from '@/features/tracking/utils/gpsFilter';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { useCapabilities } from '@/hooks/useCapabilities';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { useTrackRecorder } from '@/features/tracking/hooks/useTrackRecorder';
import { isLaySessionWarmupReady } from '@/features/tracking/utils/layStartLock';
import { BackgroundLocationDisclosure } from '@/features/tracking/components/BackgroundLocationDisclosure';
import { useAutoDetectSetting } from '@/hooks/useAutoDetectSetting';
import { useLayVoiceSetting } from '@/hooks/useLayVoiceSetting';
import { useStepLengthSetting } from '@/hooks/useStepLengthSetting';
import { useVolumeKeyArticleSetting } from '@/hooks/useVolumeKeyArticleSetting';
import { subscribeQuickAddArticle } from '@/features/tracking/quickAddArticleBus';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { isResumeOfActiveFaehrte, reopenTarget, shouldShowActiveFaehrteConflict, type ActiveFaehrte } from '@/features/tracking/store/activeFaehrtenModel';
import { clearPending } from '@/features/tracking/store/trackPersist';
import * as Crypto from 'expo-crypto';
import { claimNewbieQuota, quotaBlock, releaseNewbieQuota } from '@/services/quotaService';
import { recordTrackCancelled } from '@/features/tracking/services/trackRecoveryService';
import { handleQuotaBlock } from '@/features/subscription/quotaUx';
import { fetchCurrentWeather, type CurrentWeather } from '@/services/weatherService';
import { angleEvent, objectEvent, trackEventLabelKey, type TrackEvent } from '@/features/tracking/utils/trackEventVoice';
import { getSpeechLocale } from '@/i18n';
import { metersToSteps } from '@/features/tracking/utils/steps';
import { ExamTemplateBanner, ExamTemplateChooser, WindRelationPill } from '@/features/tracking/components/ExamTemplateGuide';
import { compassLabel, walkBearingDeg, windRelation, WIND_RELATION_MIN_SPEED_KMH } from '@/features/tracking/utils/windRelation';
import { examLayGuidance, examTemplateById, type ExamTemplateId } from '@/features/tracking/utils/examTemplates';
import { useDogTrackSettings } from '@/features/tracking/hooks/useDogTrackSettings';
import { cancelLayReminder } from '@/features/tracking/native/liegezeitReminder';
import { PrecisionDebugPanel } from '@/features/tracking/components/PrecisionDebugPanel';
import { QaModeBadge } from '@/features/tracking/components/QaModeBadge';
import { QaReferenceMarker } from '@/features/tracking/components/QaReferenceMarker';
import type { GpsStats } from '@/features/tracking/engine/types';
import { useToast } from '@/components/ui/Toast';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { HelpButton } from '@/components/help/HelpButton';
import { FirstTrackGuideCard, GUIDE_TARGET_STYLE, useFirstTrackGuide } from '@/components/help/FirstTrackGuide';
import { FIRST_LAY_GUIDE } from '@/features/help/helpRegistry';
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
import { PocketLockOverlay } from '@/features/tracking/components/PocketLockOverlay';
import { RainModeOverlay } from '@/features/tracking/components/RainModeOverlay';
import { isRainyWeatherCode } from '@/features/tracking/utils/rainMode';
import { TrackWeatherLine } from '@/features/track-weather/components';
import { HoldToStopButton } from '@/features/tracking/components/HoldToStopButton';
import { useActiveTrackOverlays } from '@/features/tracking/hooks/useActiveTrackOverlays';
import { TrackReferenceOverlayControl } from '@/features/tracking/components/TrackReferenceOverlayControl';
import type { TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';
import { useFieldVoiceControl } from '@/features/voice/hooks/useFieldVoiceControl';
import { useVoiceControlPreference } from '@/features/voice/hooks/useVoiceControlPreference';
import { layVoiceStep } from '@/features/voice/services/layVoiceBridge';
import type { FieldVoiceEffect } from '@/features/voice/services/fieldVoiceController';
import { rememberLayingGroupTrack } from '@/features/training-groups/groupTrackLocal';

const NO_REFERENCE_OVERLAYS: TrackReferenceOverlay[] = [];

type MatIcon = React.ComponentProps<typeof Ionicons>['name'];
// Gegenstand-Materialien (Reihenfolge wie im Sheet).
const GEGENSTAND_MATERIALS: { material: MarkerMaterial; icon: MatIcon; label: string }[] = [
  { material: 'ball', icon: 'tennisball-outline', label: 'Ball · Joker' },
  { material: 'gummi', icon: 'ellipse-outline', label: 'Gummi' },
  { material: 'holz',     icon: 'leaf-outline',        label: 'Holz' },
  { material: 'duebel',   icon: 'git-commit-outline',  label: 'Dübel · Joker' },
  { material: 'stoff',    icon: 'shirt-outline',       label: 'Stoff' },
  { material: 'filz',     icon: 'layers-outline',      label: 'Filz' },
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
  requestVoice({ eventType: 'segment', text, language: getSpeechLocale(), priority: 2,
    onceKey: `lay-segment:${Date.now()}:${++layVoiceSequence}`, phase: 'lay' });
}
let layVoiceSequence = 0;

// Sprachbestätigung eines TATSÄCHLICH gesetzten/erkannten Events beim Legen.
// Bewusst nur die Kurzform („Winkel links", „Dübel", „Absatz") — keine
// Vorhersage, keine Distanz. Die Zuordnung liegt zentral in
// trackEventVoice.ts und ist damit identisch zur Absuche.
function speakTrackEvent(label: string, eventType: 'angle' | 'object') {
  requestVoice({ eventType, text: label, language: getSpeechLocale(), priority: 5,
    onceKey: `lay:${eventType}:${Date.now()}:${++layVoiceSequence}`, phase: 'lay' });
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
  // eslint-disable-next-line react-hooks/refs -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
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
  const params = useLocalSearchParams<{ dogId?: string; id?: string; groupTrackId?: string; groupId?: string; groupSessionId?: string; groupOwn?: string }>();
  // Gruppentraining (Stufe 2b): Fährte für den Hund einer anderen Person. Aufzeichnung unverändert;
  // nur das Ziel nach dem Stoppen ist die Übergabe statt der eigenen Liegezeit.
  // own (Issue #150): eigene Fährte für den eigenen Hund. Sie bleibt die eigene, offene Fährte;
  // nach dem Stoppen wird nur ihre Fläche im Gruppentraining eingetragen.
  const groupHandover = useMemo(() => (typeof params.groupTrackId === 'string' && typeof params.groupId === 'string' && typeof params.groupSessionId === 'string'
    ? { trackId: params.groupTrackId, groupId: params.groupId, sessionId: params.groupSessionId, own: params.groupOwn === '1' } : null),
  [params.groupTrackId, params.groupId, params.groupSessionId, params.groupOwn]);
  const { session } = useSession();
  const { dogs, refresh: refreshDogs } = useDogs();
  useFocusEffect(useCallback(() => { void refreshDogs(); }, [refreshDogs]));
  const { isPro } = useCapabilities();
  const { showToast, toast } = useToast();

  const [phase, setPhase] = useState<'warmup' | 'recording'>('warmup');
  // eslint-disable-next-line react-hooks/refs -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
  const phaseRef = useRef(phase); phaseRef.current = phase;   // Stale-Closure-Schutz für Trigger
  // Geführte erste Fährte: reine Anzeige, liest/schreibt nur den Hilfe-„gesehen"-Status.
  const layGuide = useFirstTrackGuide({ guideId: 'guide_first_lay', legacyTopicId: 'track_laying',
    steps: FIRST_LAY_GUIDE, minStep: phase === 'recording' ? 1 : 0, reached: phase === 'recording' });
  const [view, setView] = useState<'map' | 'sketch'>('map');
  const [surface, setSurface] = useState<string>('Acker');         // Untergrund
  const [condition, setCondition] = useState<string | null>(null); // Beschaffenheit
  const [weather, setWeather] = useState<CurrentWeather | null>(null);  // echtes Wetter (Open-Meteo)
  // Prüfungsvorlage (T-200): reine Führungshilfe beim Legen, nicht gespeichert.
  const [examTemplateId, setExamTemplateId] = useState<ExamTemplateId | null>(null);
  const [weatherState, setWeatherState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const weatherFetchedRef = useRef(false);
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
  // Gebuchte, aber nie gestartete NEWBIE-Fährte: beim Verlassen des Screens zurückgeben.
  const claimPendingRef = useRef(false);
  // Verlässt die Nutzerin den Screen, bevor die Aufnahme lief (z. B. GPS nie bereit), wird
  // die Buchung zurückgegeben. Der Server prüft zusätzlich, dass es keine Fährte unter der ID gibt.
  useEffect(() => () => {
    const ref = trackClaimRef.current;
    if (claimPendingRef.current && ref) {
      claimPendingRef.current = false;
      void releaseNewbieQuota('track', ref);
    }
  }, []);
  const [showBgDisclosure, setShowBgDisclosure] = useState(Platform.OS === 'android');    // Play-Disclosure VOR erster Location-Permission
  const [disclosurePurpose, setDisclosurePurpose] = useState<'permission' | 'recording'>('permission');
  const [permissionFlowStarted, setPermissionFlowStarted] = useState(Platform.OS !== 'android');
  const [startAfterClose, setStartAfterClose] = useState(false);     // begin() erst NACH Schliessen des Dialogs
  const warmupStartedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const stoppingRef = useRef(false);   // Doppelklick-Guard für „Stoppen"
  const [pocketLock, setPocketLock] = useState(false);
  // Regenmodus: zweite, vereinfachte Ansicht (nur Anzeige — Aufnahme läuft unverändert weiter).
  const [rainMode, setRainMode] = useState(false);
  const { t: tRain } = useTranslation('rainMode');
  const [mapMetricsHeight, setMapMetricsHeight] = useState(64);
  const mapOverlayLayout = mapBottomOverlayLayout(mapMetricsHeight, 0, false);
  const [pendingExit, setPendingExit] = useState<{ href: string } | { back: true } | null>(null);

  // Automatisch erkannter Winkel (rechts/links/spitz) → Haptik + Hinweis.
  // Der Marker wird im Recorder direkt am Scheitel gesetzt.
  // Ein Event wird GENAU EINMAL bestätigt: Marker (im Recorder) + Haptik +
  // Toast + Sprachbestätigung. Alle drei Rückmeldungen benutzen denselben,
  // zentral zugeordneten Begriff (trackEventVoice.ts) — identisch zur Absuche.
  const layVoice = useLayVoiceSetting();   // Sprachausgabe beim Legen (Default AUS)
  // T-204: Ansage hörbar trotz Stummschalter und bei gesperrtem Bildschirm (Aufruf weiter unten,
  // weil auch die Sprachsteuerung ihre Bestätigungen hörbar braucht).
  const layVoiceRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
  layVoiceRef.current = layVoice.enabled;
  const announceEvent = useCallback((event: TrackEvent, mode: 'detected' | 'set') => {
    const label = t(trackEventLabelKey(event));
    // Toast IMMER — das Gate sitzt ausschliesslich vor der Sprachausgabe.
    // Marker (Recorder) und Haptik laufen ohnehin ausserhalb dieser Funktion.
    showToast(t(mode === 'detected' ? 'track.eventDetected' : 'track.eventSet', { label }));
    if (layVoiceRef.current) speakTrackEvent(label, event.kind === 'object' ? 'object' : 'angle');
  }, [showToast, t]);

  const onAngle = useCallback((kind: AngleKind) => {
    // Automatisch erkannt → gedrosselt: Abriss als Warnung, sonst Winkel-Impuls.
    if (kind === 'abriss') hapticWarning(); else hapticAngle();
    announceEvent(angleEvent(kind), 'detected');
  }, [announceEvent]);

  const { autoDetect, setAutoDetect } = useAutoDetectSetting();
  const { stepLengthM } = useStepLengthSetting({ freezeWhileMounted: true });   // optionale persönliche Schrittlänge (Default 0,75 m)
  const { enabled: volumeKeyArticle } = useVolumeKeyArticleSetting();
  const rec = useTrackRecorder({ onAngle, autoDetect });

  // Zuletzt gewähltes Gegenstand-Material → Default für den Schnell-Gegenstand.
  const lastMaterialRef = useRef<MarkerMaterial>('diverses');
  const [lastMaterial, setLastMaterial] = useState<MarkerMaterial | null>(null);   // nur Anzeige („wie zuletzt" im Regenmodus)

  // Gegenstand mit gewähltem Material setzen. Erst, wenn der Startanker steht —
  // sonst würde er im Warmup-Drift landen (kein Crash, nur Hinweis).
  const placeGegenstand = useCallback((material: MarkerMaterial) => {
    setGsPicker(false);
    const st = useTrackingStore.getState();
    // Ohne Startanker UND valide aktuelle Position kein (koordinatenloser) Gegenstand.
    if (!st.startAnchor || !st.currentPosition) { showToast(t('toast.startPointWait')); return false; }
    hapticMarker();                 // sofort, VOR dem Speichern
    lastMaterialRef.current = material;
    setLastMaterial(material);
    void rec.addMarker('gegenstand', { material });
    announceEvent(objectEvent(material), 'set');   // „Gegenstand" bzw. „Dübel"
    return true;
  }, [rec, showToast, t, announceEvent]);

  // Schnell-Gegenstand (Hardware-Taste / Kurzbefehl): ohne Material-Auswahl, am
  // zuletzt gewählten Material. Nur während laufender Aufnahme.
  const quickAddArticle = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    if (!useTrackingStore.getState().startAnchor) { showToast(t('toast.startPointWait')); return; }
    hapticMarker();                 // sofort, VOR dem Speichern
    void rec.addMarker('gegenstand', { material: lastMaterialRef.current });
    announceEvent(objectEvent(lastMaterialRef.current), 'set');
  }, [rec, showToast, t, announceEvent]);

  // Manuell einen Fachwinkel (GW/OW/BW) ODER Abriss an der aktuellen Position setzen.
  // Nutzt dieselbe currentPosition/positionSource wie die Aufnahme (keine extra GPS-Abfrage).
  const placeWinkel = useCallback((angleKind: AngleKind, geometry?: SpecialGeometry): boolean => {
    if (phaseRef.current !== 'recording') return false;
    const st = useTrackingStore.getState();
    // Fachliche Annahme ZUERST: ohne Startanker UND ohne valide aktuelle Position
    // wird KEIN (koordinatenloser) Marker gesetzt und KEIN Erfolg gemeldet.
    if (!st.startAnchor || !st.currentPosition) { showToast(t('toast.startPointWait')); return false; }
    // addMarker fügt den Marker (mit currentPosition) SYNCHRON in den Store ein
    // (commitMarker → s.addMarker vor dem ersten await) → Karte reagiert sofort.
    void rec.addMarker('winkel', { angleKind, ...geometry });
    if (angleKind === 'abriss') hapticWarning(); else hapticAngle();   // Feedback nach der Annahme
    announceEvent(angleEvent(angleKind), 'set');
    setWinkelSheet(false);
    return true;
  }, [rec, showToast, t, announceEvent]);

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

  // ── Sprachsteuerung beim Legen (Spec 03, PR B) ─────────────────────────────
  // Jeder Befehl ruft GENAU die Funktion der Taste auf (placeWinkel, quickAddArticle,
  // finishTrack) – gleiche Marker, gleiche Daten, gleiche Rückmeldung. Erkannter Text
  // wird nicht gespeichert. Kein Entfernen beim Legen (Recorder kann keinen Marker
  // entfernen; Entscheid Nutzerin 2026-11-25). Nur im Vordergrund.
  const finishTrackRef = useRef<() => void>(() => undefined);
  const speakVoiceControl = useCallback((key: string) => {
    requestVoice({ eventType: 'status', text: t(key as TranslationKey), language: getSpeechLocale(), priority: 4,
      onceKey: `lay-voice-control:${Date.now()}:${++layVoiceSequence}`, phase: 'lay' });
  }, [t]);
  const onVoiceEffect = useCallback((effect: FieldVoiceEffect) => {
    if (phaseRef.current !== 'recording') return;
    const step = layVoiceStep(effect);
    let accepted = true;
    if (step.run === 'corner') accepted = placeWinkel(step.angleKind);
    else if (step.run === 'article') { accepted = !!useTrackingStore.getState().startAnchor; quickAddArticle(); }
    else if (step.run === 'finish') { finishTrackRef.current(); return; }
    if (!accepted) return;   // Taste hätte nichts gesetzt (z. B. Startpunkt fehlt): gleicher Hinweis wie dort
    if (step.run === 'none' && step.speakKey) showToast(t(step.speakKey as TranslationKey));
    // Gesetzte Marker sagt announceEvent schon an, wenn die Sprachausgabe an ist.
    const alreadySpoken = (step.run === 'corner' || step.run === 'article') && layVoiceRef.current;
    if (step.speakKey && !alreadySpoken) speakVoiceControl(step.speakKey);
  }, [placeWinkel, quickAddArticle, showToast, speakVoiceControl, t]);
  const voiceControl = useFieldVoiceControl('lay', onVoiceEffect);
  const voicePref = useVoiceControlPreference('lay');
  const voiceListening = voiceControl.status === 'listening' || voiceControl.status === 'starting';
  useTrackVoiceAudioSession(layVoice.enabled || voiceListening);
  // Gemerkt «an»: beim Start der Aufnahme wieder einschalten; ausserhalb der Aufnahme aus.
  const { enable: enableVoice, disable: disableVoice } = voiceControl;
  useEffect(() => {
    if (phase !== 'recording') { disableVoice(); return; }
    if (voicePref.wanted && voiceControl.status === 'off') void enableVoice();
  }, [phase, voicePref.wanted, voiceControl.status, enableVoice, disableVoice]);
  const toggleVoiceControl = useCallback(() => {
    hapticTap();
    if (voiceListening) { disableVoice(); voicePref.save(false); showToast(t('voiceField.stopped')); return; }
    voicePref.save(true);
    void enableVoice();
  }, [voiceListening, disableVoice, enableVoice, voicePref, showToast, t]);
  useEffect(() => {
    if (voiceControl.status === 'denied') showToast(t('voiceField.denied'));
    else if (voiceControl.status === 'unavailable' && voicePref.wanted) showToast(t('voiceField.unavailable'));
  }, [voiceControl.status, voicePref.wanted, showToast, t]);

  const activeDog = dogs.find(d => d.id === selectedDogId) ?? dogs[0] ?? null;
  const conflictShownRef = useRef(false);
  // Fortsetzen ist einmal gescheitert (Recovery nicht ladbar) → die Start-Taste zeigt wieder
  // den Konfliktdialog, damit die Fährte bewusst abgebrochen werden kann (keine Sackgasse).
  const resumeFailedRef = useRef(false);
  const quickPickerLayout = getTrackQuickPickerLayout({
    windowHeight,
    safeAreaTop: insets.top,
    safeAreaBottom: insets.bottom,
  });

  // Regel 4: pro Hund max. EINE aktive Fährte. Der eigentliche Aufnahmestart
  // (Disclosure → begin). Ausgelagert, da ihn sowohl der normale Pfad als auch
  // „Fährte abbrechen" im Konflikt-Dialog aufrufen.
  const proceedToStart = useCallback(() => {
    hapticTap();
    setDisclosurePurpose(permissionFlowStarted ? 'recording' : 'permission');
    setShowBgDisclosure(true);
  }, [permissionFlowStarted]);

  // Konflikt-Dialog: eine aktive Fährte dieses Hundes existiert bereits.
  const showConflict = useCallback((dId: string, entry: ActiveFaehrte) => {
    Alert.alert(
      t('track.continuation.conflictTitle'),
      t('track.continuation.conflictText'),
      [
        { text: t('track.continuation.resume'), onPress: () => router.replace(reopenTarget(entry) as never) },
        // Endgültig (dauerhafter Abbruch-Marker + Puffer weg) → nie per Ein-Tipp neben „Abbrechen":
        // zweite, ausdrückliche Bestätigung mit ehrlicher Folge.
        { text: t('track.continuation.conflictAbort'), style: 'destructive', onPress: () => Alert.alert(
            t('track.continuation.conflictFinalTitle'),
            t('track.continuation.conflictFinalText'),
            [
              { text: t('track.continuation.cancel'), style: 'cancel' },
              { text: t('track.continuation.finalAbortConfirm'), style: 'destructive', onPress: () => {
                  // Bestehende Fährte DIESES Hundes verwerfen (keine Fremdfährte berühren).
                  useActiveFaehrten.getState().remove(dId);
                  void clearPending(dId);
                  void recordTrackCancelled(entry.sessionId, dId, 'lay_conflict');   // dauerhaft: nie wieder „Fährte fortsetzen"
                  void cancelLayReminder(dId, entry.sessionId);   // Liegezeit-Erinnerung der verworfenen Fährte
                  // NEWBIE: nie abgesuchte Fährte gibt das Kontingent zurück (Server prüft zusätzlich).
                  if (entry.sessionId && entry.status !== 'searching') void releaseNewbieQuota('track', entry.sessionId);
                  if (useTrackingStore.getState().dogId === dId) useTrackingStore.getState().setSessionStatus('cancelled');
                  proceedToStart();   // erst danach darf eine neue Fährte entstehen
                } },
            ],
          ) },
        { text: t('track.continuation.cancel'), style: 'cancel' },
      ],
    );
  }, [router, proceedToStart, t]);

  // Start-Taste: erst prüfen, ob der gewählte Hund bereits eine aktive Fährte hat.
  const handleStartPress = useCallback(() => {
    rec.noteUserTapStart();
    const dId = activeDog?.id ?? null;
    const entry = dId ? useActiveFaehrten.getState().get(dId) : null;
    // Genau diese aktive Fährte wird fortgesetzt (Route trägt ihre Session-ID) → direkt
    // weiter; begin() lädt die Recovery. Ohne diese Ausnahme führt "Fährte fortsetzen"
    // im Konfliktdialog wieder hierher zurück (Endlosschleife).
    const routeSessionId = typeof params.id === 'string' ? params.id : null;
    if (dId && entry && (resumeFailedRef.current || !isResumeOfActiveFaehrte(entry, dId, routeSessionId))) { showConflict(dId, entry); return; }   // KEINE zweite Fährte
    proceedToStart();
  }, [activeDog?.id, showConflict, proceedToStart, rec, params.id]);

  // Beim Betreten mit einem Hund, der bereits eine aktive Fährte hat, sofort den
  // Dialog zeigen (einmalig) — statt still eine zweite Aufnahme vorzubereiten.
  useEffect(() => {
    const dId = (params.dogId as string) ?? null;
    if (!dId || conflictShownRef.current) return;
    const entry = useActiveFaehrten.getState().get(dId);
    const routeSessionId = (params.id as string) ?? null;
    const currentSessionId = useTrackingStore.getState().currentSessionId;
    if (entry && shouldShowActiveFaehrteConflict(entry, dId, routeSessionId, currentSessionId)) {
      conflictShownRef.current = true;
      showConflict(dId, entry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    trackPoints, markers, currentPosition, heading, gpsAccuracy,
    distanceMeters, durationSeconds, isPaused, mapFollowMode, setMapFollowMode,
    startAnchor, startLockActive, startDriftRejectedCount, segments,
    dogId: storeDogId, currentSessionId: storeSessionId,
  } = useTrackingStore();
  const activeSegment = activeOrPlannedSegment(segments);
  const currentStep = metersToSteps(distanceMeters, stepLengthM);

  // Andere offene Fährten der eigenen Hunde als read-only Referenz (nur Karte).
  // Die Store-Session zählt nur, wenn sie zum gewählten Hund gehört — sonst würde
  // eine noch geladene Fährte eines anderen Hundes fälschlich ausgeblendet.
  // Default AN, kontextuell (kein globales Setting). Lädt nie pro GPS-Fix.
  const { color: layColor } = useDogTrackColor(activeDog?.id ?? params.dogId ?? storeDogId);
  // Fährten-Einstellungen des Hundes: Prüfungsvorlage vorwählen, solange vor dem Legen nichts selbst gewählt wurde.
  const { settings: dogTrackSettings, loaded: dogTrackSettingsLoaded } = useDogTrackSettings(activeDog?.id ?? params.dogId ?? storeDogId);
  const examChosenRef = useRef(false);
  const chooseExamTemplate = useCallback((next: ExamTemplateId | null) => { examChosenRef.current = true; setExamTemplateId(next); }, []);
  useEffect(() => {
    if (!dogTrackSettingsLoaded || examChosenRef.current || phase !== 'warmup') return;
    setExamTemplateId(dogTrackSettings.examTemplate ?? null);
  }, [dogTrackSettingsLoaded, dogTrackSettings.examTemplate, phase]);
  const referenceOverlays = useActiveTrackOverlays({
    userId:           session?.user?.id ?? null,
    currentUserDogs:  dogs,
    currentDogId:     activeDog?.id ?? null,
    currentSessionId: activeDog && storeDogId === activeDog.id ? storeSessionId : null,
  });
  const [showReferenceTracks, setShowReferenceTracks] = useState(true);

  // Ein brauchbarer Fix ist Pflicht; langes Warten ersetzt keine Genauigkeit.
  const gpsReady = isLaySessionWarmupReady(gpsAccuracy);
  const canStart = gpsReady;

  // Erst nach bestätigter Disclosure die erste Android-Location-Permission und
  // danach den bestehenden GPS-Warmup starten. „Nicht jetzt" lässt beides aus.
  useEffect(() => {
    if (!permissionFlowStarted) return;
    if (warmupStartedRef.current) return;
    warmupStartedRef.current = true;
    rec.startWarmup().then(r => { if (r.error) showToast(r.error); });
  }, [permissionFlowStarted, rec, showToast]);

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
  // LOKAL ZUERST: nach Entitlement und brauchbarem Warmup laufen Timer und UI
  // sofort; die Linie beginnt erst mit einem stabilen Median-Anker.
  const begin = useCallback(async () => {
    if (beganRef.current) return;
    beganRef.current = true;
    resetVoiceEvents();
    const requestedSessionId = typeof params.id === 'string' ? params.id : null;
    const resumed = requestedSessionId ? await loadLayRecovery({ sessionId: requestedSessionId,
      dogId: activeDog?.id, userId: session?.user?.id }).catch(() => null) : null;
    if (requestedSessionId && !resumed) {
      beganRef.current = false;
      resumeFailedRef.current = true;
      Alert.alert(t('common.error'), t('track.continuation.resumeFailed'));
      return;
    }

    // NEWBIE-Quota: max. 1 neue Fährte/Kalendermonat. Claim VOR dem Recorder-Start.
    // Idempotent auf trackClaimRef → ein Retry nach Fehler (beganRef zurückgesetzt)
    // verbraucht KEIN zweites Kontingent; der erlaubte Start darf die Fährte komplett
    // abschließen (kein zweiter Check im weiteren Verlauf). Premium überspringt.
    if (!resumed && !isPro) {
      if (!trackClaimRef.current) trackClaimRef.current = Crypto.randomUUID();
      const block = quotaBlock((await claimNewbieQuota('track', trackClaimRef.current)).status);
      if (!block) claimPendingRef.current = true;
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
    // NEWBIE: Fährten-ID = Buchungs-ID, damit der Server eine gespeicherte Fährte der Buchung
    // zuordnen kann (Rückgabe nur ohne Fährte). Ein fehlgeschlagener Start legt unter der ID
    // noch nichts an (useTrackRecorder: lokale Session erst nach allen Prüfungen).
    const clientUuid = requestedSessionId ?? trackClaimRef.current ?? Crypto.randomUUID();
    sessionIdRef.current = null;   // Remote-ID erst nach erfolgreichem Insert (unten)
    const r = await rec.beginRecording({
      localId: clientUuid,
      resume: resumed ?? undefined,
      ownerId: uid,
      dogId:   activeDog?.id ?? null,
      onSessionStarted: () => {
        claimPendingRef.current = false;   // Fährte läuft → Buchung zählt
        setPhase('recording');
        sessionIdRef.current = clientUuid;
        // Gruppentraining (#156): merken, zu welcher Gruppenfährte diese Aufnahme gehört. Wird sie
        // unterbrochen und über den gewohnten Weg fertig gelegt, bietet das Gruppentraining das
        // Eintragen bzw. Übergeben danach an (statt dauerhaft «wird gelegt»). Aufnahme unverändert.
        if (groupHandover && uid) void rememberLayingGroupTrack(uid, { trackId: groupHandover.trackId, localId: clientUuid,
          groupId: groupHandover.groupId, sessionId: groupHandover.sessionId, createdAtMs: Date.now(), ...(groupHandover.own ? { own: true } : {}) }).catch(() => null);
        hapticSuccess();
        showToast(t('toast.trackRunning'));
        // Regen-Vorschlag: höchstens einmal, nur beim frischen Start (nicht beim Fortsetzen)
        // und nur, wenn das bereits geladene Wetter Regen meldet. Reine Ansichtswahl.
        if (!resumed && isRainyWeatherCode(weather?.weatherCode)) {
          Alert.alert(tRain('askTitle'), tRain('askBody'), [
            { text: tRain('no'), style: 'cancel' },
            { text: tRain('yes'), onPress: () => setRainMode(true) },
          ]);
        }
        if (layVoiceRef.current) requestVoice({ eventType: 'status', text: t('track.voiceRecordingStarted'),
          language: getSpeechLocale(), priority: 3, onceKey: 'lay-recording-start', phase: 'lay',
          valid: () => useTrackingStore.getState().isRecording });
        if (activeDog) {
          const snap = weather
            ? { temperature: weather.temperature, windSpeed: weather.windSpeed, humidity: weather.humidity, condition: weather.weatherCondition }
            : null;
          useActiveFaehrten.getState().upsert(activeDog.id, {
            status: 'laying', sessionId: clientUuid, startedAt: resumed ? Date.parse(resumed.startedAt) : Date.now(),
            gpsAccuracy: useTrackingStore.getState().gpsAccuracy, weather: snap,
          });
        }
      },
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
    });   // UI/Timer wurden per Callback gestartet; lokale Session ist jetzt angelegt
    if (r.error) { beganRef.current = false; showToast(r.error === 'gps_not_ready' ? t('track.gpsPreparing') : r.error); return; }
  }, [session, activeDog, rec, showToast, t, tRain, surface, condition, weather, currentPosition, isPro, router, params.id, groupHandover]);

  // Aufnahme erst starten, NACHDEM der Disclosure-Dialog geschlossen ist:
  // „Weiter" setzt startAfterClose + schliesst den Dialog (showBgDisclosure=false).
  // Dieser Effect feuert im Render NACH dem Schliessen → dann erst begin().
  // Kein künstliches Delay; GPS-Warmup läuft bereits seit Öffnen des Screens.
  // Die optionale Hintergrundberechtigung blockiert den Recorder nicht.
  useEffect(() => {
    if (startAfterClose && !showBgDisclosure) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
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

  const mapMarkers: MapMarker[] = projectAngleMarkers(markers).map(mk => ({ ...mk }));
  const gegenstaende = markers.filter(isScoredObject).length;
  const winkel = countLaidCorners(markers);
  // Wind zur Laufrichtung (T-201): nur bei spürbarem Wind und sobald einige Meter gelegt sind.
  const windRel = weather && weather.windSpeed >= WIND_RELATION_MIN_SPEED_KMH
    ? windRelation(weather.windDirection, walkBearingDeg(trackPoints)) : null;
  const examTemplate = examTemplateById(examTemplateId);
  const examGuidance = examTemplate ? examLayGuidance(examTemplate, {
    currentStep,
    cornerSteps: projectAngleMarkers(markers)
      .filter(m => m.type === 'winkel' && m.angleKind !== 'abriss' && m.angleKind !== 'absatz')
      .map(m => metersToSteps(m.distance_from_start ?? 0, stepLengthM)),
    articleSteps: markers.filter(isScoredObject).map(m => metersToSteps(m.distance_from_start ?? 0, stepLengthM)),
  }) : null;
  // Echte Positionen für die Skizze (deckt sich mit der Aufnahme).
  const angleMarkers = markers.filter(mk => mk.type === 'winkel' && mk.lat != null && mk.lng != null).map(mk => ({ lat: mk.lat as number, lng: mk.lng as number }));
  const objectMarkers = markers.filter(mk => mk.type === 'gegenstand' && mk.lat != null && mk.lng != null).map(mk => ({ lat: mk.lat as number, lng: mk.lng as number }));

  // TS starten: SOFORT scharf am aktuellen TrackPoint (keine Vorab-Schrittzahl).
  // `type`/`customLabel` kommen vom Sheet (normales Menü) oder direkt vom Regenmodus.
  const beginTrackSegment = useCallback((type: TrackSegmentType, customLabel: string): boolean => {
    if (phaseRef.current !== 'recording' || !activeDog) return false;
    const st = useTrackingStore.getState();
    if (activeOrPlannedSegment(st.segments)) return false;   // nur EINE aktive Teilstrecke
    const label = normalizeCustomSegmentLabel(customLabel);
    if (type === 'custom' && !label) { showToast(t('track.segmentCustomRequired')); return false; }
    const idx = st.trackPoints.length - 1;
    // Kein gültiger TrackPoint / keine Position → kein Segment, kein Erfolgsfeedback.
    if (idx < 0 || !st.currentPosition) { showToast(t('toast.startPointWait')); return false; }
    const segment = createActiveSegment({
      dogId: activeDog.id,
      trackSessionId: sessionIdRef.current,
      type,
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
    return true;
  }, [activeDog, segmentVoiceEnabled, showToast, t, stepLengthM]);
  const startTrackSegment = useCallback(() => { beginTrackSegment(segmentType, segmentCustomLabel); }, [beginTrackSegment, segmentType, segmentCustomLabel]);

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

  const finishTrack = () => {
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
    hapticSuccess();   // bewusst nach Stop-Bestätigung
    const id = sessionIdRef.current;   // = clientUuid (deterministisch seit Start)
    // rec.finish stoppt synchron, finalisiert lokal (durabel) und reiht den Remote-
    // Upload in die persistente Sync-Queue ein. Navigation folgt nach dem
    // synchronen Session-State-Wechsel, damit der Navigation-Guard deaktiviert ist.
    rec.finish();

    // Registry: Übergang laying → resting. Liegezeit-Start = jetzt (deckt sich mit
    // dem Store-Übergang in setLayFinishedAt). Kennzahlen für die Karten mitgeben.
    if (activeDog && !(groupHandover && !groupHandover.own && id)) {
      const finalMarkers = useTrackingStore.getState().markers;
      useActiveFaehrten.getState().upsert(activeDog.id, {
        status: 'resting', sessionId: id, layStartedAt: Date.now(),
        distanceMeters: Math.round(distanceMeters),
        winkelCount: countLaidCorners(finalMarkers),
        objektCount: finalMarkers.filter(isScoredObject).length,
      });
    }
    const dq = activeDog ? `&dogId=${activeDog.id}` : '';
    if (id && groupHandover) {
      setPhase('warmup');
      // Gruppentraining: gelegte Fährte an die Hundeführerin übergeben (Liegezeit zählt dort).
      setPendingExit({ href: `/groups/handover?trackId=${groupHandover.trackId}&localId=${id}&groupId=${groupHandover.groupId}&sessionId=${groupHandover.sessionId}${groupHandover.own ? '&own=1' : ''}` });
    } else if (id) {
      setPhase('warmup');
      setPendingExit({ href: `/track/liegen?id=${id}${dq}` });   // → Wartephase (Liegezeit) → Ausarbeiten
    } else {
      // Offline: noch keine Session-ID, aber die Fährte gehört dem Hund → Liegen mit dogId.
      setPhase('warmup');
      if (activeDog) setPendingExit({ href: `/track/liegen?dogId=${activeDog.id}` });
      else {
        showToast(t('toast.localSaved'));
        setPendingExit(router.canGoBack() ? { back: true } : { href: '/track' });
      }
    }
  };
  // Sprach-«Ende» nach «Ja» nutzt genau diese Funktion (immer die aktuelle Fassung).
  useEffect(() => { finishTrackRef.current = finishTrack; });


  const togglePause = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    hapticTap();
    const nextPaused = !isPaused;
    if (isPaused) rec.resume(); else rec.pause();
    // Pausezustand bleibt in der Registry und damit in der bestehenden Recovery-Persistenz erhalten.
    const dId = activeDog?.id ?? null;
    if (dId && useActiveFaehrten.getState().get(dId)) useActiveFaehrten.getState().upsert(dId, { paused: nextPaused });
  }, [activeDog, isPaused, rec]);

  const guardedBack = useCallback(() => {
    if (phaseRef.current !== 'recording') {
      if (router.canGoBack()) router.back(); else router.replace('/track' as never);
      return;
    }
    if (pocketLock) return;
    Alert.alert('Fährte läuft noch', 'Bitte die Aufnahme bewusst über Stoppen beenden.', [
      { text: 'Zur Aufnahme', style: 'cancel' },
    ], { cancelable: true });
  }, [pocketLock, router]);

  usePreventRemove(phase === 'recording', useCallback(() => {
    if (!pocketLock) {
      Alert.alert('Fährte läuft noch', 'Die laufende Aufnahme bleibt aktiv. Zum Beenden bitte Stoppen antippen.', [{ text: 'Zur Aufnahme', style: 'cancel' }]);
    }
  }, [pocketLock]));

  useEffect(() => {
    if (!pendingExit || phase === 'recording') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
    setPendingExit(null);
    if ('href' in pendingExit) router.replace(pendingExit.href as never);
    else if (router.canGoBack()) router.back();
    else router.replace('/track' as never);
  }, [pendingExit, phase, router]);

  const unlockPocket = useCallback(() => {
    hapticTap();
    setPocketLock(false);
  }, []);

  // GPS ab >45 m warnen — dann landen keine Linienpunkte (Filter), Distanz bleibt 0.
  const gpsPoor = gpsAccuracy != null && gpsAccuracy > 45;
  // Konsistente GPS-Qualitätsanzeige über alle drei Phasen (Legen/Ansatz/
  // Absuche, Golden-Reference-Audit Punkt 6) — reine Anzeige, KEIN neues
  // Accuracy-Gate: getGpsQuality() ist die bestehende, bereits an anderer
  // Stelle (ActiveFaehrteCard/trackingStore) verwendete Klassifikation.
  const gpsQualityBand = gpsAccuracy != null ? getGpsQuality(gpsAccuracy) : null;
  const gpsQualityKey: Record<'sehr-gut' | 'gut' | 'mittel' | 'schwach', TranslationKey> = {
    'sehr-gut': 'track.gpsVeryGood', 'gut': 'track.gpsGood', 'mittel': 'track.gpsMedium', 'schwach': 'track.gpsPoor',
  };
  const gpsQualityColor = gpsQualityBand === 'sehr-gut' || gpsQualityBand === 'gut' ? FT.acc
    : gpsQualityBand === 'mittel' ? FT.warn
    : gpsQualityBand === 'schwach' ? FT.warn : undefined;
  const gpsLabel = gpsQualityBand ? `GPS · ${t(gpsQualityKey[gpsQualityBand])}` : 'GPS';
  const metrics: { value: string; label: string; warn?: boolean; labelColor?: string }[] = [
    { value: `${Math.round(distanceMeters)} m`, label: `≈ ${metersToSteps(distanceMeters, stepLengthM)} ${t('track.stepsShort')}` },
    { value: String(gegenstaende), label: t('track.objectsShort') },
    { value: String(winkel), label: t('track.angle') },
    { value: gpsAccuracy != null ? `±${Math.round(gpsAccuracy)} m` : '–', label: gpsLabel, warn: gpsPoor, labelColor: gpsQualityColor },
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
      <SafeAreaView edges={['bottom']} className="flex-1">
        {/* Top-Bar: Zurück · LIVE · Karte/Skizze — explizit unter Dynamic Island/Statusbar. */}
        <View className="flex-row items-center gap-3 px-[18px] pb-3" style={{ paddingTop: insets.top + 8 }}>
          <Pressable
            className="w-10 h-10 rounded-[12px] border border-ft-line-strong bg-white/10 items-center justify-center"
            accessibilityLabel="Zur Aufnahme"
            onPress={guardedBack} hitSlop={10}
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
          <HelpButton topicId="track_laying" autoShow={layGuide.decided && !layGuide.active} tint={FT.text} />
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

        {/* QA-Diagnose: tatsächlich aktive Engine/Source. Rendert ausserhalb des
            QA-Modus nichts — auch keinen Abstand. */}
        <QaModeBadge />
        {phase === 'recording' && <QaReferenceMarker hidden={pocketLock} paused={isPaused} mark={rec.markQaReference} label={rec.labelQaReference} />}

        {phase === 'recording' && !!dbg?.rawArchiveError && (
          <View className="mx-[14px] mb-2 px-3 py-2 rounded-xl bg-white/5" accessibilityLiveRegion="polite">
            <Text className="text-ft-warn text-[12px]">{t('track.rawArchiveIncomplete')}</Text>
          </View>
        )}

        {/* Karte / Skizze */}
        <View className="flex-1 mx-[14px] rounded-[24px] overflow-hidden border border-ft-line bg-[#08100e]">
          {phase === 'recording' && (
            <Pressable
              accessibilityLabel={pocketLock ? 'Aufnahme entsperren' : 'Aufnahme sperren'}
              accessibilityHint={pocketLock ? 'Zum Entsperren gedrückt halten' : 'Sperrt gefährliche Touch-Aktionen'}
              onPress={() => { if (!pocketLock) { hapticTap(); setPocketLock(true); } }}
              className={`absolute top-[64px] right-[14px] z-30 w-10 h-10 rounded-[12px] border items-center justify-center ${pocketLock ? 'bg-ft-acc border-ft-acc' : 'bg-black/90 border-ft-line-strong'}`}
              style={{ elevation: 30 }}
            >
              <Ionicons name={pocketLock ? 'lock-closed' : 'lock-open-outline'} size={19} color={pocketLock ? FT.accText : FT.text} />
            </Pressable>
          )}
          {phase === 'recording' && !pocketLock && (
            <Pressable
              testID="rain-mode-toggle"
              accessibilityRole="button"
              accessibilityLabel={tRain('on')}
              onPress={() => { hapticTap(); setGsPicker(false); setWinkelSheet(false); setSegmentSheet(false); setRainMode(true); }}
              className="absolute top-[64px] right-[62px] z-30 w-10 h-10 rounded-[12px] border items-center justify-center bg-black/90 border-ft-line-strong"
              style={{ elevation: 30 }}
            >
              <Ionicons name="water-outline" size={19} color={FT.text} />
            </Pressable>
          )}
          {phase === 'recording' && !pocketLock && voiceControl.available && (
            <Pressable
              testID="voice-control-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: voiceListening }}
              accessibilityLabel={t(voiceListening ? 'voiceField.toggleOff' : 'voiceField.toggleOn')}
              onPress={toggleVoiceControl}
              className={`absolute top-[64px] right-[110px] z-30 w-10 h-10 rounded-[12px] border items-center justify-center ${voiceListening ? 'bg-ft-acc border-ft-acc' : 'bg-black/90 border-ft-line-strong'}`}
              style={{ elevation: 30 }}
            >
              <Ionicons name={voiceListening ? 'mic' : 'mic-outline'} size={19} color={voiceListening ? FT.accText : FT.text} />
            </Pressable>
          )}
          {phase === 'recording' && voiceListening && (
            <View testID="voice-control-status" accessibilityLiveRegion="polite" className="absolute top-[112px] right-[14px] z-30 px-2.5 py-1 rounded-full bg-black/90 border border-ft-line-strong">
              <Text className="text-ft-text text-[12px]">{`${t('voiceField.listening')}${voiceControl.offline === true ? ' · offline' : ''}`}</Text>
            </View>
          )}
          {view === 'map' ? (
            <TrackingMap
                  layColor={layColor}
              layPoints={trackPoints}
              referenceOverlays={showReferenceTracks ? referenceOverlays : NO_REFERENCE_OVERLAYS}
              markers={mapMarkers}
              segments={segments}
              startAnchor={startAnchor}
              currentPosition={currentPosition}
              heading={heading}
              smartFollow
              follow={mapFollowMode}
              onToggleFollow={() => setMapFollowMode(!mapFollowMode)}
              onUserPan={() => { if (mapFollowMode) setMapFollowMode(false); }}
              controlsTop={124}
              mapType="hybrid"
            />
          ) : (
            <View className="flex-1 bg-[#08100e]">
              <TrackSketch accent={layColor} points={trackPoints} angleMarkers={angleMarkers} objectMarkers={objectMarkers} legs={winkel} objects={gegenstaende} w={340} h={520} progress={1} />
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

          {/* Andere Fährten (read-only Referenz) — nur mit mindestens einer Referenz. */}
          {view === 'map' && phase === 'recording' && (
            <TrackReferenceOverlayControl
              overlays={referenceOverlays}
              visible={showReferenceTracks}
              onVisibleChange={setShowReferenceTracks}
              style={{ position: 'absolute', top: 100, left: 14, zIndex: 20 }}
            />
          )}

          {/* Metrik-Leiste (unten) */}
          <View onLayout={e => setMapMetricsHeight(e.nativeEvent.layout.height)} className="absolute left-[14px] right-[14px] bottom-[14px] flex-row rounded-[18px] py-3 px-2 bg-ft-glass border border-ft-glass-line">
            {metrics.map((mm, i) => (
              <View key={i} className={`flex-1 items-center ${i > 0 ? 'border-l border-ft-line' : ''}`}>
                <Text className={`text-[15px] font-black ${mm.warn ? 'text-ft-warn' : 'text-ft-text'}`} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>{mm.value}</Text>
                <Text
                  className={`text-[8.5px] font-bold tracking-[1px] uppercase mt-px ${mm.labelColor ? '' : 'text-ft-muted'}`}
                  style={mm.labelColor ? { color: mm.labelColor } : undefined}
                  numberOfLines={1}
                >{mm.label}</Text>
              </View>
            ))}
          </View>

          {/* Session läuft bereits; nur der erste Geometriepunkt wartet noch. */}
          {phase === 'recording' && startLockActive && (
            <View className="absolute top-[64px] left-0 right-0 items-center px-4" pointerEvents="none">
              <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-ft-glass border border-ft-glass-line">
                <ActivityIndicator size="small" color={FT.acc} />
                <Text className="text-[11px] font-bold text-ft-text">{t('track.recordingGpsStabilizing')}</Text>
              </View>
            </View>
          )}

          {phase === 'recording' && !startLockActive && ((examTemplate && examGuidance) || (windRel && weather)) && (
            <View className="absolute top-[64px] left-0 right-0 items-center px-4 gap-1.5" pointerEvents="none">
              {examTemplate && examGuidance && <ExamTemplateBanner template={examTemplate} guidance={examGuidance} t={t} />}
              {windRel && weather && <WindRelationPill relation={windRel} speedKmh={weather.windSpeed} t={t} />}
            </View>
          )}

          {phase === 'recording' && activeSegment && (
            <View style={{ bottom: mapOverlayLayout.contentBottom }} className="absolute left-[14px] right-[14px] rounded-[18px] p-3 bg-ft-glass border border-ft-glass-line">
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

                  {/* Fährtenwetter: nur Anzeige, beeinflusst die Aufnahme nicht */}
                  <TrackWeatherLine condition={condition} />

                  {/* Hund */}
                  {dogs.length > 0 && (
                    <>
                      <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">{t('track.dog')}</Text>
                      <View className="flex-row flex-wrap gap-2 self-start mb-1">
                        {dogs.map(d => {
                          const on = d.id === activeDog?.id;
                          return (
                            <Pressable key={d.id} onPress={() => setSelectedDogId(d.id)}
                              className={`flex-row items-center gap-1.5 pl-1.5 pr-[12px] py-1.5 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(0,255,204,0.55)]' : 'bg-white/5 border-ft-line'}`}>
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
                          className={`px-[13px] py-2 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(0,255,204,0.55)]' : 'bg-white/5 border-ft-line'}`}>
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
                          className={`px-[13px] py-2 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(0,255,204,0.55)]' : 'bg-white/5 border-ft-line'}`}>
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
                          className={`flex-1 flex-row items-center justify-center gap-1.5 px-[13px] py-2.5 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(0,255,204,0.55)]' : 'bg-white/5 border-ft-line'}`}>
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

                  {/* Sprachausgabe beim Legen (Default AUS). Gilt NUR fürs Legen —
                      die Sprachführung der Absuche hat ihren eigenen Schalter.
                      Marker/Haptik/Toast laufen unabhängig davon immer. */}
                  <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start">{t('track.layVoiceToggle')}</Text>
                  <View className="flex-row gap-2 self-stretch">
                    {([[true, t('track.layVoiceOn'), 'volume-high'], [false, t('track.layVoiceOff'), 'volume-mute']] as const).map(([val, label, icon]) => {
                      const on = layVoice.enabled === val;
                      return (
                        <Pressable
                          key={String(val)}
                          onPress={() => void layVoice.setEnabled(val)}
                          disabled={!layVoice.loaded}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={t('track.layVoiceToggle')}
                          className={`flex-1 flex-row items-center justify-center gap-1.5 px-[13px] py-2.5 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(0,255,204,0.55)]' : 'bg-white/5 border-ft-line'}`}>
                          <Ionicons name={icon} size={15} color={on ? FT.acc : FT.muted} />
                          <Text className={`text-[13px] font-semibold ${on ? 'text-ft-acc' : 'text-ft-muted'}`}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="text-[11px] text-ft-faint self-start mb-1">{t('track.layVoiceToggleSub')}</Text>

                  <ExamTemplateChooser selected={examTemplate} onSelect={chooseExamTemplate} t={t} />

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
                          <Text className="text-[13px] font-semibold text-ft-muted">💨 {weather.windSpeed.toFixed(0)} km/h{compassLabel(weather.windDirection) ? ` ${t('track.wind.from')} ${compassLabel(weather.windDirection)}` : ''}</Text>
                          <Text className="text-[13px] font-semibold text-ft-muted">💧 {weather.humidity.toFixed(0)} %</Text>
                        </View>
                      </>
                    ) : (
                      <Text className="text-[13px] font-semibold text-ft-muted">{t('track.weatherUnavailable')}</Text>
                    )}
                  </View>

                  <Text className="text-[12px] font-semibold text-ft-muted mt-3 self-start">
                    {gpsAccuracy == null ? t('track.gpsPreparing') :
                      canStart ? t('track.gpsReadyAccuracy', { accuracy: Math.round(gpsAccuracy) }) :
                        t('track.gpsWaitingAccuracy', { accuracy: Math.round(gpsAccuracy) })}
                  </Text>
                  <FirstTrackGuideCard guide={layGuide} steps={FIRST_LAY_GUIDE} counterKey="help.firstLayCounter"
                    style={{ alignSelf: 'stretch', marginTop: 12 }} />
                  {/* Start mit brauchbarem Fix; unbrauchbare Warmup-Fixes bleiben Diagnose. */}
                  <Pressable
                    className={`flex-row items-center justify-center gap-2 mt-4 rounded-[16px] px-[20px] py-3 self-stretch ${canStart ? 'bg-ft-acc' : 'bg-white/10'}`}
                    onPress={() => { if (canStart) handleStartPress(); }}
                    disabled={!canStart}
                  >
                    <Ionicons name="play" size={16} color={canStart ? FT.accText : FT.muted} />
                    <Text className={`text-[14px] font-extrabold ${canStart ? 'text-ft-acc-text' : 'text-ft-muted'}`}>
                      {canStart ? t(params.id ? 'track.continuation.resume' : 'track.lay') : t('track.waitingGps')}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          )}
          {phase === 'recording' && layGuide.active && !activeSegment && !gsPicker && !winkelSheet && !pocketLock && !rainMode && (
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: mapMetricsHeight + 12 }}>
              <FirstTrackGuideCard guide={layGuide} steps={FIRST_LAY_GUIDE} counterKey="help.firstLayCounter" />
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
                <Text style={{ width: '100%', color: C.trackTextSec, padding: 6 }}>{t('track.jokerHint')}</Text>
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
                    <Text numberOfLines={1} className="text-[10px] font-extrabold text-ft-text">{m.material === 'ball' ? `${t('track.materialBall')} · ${t('track.jokers')}` : m.material === 'gummi' ? t('track.materialRubber') : m.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {/* Winkel-Schnellwahl: Inline-Popover direkt über dem Winkel-Button — KEIN
            BottomSheet. Fachtyp und Richtung wählen; erst die Bestätigung setzt den Marker. Tap
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
              <SpecialAnglePicker onSelect={placeWinkel} />
            </View>
          </>
        )}

        {/* Steuerung */}
        <View className="flex-row gap-3 px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            accessibilityLabel={activeSegment ? t('track.segmentStop') : t('track.segmentStart')}
            accessibilityHint={t('track.segmentStopHint')}
            className={`flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] border ${activeSegment ? 'bg-ft-acc-dim border-[rgba(0,255,204,0.55)]' : 'bg-white/5 border-ft-line-strong'}`}
            onPress={handleTsToggle} disabled={phase !== 'recording'}
          >
            <Ionicons name={activeSegment ? 'stop-circle-outline' : 'trail-sign-outline'} size={20} color={activeSegment ? FT.acc : FT.text} />
            <Text numberOfLines={1} className={`text-[10.5px] font-extrabold ${activeSegment ? 'text-ft-acc' : 'text-ft-text'}`}>TS</Text>
          </Pressable>
          <Pressable
            className={`flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] border ${gsPicker ? 'bg-ft-acc border-ft-acc' : 'bg-white/5 border-ft-line-strong'}`}
            accessibilityLabel={t('track.setObjectButton')}
            style={layGuide.target === 'object' && !gsPicker ? GUIDE_TARGET_STYLE : undefined}
            onPress={() => { hapticTap(); setWinkelSheet(false); setGsPicker(v => !v); }} disabled={phase !== 'recording'}
          >
            <Ionicons name="cube-outline" size={20} color={gsPicker ? FT.accText : FT.text} />
            <Text numberOfLines={1} className={`text-[10.5px] font-extrabold ${gsPicker ? 'text-ft-acc-text' : 'text-ft-text'}`}>GS</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('track.setAngleButton')}
            accessibilityHint={t('track.setAngleHint')}
            style={layGuide.target === 'angle' && !winkelSheet ? GUIDE_TARGET_STYLE : undefined}
            className={`flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] border ${winkelSheet ? 'bg-ft-acc border-ft-acc' : 'bg-white/5 border-ft-line-strong'}`}
            onPress={() => { hapticTap(); setGsPicker(false); setWinkelSheet(v => !v); }} disabled={phase !== 'recording'}
          >
            <Ionicons name="git-branch-outline" size={20} color={winkelSheet ? FT.accText : FT.text} />
            <Text numberOfLines={1} className={`text-[10.5px] font-extrabold ${winkelSheet ? 'text-ft-acc-text' : 'text-ft-text'}`}>{t('track.angle')}</Text>
          </Pressable>
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            accessibilityLabel={isPaused ? t('track.resume') : t('track.pause')}
            accessibilityHint="Zum Ändern gedrückt halten"
            onPress={() => undefined} onLongPress={togglePause} onAccessibilityTap={togglePause} delayLongPress={1800} disabled={phase !== 'recording'}
          >
            <Ionicons name={isPaused ? 'play' : 'pause'} size={20} color={FT.text} />
            <Text numberOfLines={1} className="text-[10.5px] font-extrabold text-ft-text">{isPaused ? t('track.resume') : t('track.pause')}</Text>
          </Pressable>
          <HoldToStopButton
            onStop={finishTrack}
            disabled={phase !== 'recording'}
            label={t('track.stopLaying')}
            containerClassName="h-[60px] rounded-[18px]"
            containerStyle={{ flex: 1.3 }}
          />
        </View>
      </SafeAreaView>

      {/* Regenmodus: ruft dieselben Funktionen auf wie das Menü oben (keine eigene Speicherlogik). */}
      <RainModeOverlay
        visible={rainMode && phase === 'recording' && !pocketLock}
        duration={clock(durationSeconds)}
        distanceLabel={`${Math.round(distanceMeters)} m`}
        objectCount={gegenstaende}
        materials={GEGENSTAND_MATERIALS.filter(m => !isTrainingJoker(m.material)).map(m => ({ value: m.material, label: m.material === 'gummi' ? t('track.materialRubber') : m.label }))}
        jokers={GEGENSTAND_MATERIALS.filter(m => isTrainingJoker(m.material)).map(m => ({ value: m.material, label: m.material === 'ball' ? t('track.materialBall') : t('track.materialDowel') }))}
        lastMaterial={lastMaterial}
        segmentTypes={TRACK_SEGMENT_TYPES.filter(type => type !== 'custom').map(type => ({ value: type, label: segmentLabel(type) }))}
        activeSegmentLabel={activeSegment ? (activeSegment.type === 'custom' ? segmentDisplayLabel(activeSegment) : segmentLabel(activeSegment.type)) : null}
        onExit={() => { hapticTap(); setRainMode(false); }}
        onObject={placeGegenstand}
        onAngle={placeWinkel}
        onStartSegment={type => beginTrackSegment(type, '')}
        onStopSegment={stopTrackSegment}
        onStop={finishTrack}
        stopLabel={t('track.stopLaying')}
      />

      <PocketLockOverlay
        visible={pocketLock && phase === 'recording'}
        duration={clock(durationSeconds)}
        distanceM={`${Math.round(distanceMeters)} m`}
        onUnlock={unlockPocket}
        onStop={finishTrack}
        label={t('track.stopLaying')}
      />

      <AnyvoBottomSheet visible={segmentSheet} onClose={() => setSegmentSheet(false)} title={t('track.segmentStart')} keyboardAware closeButton>
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
                  className={`flex-row items-center gap-2 px-3 py-3 rounded-[14px] border ${on ? 'bg-ft-acc-dim border-[rgba(0,255,204,0.55)]' : 'bg-white/5 border-ft-line-strong'}`}
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
        </ScrollView>
      </AnyvoBottomSheet>

      {/* Play-Pflicht: Hintergrundstandort-Disclosure VOR der ersten Location-
          Permission. „Weiter" → Berechtigung/Warmup; „Nicht jetzt" → nichts. */}
      <BackgroundLocationDisclosure
        visible={showBgDisclosure}
        onCancel={() => setShowBgDisclosure(false)}
        onContinue={() => {
          if (disclosurePurpose === 'permission') setPermissionFlowStarted(true);
          else setStartAfterClose(true);
          setShowBgDisclosure(false);
        }}
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
          gpsQualityScore={dbg?.gpsQualityScore ?? null}
          gpsQualityLevel={dbg?.gpsQualityLevel ?? null}
          gpsQualityValid={dbg?.gpsQualityValid ?? null}
          gpsQualitySampleCount={dbg?.gpsQualitySamples ?? null}
          gpsQualityReasons={dbg?.gpsQualityReasons ?? null}
          devMode
        />
      )}

      {toast}
    </View>
  );
}
