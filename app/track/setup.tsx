import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { C } from '@/constants/colors';
import { DogIcon } from '@/components/ui/DogIcon';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { createTrackSession } from '@/services/trackingService';
import { getLocationAndWeather } from '@/services/weatherService';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import type { TrackWindrichtung } from '@/types/tracking';

const UNTERGRUND = [
  'Kurzgras',
  'Hohe Wiese',
  'lockerer Acker',
  'Stoppelacker',
  'sandiger Boden',
  'Waldboden',
];

const BESCHAFFENHEIT = [
  'gefrorener Boden',
  'Schnee',
  'Nass nach Regen',
  'ebenes Gelände',
  'Hanglage',
  'unebenes Gelände',
  'Morgentau',
  'trocken',
  'harter Boden',
];

const WIND: TrackWindrichtung[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const WIND_ANGLES: Record<TrackWindrichtung, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
};

export default function TrackSetupScreen() {
  const router  = useRouter();
  const { dogs } = useDogs();
  const { session } = useSession();

  const [dogId,        setDogId]       = useState<string | null>(dogs.length === 1 ? dogs[0].id : null);
  const [surfaceTypes,       setSurfaceTypes]       = useState<string[]>([]);
  const [terrainConditions,  setTerrainConditions]  = useState<string[]>([]);
  const [windrichtung, setWind]        = useState<TrackWindrichtung | null>(null);
  const [ort,          setOrt]         = useState('');
  const [wetter,       setWetter]      = useState('');
  const [wetterLaden,  setWetterLaden] = useState(false);
  const [starten,      setStarten]     = useState(false);

  useEffect(() => {
    (async () => {
      setWetterLaden(true);
      const info = await getLocationAndWeather();
      if (info.location) setOrt(info.location);
      if (info.weather)  setWetter(info.weather);
      setWetterLaden(false);
    })();
  }, []);

  const toggleSurfaceType = (item: string) =>
    setSurfaceTypes(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item],
    );

  const toggleTerrainCondition = (item: string) =>
    setTerrainConditions(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item],
    );

  const kannStarten = !!dogId && surfaceTypes.length > 0;

  const handleStarten = async () => {
    if (!kannStarten || !session?.user.id) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('GPS benötigt', 'Bitte erlaube den Standortzugriff in den Einstellungen.');
      return;
    }

    setStarten(true);
    const { data: track, error } = await createTrackSession(session.user.id, {
      dog_id:        dogId!,
      session_date:  new Date().toISOString().split('T')[0],
      surface_types:      surfaceTypes,
      terrain_conditions: terrainConditions,
      wetter:        wetter || null,
      windrichtung,
      liegezeit_min: null,   // wird automatisch beim Start der Ausarbeitung gesetzt
      distanz_m:     null,
      dauer_sec:     null,
      rating:        null,
      notizen:       ort ? `Ort: ${ort}` : null,
    });
    setStarten(false);

    if (error || !track) {
      Alert.alert('Fehler', error?.message ?? 'Fährte konnte nicht erstellt werden.');
      return;
    }

    router.replace(`/track/record?id=${track.id}` as never);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.eyebrow}>FÄHRTENMODUL</Text>
          <Text style={s.title}>Neue Fährte</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Weather / Location chip */}
        {(wetterLaden || ort || wetter) && (
          <View style={s.metaReihe}>
            {wetterLaden ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <>
                {ort     ? <View style={s.chip}><Text style={s.chipTxt}>📍 {ort}</Text></View>     : null}
                {wetter  ? <View style={s.chip}><Text style={s.chipTxt}>{wetter}</Text></View>      : null}
              </>
            )}
          </View>
        )}

        {/* Dog selection */}
        <Text style={s.label}>HUND *</Text>
        {dogs.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTxt}>Zuerst einen Hund anlegen</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.chipScroll} contentContainerStyle={s.chipRow}>
            {dogs.map(d => {
              const aktiv = dogId === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[s.dogChip, aktiv && s.dogChipActive]}
                  onPress={() => setDogId(aktiv ? null : d.id)}
                  activeOpacity={0.75}
                >
                  {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                  <DogIcon size={13} color={aktiv ? C.accentText : C.muted} />
                  <Text style={[s.dogChipTxt, aktiv && s.dogChipTxtActive]}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Untergrund */}
        <Text style={s.label}>UNTERGRUND *</Text>
        <View style={s.selWrap}>
          {UNTERGRUND.map(item => {
            const aktiv = surfaceTypes.includes(item);
            return (
              <TouchableOpacity
                key={item}
                style={[s.selChip, aktiv && s.selChipActive]}
                onPress={() => toggleSurfaceType(item)}
                activeOpacity={0.75}
              >
                {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                <Text style={[s.selChipTxt, aktiv && s.selChipTxtActive]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Beschaffenheit */}
        <Text style={s.label}>BESCHAFFENHEIT</Text>
        <View style={s.selWrap}>
          {BESCHAFFENHEIT.map(item => {
            const aktiv = terrainConditions.includes(item);
            return (
              <TouchableOpacity
                key={item}
                style={[s.selChip, aktiv && s.selChipActive]}
                onPress={() => toggleTerrainCondition(item)}
                activeOpacity={0.75}
              >
                {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                <Text style={[s.selChipTxt, aktiv && s.selChipTxtActive]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Windrichtung compass */}
        <Text style={s.label}>WINDRICHTUNG</Text>
        <View style={s.compassWrap}>
          {WIND.map(dir => {
            const aktiv   = windrichtung === dir;
            const angle   = WIND_ANGLES[dir];
            const rad     = (angle - 90) * (Math.PI / 180);
            const r       = 56;
            const cx      = 80, cy = 80;
            const x = cx + r * Math.cos(rad) - 14;
            const y = cy + r * Math.sin(rad) - 14;
            return (
              <TouchableOpacity
                key={dir}
                style={[s.windBtn, { left: x, top: y }, aktiv && s.windBtnActive]}
                onPress={() => setWind(aktiv ? null : dir)}
                activeOpacity={0.8}
              >
                {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                <Text style={[s.windTxt, aktiv && s.windTxtActive]}>{dir}</Text>
              </TouchableOpacity>
            );
          })}
          {/* Center compass rose */}
          <View style={s.compassCenter}>
            <Ionicons
              name="navigate"
              size={22}
              color={windrichtung ? C.accent : C.subtle}
              style={windrichtung ? { transform: [{ rotate: `${WIND_ANGLES[windrichtung]}deg` }] } : undefined}
            />
          </View>
        </View>

        {/* Hinweis: Liegezeit wird nicht mehr vorgewählt — sie läuft automatisch
            ab dem Start und wird beim Beginn der Ausarbeitung übernommen. */}
        <View style={s.hintCard}>
          <Ionicons name="navigate-outline" size={18} color={C.accent} />
          <Text style={s.hintTxt}>Du legst die Fährte mit Live-GPS und platzierst Gegenstände unterwegs. Danach läuft die Liegezeit automatisch — bis du die Suche startest.</Text>
        </View>

        {/* Start button */}
        <AnimatedPressable
          style={[s.startBtn, !kannStarten && { opacity: 0.4 }]}
          onPress={handleStarten}
          disabled={!kannStarten || starten}
          scale={0.97}
        >
          <LinearGradient
            colors={kannStarten && !starten ? ['#00FFCC', '#00FFCC'] : [C.cardAlt, C.cardAlt]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          {starten ? (
            <ActivityIndicator size="small" color={C.accentText} />
          ) : (
            <View style={s.startInner}>
              <Ionicons name="navigate-circle" size={22} color={kannStarten ? C.accentText : C.muted} />
              <Text style={[s.startTxt, !kannStarten && { color: C.muted }]}>Fährte legen</Text>
            </View>
          )}
        </AnimatedPressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  metaReihe: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  chip:      { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt:   { fontSize: 12, color: C.muted, fontWeight: '600' },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 22 },

  emptyBox: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  emptyTxt: { fontSize: 13, color: C.subtle },

  chipScroll: { marginHorizontal: -20 },
  chipRow:    { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  dogChip:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden' },
  dogChipActive:   { borderColor: C.accent },
  dogChipTxt:      { fontSize: 13, color: C.muted, fontWeight: '600' },
  dogChipTxtActive:{ color: C.accentText, fontWeight: '700' },

  selWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selChip:        { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  selChipActive:  { borderColor: C.accent },
  selChipTxt:     { fontSize: 13, color: C.muted, fontWeight: '600' },
  selChipTxtActive:{ color: C.accentText, fontWeight: '700' },

  compassWrap:   { height: 188, position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  compassCenter: { position: 'absolute', left: 80-20, top: 80-20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border },
  windBtn:       { position: 'absolute', width: 28, height: 28, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  windBtnActive: { borderColor: C.accent },
  windTxt:       { fontSize: 9, color: C.muted, fontWeight: '800' },
  windTxtActive: { color: C.accentText, fontWeight: '900' },

  hintCard:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12 },
  hintTxt:     { flex: 1, fontSize: 12, color: C.muted, lineHeight: 17 },
  liegeCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 6 },
  liegeBtn:    { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  liegeCenter: { flex: 1, alignItems: 'center' },
  liegeVal:    { fontSize: 32, color: C.white, fontWeight: '900', letterSpacing: -1 },
  liegeUnit:   { fontSize: 11, color: C.muted, fontWeight: '600', marginTop: -4 },

  startBtn:    { height: 60, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  startInner:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  startTxt:    { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
