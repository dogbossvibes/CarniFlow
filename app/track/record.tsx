import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, BackHandler, Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { C } from '@/constants/colors';
import { finishTrackSession } from '@/services/trackingService';
import { TrackPath } from '@/components/tracking/TrackPath';
import { TrackMap, MAPS_AVAILABLE, type MapType } from '@/components/tracking/TrackMap';
import { TrackSearchMap } from '@/components/tracking/TrackSearchMap';
import { SoftBoundary } from '@/components/ui/SoftBoundary';
import { deviationFromTrack, distanceM, nearestArticleDist, type LatLng } from '@/lib/trackGuidance';
import { startRecording, stopRecording, resetRecorder, useRecorder } from '@/lib/trackRecorder';
import type { TrackPoint, TrackArticle } from '@/types/tracking';

// expo-speech ist ein natives Modul. In einem Dev-Client, der OHNE expo-speech
// gebaut wurde, fehlt 'ExpoSpeech' → der Import würde crashen. Deshalb defensiv
// laden: fehlt das Modul, bleibt die Sprachausgabe stumm (GPS/Tracking läuft
// normal weiter). Nach einem neuen Dev-/EAS-Build ist die Stimme automatisch da.
let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
const SPEECH_AVAILABLE = Speech != null;

function speakNow(msg: string) {
  try { Speech?.stop(); Speech?.speak(msg, { language: 'de-DE', rate: 1.0 }); } catch { /* ignore */ }
}
function stopSpeech() {
  try { Speech?.stop(); } catch { /* ignore */ }
}

