import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, BackHandler, Modal, Platform, StyleSheet,
  Text, TouchableOpacity, useWindowDimensions, View,
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
import type { TrackPoint, TrackArticle } from '@/types/tracking';

// Gegenstand-Materialien (werden in article.notiz gespeichert; typ bleibt 'gegenstand').
const MATERIALS = ['Holz', 'Leder', 'Stoff', 'Metall', 'Plastik', 'Knochen'];

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

export default function TrackRecordScreen() {
  const router = useRouter();
  const { id: trackId } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();

  const pointsRef  = useRef<TrackPoint[]>([]);
  const articleRef = useRef<TrackArticle[]>([]);
  const subRef     = useRef<Location.LocationSubscription | null>(null);
  const startRef   = useRef<number>(Date.now());      // Lege-Start
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const layEndRef  = useRef<number | null>(null);     // Lege-Ende → Start der Liegezeit
  const liegeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liegezeitRef  = useRef<number | null>(null);

  const [phase,       setPhase]       = useState<'legen' | 'liegezeit'>('legen');
  const [displayPts,  setDisplayPts]  = useState<{ lat: number; lng: number }[]>([]);
  const [articles,    setArticles]    = useState<TrackArticle[]>([]);
  const [elapsed,     setElapsed]     = useState(0);   // Lege-Dauer
  const [distanz,     setDistanz]     = useState(0);
  const [gpsOk,       setGpsOk]       = useState(false);
  const [accuracy,    setAccuracy]    = useState<number | null>(null);
  const [liegeElapsed, setLiegeElapsed] = useState(0);
  const [objModal,    setObjModal]    = useState(false);
  const [saving,      setSaving]      = useState(false);

  const pathSize = Math.min(width - 40, 360);

  // GPS-Aufzeichnung während des Legens
  const startGPS = useCallback(async () => {
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 1 },
      loc => {
        setGpsOk(true);
        setAccuracy(loc.coords.accuracy != null ? Math.round(loc.coords.accuracy) : null);
        const pt: TrackPoint = {
          lat:        loc.coords.latitude,
          lng:        loc.coords.longitude,
          accuracy_m: loc.coords.accuracy,
          altitude_m: loc.coords.altitude,
          timestamp:  new Date(loc.timestamp).toISOString(),
          seq:        pointsRef.current.length,
        };
        pointsRef.current.push(pt);
        if (pointsRef.current.length % 3 === 0 || pointsRef.current.length <= 3) {
          const pts = pointsRef.current.map(p => ({ lat: p.lat, lng: p.lng }));
          setDisplayPts(pts);
          setDistanz(Math.round(totalDistance(pts)));
        }
      },
    );
    subRef.current = sub;
  }, []);

  // Phase „legen": GPS + Lege-Timer
  useEffect(() => {
    if (phase !== 'legen') return;
    startGPS();
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => {
      subRef.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startGPS, phase]);

  // Phase „liegezeit": Count-up ab Lege-Ende (aus Zeitstempel → background-fest)
  useEffect(() => {
    if (phase !== 'liegezeit' || layEndRef.current == null) return;
    const tick = () => setLiegeElapsed(Math.floor((Date.now() - layEndRef.current!) / 1000));
    tick();
    liegeTimerRef.current = setInterval(tick, 1000);
    return () => { if (liegeTimerRef.current) clearInterval(liegeTimerRef.current); };
  }, [phase]);

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
        subRef.current?.remove();
        if (timerRef.current) clearInterval(timerRef.current);
        if (liegeTimerRef.current) clearInterval(liegeTimerRef.current);
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
        subRef.current?.remove();
        subRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        layEndRef.current = Date.now();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPhase('liegezeit');
      }},
    ]);
  };

  // Suche starten → Liegezeit einfrieren + alles speichern
  const startSucheUndSpeichern = async () => {
    if (liegeTimerRef.current) clearInterval(liegeTimerRef.current);
    liegezeitRef.current = layEndRef.current != null
      ? Math.max(0, Math.round((Date.now() - layEndRef.current) / 60000))
      : null;
    setSaving(true);

    const pts = pointsRef.current.map(p => ({ lat: p.lat, lng: p.lng }));
    const finalDist = Math.round(totalDistance(pts));

    const { error } = await finishTrackSession(
      trackId,
      { distanz_m: finalDist, dauer_sec: elapsed, rating: null, notizen: null, liegezeit_min: liegezeitRef.current },
      pointsRef.current,
      articleRef.current,
    );
    setSaving(false);

    if (error) { Alert.alert('Fehler', `Konnte nicht gespeichert werden: ${error.message}`); return; }
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
              <TrackPath
                points={displayPts}
                articles={articles.map(a => ({ lat: a.lat, lng: a.lng, typ: a.typ, gefunden: a.gefunden }))}
                width={pathSize}
                height={pathSize}
                padding={32}
              />
              {displayPts.length === 0 && (
                <View style={s.waitingOverlay}>
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
        ) : (
          /* ── LIEGEZEIT ── */
          <>
            <View style={s.header}>
              <View style={{ width: 36 }} />
              <View style={s.headerCenter}><Text style={s.headerLabel}>LIEGEZEIT</Text></View>
              <View style={{ width: 36 }} />
            </View>

            <View style={s.liegeCenter}>
              <Ionicons name="time-outline" size={40} color={C.accent} />
              <Text style={s.liegeTimer}>{fmtDuration(liegeElapsed)}</Text>
              <Text style={s.liegeHint}>
                Die Fährte liegt. Tippe „Suche starten“, sobald der Hund ansetzt — die Liegezeit wird automatisch übernommen.
              </Text>
            </View>

            <View style={s.summaryCard}>
              <View style={s.sumRow}><Text style={s.sumLbl}>Länge</Text><Text style={s.sumVal}>{distanz} m</Text></View>
              <View style={s.sumRow}><Text style={s.sumLbl}>Lege-Dauer</Text><Text style={s.sumVal}>{fmtDuration(elapsed)}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLbl}>Gegenstände</Text><Text style={s.sumVal}>{articles.length}</Text></View>
            </View>

            {articles.length > 0 && (
              <View style={s.objListCard}>
                {articles.map((a, i) => (
                  <View key={i} style={s.objItem}>
                    <Text style={s.objTyp}>
                      {a.typ === 'verleitung' ? '⚠️ Verleitung' : `📍 ${a.notiz ?? 'Gegenstand'}`}
                    </Text>
                    <Text style={s.objIdx}>#{i + 1}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.finishWrap}>
              <TouchableOpacity
                style={[s.finishBtn, saving && { opacity: 0.5 }]}
                onPress={startSucheUndSpeichern}
                disabled={saving}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />
                <Ionicons name="checkmark-circle" size={20} color={C.accentText} />
                <Text style={s.finishTxt}>{saving ? 'Wird gespeichert…' : 'Suche starten & speichern'}</Text>
              </TouchableOpacity>
            </View>
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