// Gegenstand-Materialien (werden in article.notiz gespeichert; typ bleibt 'gegenstand').
const MATERIALS = ['Holz', 'Leder', 'Stoff', 'Metall', 'Plastik', 'Knochen', 'Divers'];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistance(pts: { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += haversine(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
  }
  return d;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Himmelsrichtung von A nach B (für die „Nächstes Objekt"-Karte).
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
function getDirection(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const angle = Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180 / Math.PI;
  return DIRS[Math.round(((angle + 360) % 360) / 45) % 8];
}

export default function TrackRecordScreen() {
  const router = useRouter();
  const { id: trackId } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();

  const pointsRef  = useRef<TrackPoint[]>([]);
  const articleRef = useRef<TrackArticle[]>([]);
  const startRef   = useRef<number>(Date.now());      // Lege-Start
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const layEndRef  = useRef<number | null>(null);     // Lege-Ende → Start der Liegezeit
  const liegeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liegezeitRef  = useRef<number | null>(null);  // eingefrorene Liegezeit (min)
  const searchStartRef = useRef<number | null>(null); // Such-Start
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Such-Phase: GPS-Pfad ablaufen + Sprach-Führung
  const searchSubRef   = useRef<Location.LocationSubscription | null>(null);
  const searchPtsRef   = useRef<LatLng[]>([]);
  const walkedRef      = useRef<number>(0);            // gelaufene Meter (Suche)
  const voiceOnRef     = useRef<boolean>(SPEECH_AVAILABLE); // Spiegel für Watch-Closure
  const lastSpeakRef   = useRef<number>(0);            // letzte Ansage (ms)
  const spokenDistRef  = useRef<number>(0);            // letzter angesagter Meilenstein
  const deviationActiveRef = useRef<boolean>(false);   // läuft gerade abseits?
  const articleNearRef = useRef<boolean>(false);       // gerade nah an Gegenstand?

  const [phase,       setPhase]       = useState<'legen' | 'liegezeit' | 'suche' | 'abschluss'>('legen');
  const [displayPts,  setDisplayPts]  = useState<{ lat: number; lng: number }[]>([]);
  const [searchPts,   setSearchPts]   = useState<{ lat: number; lng: number }[]>([]); // Suchweg (gold)
  const [articles,    setArticles]    = useState<TrackArticle[]>([]);
  const [elapsed,     setElapsed]     = useState(0);   // Lege-Dauer
  const [distanz,     setDistanz]     = useState(0);
  const [gpsOk,       setGpsOk]       = useState(false);
  const [accuracy,    setAccuracy]    = useState<number | null>(null);
  const [liegeElapsed, setLiegeElapsed] = useState(0);
  const [liegeRunning, setLiegeRunning] = useState(false);
  const [sucheElapsed, setSucheElapsed] = useState(0); // Such-Dauer (live)
  const [sucheDist,    setSucheDist]    = useState(0);  // gelaufene Meter (Suche)
  const [voiceOn,      setVoiceOn]      = useState(SPEECH_AVAILABLE);
  const [objModal,    setObjModal]    = useState(false);
  const [objSelect,   setObjSelect]   = useState(false); // Auswahl „welches Objekt gefunden?"
  const [foundIdx,    setFoundIdx]    = useState<number | null>(null); // Gefunden-Overlay
  const [star,        setStar]        = useState<number>(0);
  const [notes,       setNotes]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [mapType,     setMapType]     = useState<MapType>('satellite');

  const articlesForMap = articles.map(a => ({ lat: a.lat, lng: a.lng, typ: a.typ, gefunden: a.gefunden }));

  // Aktuelle Position (letzter Suchpunkt) + nächstes offenes Objekt.
  const currentPos = searchPts.length ? searchPts[searchPts.length - 1] : (displayPts.length ? displayPts[displayPts.length - 1] : null);
  const offeneObjekte = articles
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !a.gefunden && a.typ === 'gegenstand' && a.lat != null && a.lng != null);
  const nextObj = (() => {
    if (!currentPos || offeneObjekte.length === 0) return null;
    let best = offeneObjekte[0]; let bestD = Infinity;
    for (const o of offeneObjekte) {
      const d = distanceM(currentPos, { lat: o.a.lat as number, lng: o.a.lng as number });
      if (d < bestD) { bestD = d; best = o; }
    }
    return { ...best, dist: Math.round(bestD) };
  })();
  const goalPoint = displayPts.length ? displayPts[displayPts.length - 1] : null;

  const pathSize       = Math.min(width - 40, 360);
  const gefundenCount  = articles.filter(a => a.gefunden).length;

  // GPS-Punkte aus dem (ggf. Hintergrund-)Recorder in die bestehende Logik
  // spiegeln, damit Anzeige, Gegenstände & Speichern unverändert funktionieren.
  const rec = useRecorder();
  useEffect(() => {
    pointsRef.current = rec.points;
    if (rec.points.length > 0) {
      setGpsOk(true);
      setAccuracy(rec.accuracy);
      const pts = rec.points.map(p => ({ lat: p.lat, lng: p.lng }));
      setDisplayPts(pts);
      setDistanz(Math.round(totalDistance(pts)));
    }
  }, [rec]);

  // Phase „legen": Aufzeichnung starten (Hintergrund wenn möglich) + Lege-Timer
  useEffect(() => {
    if (phase !== 'legen') return;
    resetRecorder();
    startRecording().then(res => {
      if (!res.ok) {
        Alert.alert('GPS freischalten', 'Bitte erlaube den Standortzugriff: Einstellungen → ANYVO → Standort.');
      }
    });
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Phase „liegezeit": manueller Timer (Nutzer startet/stoppt die Liegezeit).
  useEffect(() => {
    if (phase !== 'liegezeit' || !liegeRunning) return;
    liegeTimerRef.current = setInterval(() => setLiegeElapsed(s => s + 1), 1000);
    return () => { if (liegeTimerRef.current) clearInterval(liegeTimerRef.current); };
  }, [phase, liegeRunning]);

  // Phase „suche": Such-Dauer hochzählen ab Such-Start (Zeitstempel-basiert).
  useEffect(() => {
    if (phase !== 'suche' || searchStartRef.current == null) return;
    const tick = () => setSucheElapsed(Math.floor((Date.now() - searchStartRef.current!) / 1000));
    tick();
    searchTimerRef.current = setInterval(tick, 1000);
    return () => { if (searchTimerRef.current) clearInterval(searchTimerRef.current); };
  }, [phase]);

  // Deutsche Ansage (entprellt via lastSpeakRef in der Auswertung).
  const speak = useCallback((msg: string) => {
    if (!voiceOnRef.current) return;
    lastSpeakRef.current = Date.now();
    speakNow(msg);
  }, []);

  // Wird bei jedem GPS-Fix während der Suche aufgerufen: Pfad aufzeichnen,
  // gelaufene Distanz zählen und passende Sprach-Führung auslösen.
  const onSearchPosition = useCallback((loc: Location.LocationObject) => {
    const cur: LatLng = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    const pts = searchPtsRef.current;
    if (pts.length > 0) walkedRef.current += distanceM(pts[pts.length - 1], cur);
    pts.push(cur);
    setSucheDist(Math.round(walkedRef.current));
    setSearchPts(pts.map(p => ({ lat: p.lat, lng: p.lng })));

    if (!voiceOnRef.current) return;
    const now   = Date.now();
    const since = now - lastSpeakRef.current;

    const laid: LatLng[] = pointsRef.current.map(p => ({ lat: p.lat, lng: p.lng }));
    const { dist: dev, side } = deviationFromTrack(cur, laid);

    const offene = articleRef.current
      .filter(a => !a.gefunden && a.typ === 'gegenstand' && a.lat != null && a.lng != null)
      .map(a => ({ lat: a.lat as number, lng: a.lng as number }));
    const artDist = nearestArticleDist(cur, offene);

    // 1) Gegenstand ganz nah (höchste Priorität).
    if (artDist < 5) {
      if (!articleNearRef.current && since > 6000) {
        articleNearRef.current = true;
        speak('Achtung, Gegenstand ganz in der Nähe.');
      }
      return;
    }
    if (artDist > 8) articleNearRef.current = false;

    // 2) Abweichung von der Fährte.
    if (dev > 8 && since > 7000) {
      deviationActiveRef.current = true;
      speak(`Du weichst ${Math.round(dev)} Meter${side ? ' nach ' + side : ''} ab.`);
      return;
    }
    if (dev < 3 && deviationActiveRef.current && since > 5000) {
      deviationActiveRef.current = false;
      speak('Wieder auf der Fährte.');
      return;
    }

    // 3) Distanz-Meilensteine alle 25 m (nur wenn auf der Fährte).
    const milestone = Math.floor(walkedRef.current / 25) * 25;
    if (milestone >= 25 && milestone > spokenDistRef.current && dev <= 8 && since > 5000) {
      spokenDistRef.current = milestone;
      speak(`${milestone} Meter gelaufen.`);
    }
  }, [speak]);

  // Such-Phase: GPS-Pfad aufzeichnen + Sprach-Führung (Vordergrund).
  useEffect(() => {
    if (phase !== 'suche') return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1500, distanceInterval: 1 },
        onSearchPosition,
      );
      searchSubRef.current = sub;
    })();
    speak('Suche gestartet. Lauf der Fährte.');
    return () => {
      sub?.remove();
      searchSubRef.current = null;
      stopSpeech();
    };
  }, [phase, onSearchPosition, speak]);

  // voiceOn-State in Ref spiegeln (für die GPS-Closure) + bei Aus sofort stoppen.
  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn) stopSpeech();
  }, [voiceOn]);

  // Android-Zurück abfangen
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { confirmAbort(); return true; });
    return () => handler.remove();
  }, []);

  const confirmAbort = () => {
    Alert.alert('Abbrechen?', 'Die bisher gelegte Fährte geht verloren.', [
      { text: 'Weiter', style: 'cancel' },
      { text: 'Abbrechen', style: 'destructive', onPress: () => {
        stopRecording();
        resetRecorder();
        searchSubRef.current?.remove();
        stopSpeech();
        if (timerRef.current) clearInterval(timerRef.current);
        if (liegeTimerRef.current) clearInterval(liegeTimerRef.current);
        if (searchTimerRef.current) clearInterval(searchTimerRef.current);
        router.back();
      }},
    ]);
  };

  // Gegenstand/Verleitung an aktueller GPS-Position ablegen (Material → notiz)
  const dropArticle = (material: string, typ: 'gegenstand' | 'verleitung') => {
    if (pointsRef.current.length === 0) {
      Alert.alert('Noch kein GPS', 'Warte kurz, bis das GPS-Signal steht.');
      return;
    }
    const last = pointsRef.current[pointsRef.current.length - 1];
    articleRef.current.push({
      lat: last.lat, lng: last.lng, gefunden: false, typ, notiz: material, seq_index: last.seq,
    });
    setArticles([...articleRef.current]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setObjModal(false);
  };

  // Legen abschließen → Liegezeit startet
  const finishLegen = () => {
    Alert.alert('Fährte gelegt?', 'Danach läuft die Liegezeit automatisch.', [
      { text: 'Weiter legen', style: 'cancel' },
      { text: 'Fertig gelegt', onPress: () => {
        stopRecording();
        if (timerRef.current) clearInterval(timerRef.current);
        layEndRef.current = Date.now();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPhase('liegezeit');
      }},
    ]);
  };

  // Suche starten → Liegezeit einfrieren, in die Such-Phase wechseln (Fährte ablaufen).
  const startSuche = () => {
    if (liegeTimerRef.current) clearInterval(liegeTimerRef.current);
    setLiegeRunning(false);
    liegezeitRef.current = Math.round(liegeElapsed / 60);
    searchStartRef.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('suche');
  };

  // „Abschließen" → Suche stoppen, in die Abschluss-Phase wechseln.
  const goToAbschluss = () => {
    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    searchSubRef.current?.remove();
    searchSubRef.current = null;
    stopSpeech();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('abschluss');
  };

  // Ein Objekt als gefunden markieren (öffnet das Gefunden-Overlay, Screen 3).
  const markGefunden = (index: number) => {
    const a = articleRef.current[index];
    if (!a || a.gefunden) return;
    a.gefunden = true;
    setArticles([...articleRef.current]);
    setObjSelect(false);
    setFoundIdx(index);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // „Objekt gefunden"-Button: bei mehreren offenen Objekten Auswahl zeigen.
  const handleObjektGefunden = () => {
    if (offeneObjekte.length === 0) { Alert.alert('Keine offenen Objekte', 'Alle Gegenstände sind bereits markiert.'); return; }
    if (offeneObjekte.length === 1) { markGefunden(offeneObjekte[0].i); return; }
    setObjSelect(true);
  };

  // Abschluss speichern (Screen 4) — inkl. Suchweg, Such-Dauer, Bewertung, Notizen.
  const saveAbschluss = async () => {
    setSaving(true);
    const layPts    = pointsRef.current.map(p => ({ lat: p.lat, lng: p.lng }));
    const finalDist = Math.round(totalDistance(layPts));
    const searchPoints = searchPtsRef.current.map((p, i) => ({
      lat: p.lat, lng: p.lng, accuracy_m: null, altitude_m: null,
      timestamp: new Date().toISOString(), seq: i,
    }));

    const { error } = await finishTrackSession(
      trackId,
      {
        distanz_m: finalDist, dauer_sec: elapsed,
        rating: star || null, notizen: notes.trim() || null,
        liegezeit_min: liegezeitRef.current,
        such_dauer_sec: sucheElapsed, such_distanz_m: Math.round(walkedRef.current),
      },
      pointsRef.current,
      articleRef.current,
      searchPoints,
    );
    setSaving(false);
    if (error) { Alert.alert('Fehler', `Konnte nicht gespeichert werden: ${error.message}`); return; }
    Alert.alert('Gespeichert', 'Fährte erfolgreich gespeichert! 🎉');
    router.replace(`/track/${trackId}` as never);
  };

  return (
    <>
      <Stack.Screen options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {phase === 'legen' ? (
          /* ── FÄHRTE LEGEN ── */
          <>
            <View style={s.header}>
              <TouchableOpacity style={s.abortBtn} onPress={confirmAbort} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
              <View style={s.headerCenter}>
                <View style={s.recRow}>
                  <View style={s.recDot} />
                  <Text style={s.headerLabel}>FÄHRTE LEGEN</Text>
                </View>
              </View>
              <View style={[s.gpsChip, gpsOk && s.gpsChipOk]}>
                <View style={[s.gpsDot, gpsOk && s.gpsDotOk]} />
                <Text style={[s.gpsTxt, gpsOk && s.gpsTxtOk]}>GPS</Text>
              </View>
            </View>

            <View style={s.pathWrap}>
              {MAPS_AVAILABLE ? (
                <View style={s.mapFill}>
                  <SoftBoundary
                    fallback={
                      <TrackPath points={displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={32} />
                    }
                  >
                    <TrackMap points={displayPts} articles={articlesForMap} mapType={mapType} />
                  </SoftBoundary>

                  <View style={s.mapTypeRow}>
                    {(['standard', 'satellite', 'hybrid'] as MapType[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[s.mapTypeBtn, mapType === t && s.mapTypeBtnOn]}
                        onPress={() => setMapType(t)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.mapTypeTxt, mapType === t && s.mapTypeTxtOn]}>
                          {t === 'standard' ? 'Karte' : t === 'satellite' ? 'Satellit' : 'Hybrid'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <TrackPath points={displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={32} />
              )}

              {displayPts.length === 0 && (
                <View style={s.waitingOverlay} pointerEvents="none">
                  <Ionicons name="navigate-outline" size={32} color={C.subtle} />
                  <Text style={s.waitingTxt}>Warte auf GPS…</Text>
                </View>
              )}
            </View>

            <View style={s.statsBar}>
              <View style={s.statItem}>
                <Text style={s.statVal}>{distanz}</Text>
                <Text style={s.statLbl}>METER</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statItem}>
                <Text style={s.statVal}>{fmtDuration(elapsed)}</Text>
                <Text style={s.statLbl}>LEGE-DAUER</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statItem}>
                <Text style={[s.statVal, articles.length > 0 && { color: C.accent }]}>{articles.length}</Text>
                <Text style={s.statLbl}>GEGENSTÄNDE</Text>
              </View>
            </View>

            <TouchableOpacity style={s.placeBtn} onPress={() => setObjModal(true)} activeOpacity={0.85}>
              <Ionicons name="cube" size={26} color={C.accent} />
              <Text style={s.placeTxt}>Gegenstand platzieren</Text>
              <Text style={s.placeSub}>aktuell bei {distanz} m</Text>
            </TouchableOpacity>

            <View style={s.finishWrap}>
              <TouchableOpacity style={s.finishBtn} onPress={finishLegen} activeOpacity={0.85}>
                <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />
                <Ionicons name="flag" size={20} color={C.accentText} />
                <Text style={s.finishTxt}>Fährte gelegt</Text>
              </TouchableOpacity>
            </View>

            <Modal visible={objModal} transparent animationType="slide" onRequestClose={() => setObjModal(false)}>
              <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setObjModal(false)} />
              <View style={s.modalSheet}>
                <View style={s.modalPill} />
                <Text style={s.modalTitle}>Welcher Gegenstand?</Text>
                <Text style={s.modalSub}>Position: {distanz} m</Text>
                <View style={s.modalGrid}>
                  {MATERIALS.map(m => (
                    <TouchableOpacity key={m} style={s.matBtn} onPress={() => dropArticle(m, 'gegenstand')} activeOpacity={0.8}>
                      <Text style={s.matTxt}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={s.verleitBtn} onPress={() => dropArticle('Verleitung', 'verleitung')} activeOpacity={0.8}>
                  <Ionicons name="warning-outline" size={16} color={C.danger} />
                  <Text style={s.verleitTxt}>Verleitung markieren</Text>
                </TouchableOpacity>
              </View>
            </Modal>
          </>
        ) : phase === 'liegezeit' ? (
          /* ── SCREEN 1 · BEREIT / LIEGEZEIT ── */
          <>
            <View style={s.header}>
              <TouchableOpacity style={s.abortBtn} onPress={confirmAbort} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
              <View style={s.headerCenter}><Text style={s.headerLabel}>BEREIT</Text></View>
              <View style={{ width: 36 }} />
            </View>

            <View style={s.mapArea}>
              {MAPS_AVAILABLE ? (
                <SoftBoundary fallback={<TrackPath points={displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={28} />}>
                  <TrackSearchMap layPoints={displayPts} searchPoints={[]} articles={articlesForMap} goal={goalPoint} mapType={mapType} follow={false} showUser={false} />
                </SoftBoundary>
              ) : (
                <TrackPath points={displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={28} />
              )}
              <View style={s.dimOverlay} pointerEvents="none" />
            </View>

            <View style={s.bottomPanel}>
              <View style={s.sumGrid}>
                <View style={s.sumGridItem}><Text style={s.sumGridVal}>{distanz} m</Text><Text style={s.sumGridLbl}>LÄNGE</Text></View>
                <View style={s.sumGridItem}><Text style={s.sumGridVal}>{articles.length}</Text><Text style={s.sumGridLbl}>GEGENSTÄNDE</Text></View>
                <View style={s.sumGridItem}><Text style={s.sumGridVal}>{displayPts.length}</Text><Text style={s.sumGridLbl}>GPS-PUNKTE</Text></View>
              </View>

              {!liegeRunning && liegeElapsed === 0 ? (
                <TouchableOpacity style={s.liegeBtn} onPress={() => setLiegeRunning(true)} activeOpacity={0.85}>
                  <Ionicons name="time-outline" size={20} color={C.accent} />
                  <Text style={s.liegeBtnTxt}>Liegezeit starten</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={s.liegeTimerBox}>
                    <Text style={s.liegeTimerLbl}>LIEGEZEIT</Text>
                    <Text style={s.liegeTimerVal}>{fmtDuration(liegeElapsed)}</Text>
                  </View>
                  <TouchableOpacity style={s.finishBtn} onPress={startSuche} activeOpacity={0.85}>
                    <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />
                    <Ionicons name="search" size={20} color={C.accentText} />
                    <Text style={s.finishTxt}>Suche starten</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setLiegeRunning(false); setLiegeElapsed(0); }} activeOpacity={0.7}>
                    <Text style={s.resetTxt}>Timer zurücksetzen</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        ) : phase === 'suche' ? (
          /* ── SCREEN 2 · AKTIVE SUCHE (+ SCREEN 3 Overlay) ── */
          <>
            <View style={s.header}>
              <TouchableOpacity style={s.abortBtn} onPress={confirmAbort} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
              <View style={s.headerCenter}>
                <View style={s.recRow}><View style={s.recDot} /><Text style={s.headerLabel}>SUCHE</Text></View>
              </View>
              <TouchableOpacity
                style={[s.voiceBtn, voiceOn && s.voiceBtnOn, !SPEECH_AVAILABLE && { opacity: 0.4 }]}
                onPress={() => setVoiceOn(v => !v)}
                disabled={!SPEECH_AVAILABLE}
                activeOpacity={0.7}
              >
                <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={18} color={voiceOn ? C.accent : C.muted} />
              </TouchableOpacity>
            </View>

            <View style={s.mapArea}>
              {MAPS_AVAILABLE ? (
                <SoftBoundary fallback={<TrackPath points={searchPts.length ? searchPts : displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={28} />}>
                  <TrackSearchMap layPoints={displayPts} searchPoints={searchPts} articles={articlesForMap} goal={goalPoint} mapType={mapType} />
                </SoftBoundary>
              ) : (
                <TrackPath points={searchPts.length ? searchPts : displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={28} />
              )}

              <View style={s.mapTypeRow}>
                {(['standard', 'satellite', 'hybrid'] as MapType[]).map(t => (
                  <TouchableOpacity key={t} style={[s.mapTypeBtn, mapType === t && s.mapTypeBtnOn]} onPress={() => setMapType(t)} activeOpacity={0.8}>
                    <Text style={[s.mapTypeTxt, mapType === t && s.mapTypeTxtOn]}>{t === 'standard' ? 'Karte' : t === 'satellite' ? 'Satellit' : 'Hybrid'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.statsOverlay}>
                <View style={s.statsOvItem}><Text style={s.statsOvVal}>{sucheDist} m</Text><Text style={s.statsOvLbl}>GELAUFEN</Text></View>
                <View style={s.statsOvItem}><Text style={s.statsOvVal}>{gefundenCount}/{articles.length}</Text><Text style={s.statsOvLbl}>OBJEKTE</Text></View>
                <View style={s.statsOvItem}><Text style={s.statsOvVal}>{nextObj ? `${nextObj.dist} m` : '—'}</Text><Text style={s.statsOvLbl}>NÄCHSTES</Text></View>
              </View>
            </View>

            {nextObj && currentPos && (
              <View style={s.nextObjCard}>
                <View style={s.nextObjIcon}><Ionicons name="cube-outline" size={20} color={C.warning} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nextObjTitle}>Nächstes: {nextObj.a.notiz ?? 'Gegenstand'}</Text>
                  <Text style={s.nextObjSub}>ca. {nextObj.dist} m · {getDirection(currentPos, { lat: nextObj.a.lat as number, lng: nextObj.a.lng as number })}</Text>
                </View>
                <Ionicons name="navigate" size={22} color={C.warning} />
              </View>
            )}

            <View style={s.searchBtnRow}>
              <TouchableOpacity style={s.gefundenBtn} onPress={handleObjektGefunden} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={18} color={C.white} />
                <Text style={s.gefundenBtnTxt}>Objekt gefunden</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.abschlussBtn} onPress={goToAbschluss} activeOpacity={0.85}>
                <LinearGradient colors={['#C4A800', '#C4A800']} style={StyleSheet.absoluteFill} />
                <Ionicons name="flag" size={18} color="#1A1500" />
                <Text style={s.abschlussBtnTxt}>Abschließen</Text>
              </TouchableOpacity>
            </View>

            {/* SCREEN 3 · OBJEKT GEFUNDEN (Overlay) */}
            {foundIdx != null && articleRef.current[foundIdx] && (
              <View style={s.foundOverlay}>
                <View style={s.foundCheck}><Ionicons name="checkmark" size={44} color="#001210" /></View>
                <Text style={s.foundTitle}>Objekt gefunden!</Text>
                <Text style={s.foundName}>
                  {articleRef.current[foundIdx].notiz ?? 'Gegenstand'}
                  {currentPos && articleRef.current[foundIdx].lat != null
                    ? `  ·  ${Math.round(distanceM(currentPos, { lat: articleRef.current[foundIdx].lat as number, lng: articleRef.current[foundIdx].lng as number }))} m`
                    : ''}
                </Text>
                <View style={s.pillsRow}>
                  {articles.map((a, i) => (
                    <View key={i} style={[s.pill, a.gefunden && s.pillOn]}>
                      <Text style={[s.pillTxt, a.gefunden && s.pillTxtOn]}>{i + 1}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={s.weiterBtn} onPress={() => setFoundIdx(null)} activeOpacity={0.85}>
                  <Text style={s.weiterBtnTxt}>Weiter suchen</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Auswahl: welches Objekt gefunden? */}
            <Modal visible={objSelect} transparent animationType="slide" onRequestClose={() => setObjSelect(false)}>
              <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setObjSelect(false)} />
              <View style={s.modalSheet}>
                <View style={s.modalPill} />
                <Text style={s.modalTitle}>Welches Objekt gefunden?</Text>
                {offeneObjekte.map(({ a, i }) => (
                  <TouchableOpacity key={i} style={s.objSelectBtn} onPress={() => markGefunden(i)} activeOpacity={0.8}>
                    <Text style={s.objSelectTxt}>{a.typ === 'verleitung' ? 'Verleitung' : (a.notiz ?? 'Gegenstand')} #{i + 1}</Text>
                    <Text style={s.objSelectDist}>{currentPos && a.lat != null ? `${Math.round(distanceM(currentPos, { lat: a.lat as number, lng: a.lng as number }))} m` : ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Modal>
          </>
        ) : (
          /* ── SCREEN 4 · ABSCHLUSS ── */
          <>
            <View style={s.header}>
              <View style={{ width: 36 }} />
              <View style={s.headerCenter}><Text style={s.headerLabel}>ABSCHLUSS</Text></View>
              <View style={{ width: 36 }} />
            </View>

            <View style={s.mapAreaShort}>
              {MAPS_AVAILABLE ? (
                <SoftBoundary fallback={<TrackPath points={displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={28} />}>
                  <TrackSearchMap layPoints={displayPts} searchPoints={searchPts} articles={articlesForMap} goal={goalPoint} mapType={mapType} follow={false} showUser={false} />
                </SoftBoundary>
              ) : (
                <TrackPath points={displayPts} articles={articlesForMap} width={pathSize} height={pathSize} padding={28} />
              )}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.sheet} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.sheetTitle}>Fährte abgeschlossen! 🏆</Text>

              <View style={s.gridWrap}>
                {[
                  { v: `${distanz} m`,                 l: 'LÄNGE FÄHRTE' },
                  { v: `${sucheDist} m`,               l: 'LÄNGE SUCHE' },
                  { v: fmtDuration(sucheElapsed),      l: 'DAUER SUCHE' },
                  { v: `${gefundenCount}/${articles.length}`, l: 'OBJEKTE' },
                  { v: `${liegezeitRef.current ?? Math.round(liegeElapsed / 60)} min`, l: 'LIEGEZEIT' },
                  { v: String(displayPts.length),      l: 'GPS-PUNKTE' },
                ].map(g => (
                  <View key={g.l} style={s.gridItem}>
                    <Text style={s.gridVal}>{g.v}</Text>
                    <Text style={s.gridLbl}>{g.l}</Text>
                  </View>
                ))}
              </View>

              <Text style={s.feldLabel}>BEWERTUNG</Text>
              <View style={s.starsRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity key={n} onPress={() => setStar(n)} hitSlop={6} activeOpacity={0.7}>
                    <Ionicons name={n <= star ? 'star' : 'star-outline'} size={32} color={n <= star ? C.star : C.border} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.feldLabel}>NOTIZEN</Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Wie lief die Suche?"
                placeholderTextColor={C.subtle}
                multiline
              />

              <View style={s.endBtnRow}>
                <TouchableOpacity style={s.neueBtn} onPress={() => router.replace('/track/setup' as never)} activeOpacity={0.85}>
                  <Text style={s.neueBtnTxt}>Neue Fährte</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.finishBtn, { flex: 1 }, saving && { opacity: 0.5 }]} onPress={saveAbschluss} disabled={saving} activeOpacity={0.85}>
                  <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />
                  <Ionicons name="checkmark-circle" size={20} color={C.accentText} />
                  <Text style={s.finishTxt}>{saving ? 'Speichert…' : 'Speichern'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 30 }} />
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  abortBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel:  { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 2 },
  recRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  recDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },

  gpsChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  gpsChipOk: { borderColor: `${C.success}50`, backgroundColor: `${C.success}10` },
  gpsDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: C.subtle },
  gpsDotOk:  { backgroundColor: C.success },
  gpsTxt:    { fontSize: 10, color: C.muted, fontWeight: '700' },
  gpsTxtOk:  { color: C.success },

  pathWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, position: 'relative' },
  waitingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },

  mapFill: { position: 'absolute', top: 12, left: 20, right: 20, bottom: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0A0A10' },
  mapTypeRow: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6 },
  mapTypeBtn: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  mapTypeBtnOn: { borderColor: C.accent, backgroundColor: 'rgba(0,0,0,0.75)' },
  mapTypeTxt: { fontSize: 11, color: C.muted, fontWeight: '700' },
  mapTypeTxtOn: { color: C.accent },

  // ── Such-Flow (Screens 1–4) ──
  mapArea:      { flex: 1, position: 'relative', backgroundColor: '#0A0A10' },
  mapAreaShort: { height: 220, position: 'relative', backgroundColor: '#0A0A10' },
  dimOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.35)' },

  bottomPanel: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10, gap: 14 },
  sumGrid:     { flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 14 },
  sumGridItem: { flex: 1, alignItems: 'center', gap: 3 },
  sumGridVal:  { fontSize: 18, color: C.white, fontWeight: '900' },
  sumGridLbl:  { fontSize: 8, color: C.muted, fontWeight: '700', letterSpacing: 1 },

  liegeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: `${C.accent}55`, backgroundColor: `${C.accent}12` },
  liegeBtnTxt: { fontSize: 16, color: C.accent, fontWeight: '800' },
  liegeTimerBox: { alignItems: 'center', gap: 2 },
  liegeTimerLbl: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 2 },
  liegeTimerVal: { fontSize: 44, color: C.white, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  resetTxt:    { fontSize: 13, color: C.muted, fontWeight: '600', textAlign: 'center', paddingVertical: 4 },

  statsOverlay: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  statsOvItem:  { alignItems: 'center', minWidth: 56 },
  statsOvVal:   { fontSize: 15, color: C.white, fontWeight: '900' },
  statsOvLbl:   { fontSize: 8, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1 },

  nextObjCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: `${C.warning}40`, backgroundColor: `${C.warning}10` },
  nextObjIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${C.warning}1A` },
  nextObjTitle: { fontSize: 15, color: C.white, fontWeight: '700' },
  nextObjSub:   { fontSize: 12, color: C.muted, marginTop: 2 },

  searchBtnRow:    { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  gefundenBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 16, backgroundColor: C.danger },
  gefundenBtnTxt:  { fontSize: 15, color: C.white, fontWeight: '800' },
  abschlussBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 16, overflow: 'hidden' },
  abschlussBtnTxt: { fontSize: 15, color: '#1A1500', fontWeight: '900' },

  foundOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.92)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  foundCheck:   { width: 88, height: 88, borderRadius: 44, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  foundTitle:   { fontSize: 24, color: C.white, fontWeight: '900' },
  foundName:    { fontSize: 15, color: C.muted, fontWeight: '600' },
  pillsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginVertical: 8 },
  pill:         { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  pillOn:       { borderColor: C.success, backgroundColor: `${C.success}20` },
  pillTxt:      { fontSize: 13, color: C.muted, fontWeight: '700' },
  pillTxtOn:    { color: C.success },
  weiterBtn:    { marginTop: 8, height: 52, borderRadius: 16, borderWidth: 1, borderColor: `${C.accent}55`, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, backgroundColor: `${C.accent}12` },
  weiterBtnTxt: { fontSize: 16, color: C.accent, fontWeight: '800' },

  objSelectBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardAlt, marginBottom: 8 },
  objSelectTxt:  { fontSize: 15, color: C.white, fontWeight: '600' },
  objSelectDist: { fontSize: 13, color: C.accent, fontWeight: '700' },

  sheet:      { paddingHorizontal: 20, paddingTop: 16 },
  sheetTitle: { fontSize: 22, color: C.white, fontWeight: '900', textAlign: 'center', marginBottom: 18 },
  gridWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  gridItem:   { width: '47.5%', flexGrow: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 14, alignItems: 'center', gap: 3 },
  gridVal:    { fontSize: 19, color: C.white, fontWeight: '900' },
  gridLbl:    { fontSize: 8, color: C.muted, fontWeight: '700', letterSpacing: 1 },
  feldLabel:  { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  starsRow:   { flexDirection: 'row', gap: 10, marginBottom: 22 },
  notesInput: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, color: C.white, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 22 },
  endBtnRow:  { flexDirection: 'row', gap: 12 },
  neueBtn:    { height: 56, borderRadius: 18, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: C.cardAlt },
  neueBtnTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  waitingTxt: { fontSize: 14, color: C.subtle, fontWeight: '600' },

  statsBar: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    marginHorizontal: 20, marginBottom: 14, padding: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statVal:  { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  statLbl:  { fontSize: 8, color: C.muted, fontWeight: '700', letterSpacing: 1.2 },
  statDiv:  { width: 1, height: 32, backgroundColor: C.border, marginHorizontal: 4 },

  placeBtn: {
    marginHorizontal: 20, marginBottom: 14, alignItems: 'center', gap: 4,
    backgroundColor: `${C.accent}12`, borderWidth: 1.5, borderColor: `${C.accent}55`,
    borderRadius: 18, paddingVertical: 18,
  },
  placeTxt: { fontSize: 16, color: C.accent, fontWeight: '800', marginTop: 4 },
  placeSub: { fontSize: 12, color: C.muted, fontWeight: '600' },

  finishWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  finishBtn: {
    flexDirection: 'row', height: 58, borderRadius: 20, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  finishTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },

  // Modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34,
  },
  modalPill:  { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, color: C.white, fontWeight: '800', textAlign: 'center' },
  modalSub:   { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  modalGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  matBtn: {
    minWidth: '30%', alignItems: 'center', paddingVertical: 16, borderRadius: 14,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: `${C.accent}40`,
  },
  matTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  verleitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 13, borderRadius: 14,
    backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}40`,
  },
  verleitTxt: { fontSize: 14, color: C.danger, fontWeight: '700' },

  // Liegezeit
  liegeCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  liegeTimer:  { fontSize: 64, color: C.white, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  liegeHint:   { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },

  // Suche (Fährte ablaufen)
  voiceBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  voiceBtnOn: { borderColor: `${C.accent}55`, backgroundColor: `${C.accent}12` },
  suchePathWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  sucheHint: { fontSize: 13, color: C.muted, textAlign: 'center', paddingHorizontal: 24, marginBottom: 10 },
  sucheList: { flex: 1, marginHorizontal: 20 },
  sucheItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  sucheItemDone: { borderColor: `${C.success}55`, backgroundColor: `${C.success}10` },
  sucheItemTxt:  { flex: 1, fontSize: 14, color: C.muted, fontWeight: '600' },
  sucheEmpty:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  sucheEmptyTxt: { fontSize: 14, color: C.subtle, textAlign: 'center', lineHeight: 20 },

  summaryCard: {
    marginHorizontal: 20, marginBottom: 12, backgroundColor: C.card, borderRadius: 18,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 6,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  sumLbl: { fontSize: 13, color: C.muted, fontWeight: '600' },
  sumVal: { fontSize: 15, color: C.white, fontWeight: '800' },

  objListCard: {
    marginHorizontal: 20, marginBottom: 12, backgroundColor: C.card, borderRadius: 18,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 16,
  },
  objItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  objTyp:  { fontSize: 14, color: C.white, fontWeight: '600' },
  objIdx:  { fontSize: 12, color: C.muted, fontWeight: '700' },
});
