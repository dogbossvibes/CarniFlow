import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { C } from '@/constants/colors';
import { DogIcon } from '@/components/ui/DogIcon';
import { AnyvoChip } from '@/components/ui/AnyvoChip';
import { AnyvoPill } from '@/components/ui/AnyvoPill';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { GpsQualityPill } from '@/features/tracking/components/GpsQualityPill';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { getLocationAndWeather } from '@/services/weatherService';
import { createTrackSession } from '@/features/tracking/services/trackService';
import { getGpsQuality, type GpsQuality } from '@/features/tracking/utils/gpsFilter';

const UNTERGRUND = ['Kurzgras', 'Hohe Wiese', 'lockerer Acker', 'Stoppelacker', 'sandiger Boden', 'Waldboden'];
const BESCHAFFENHEIT = ['gefrorener Boden', 'Schnee', 'Nass nach Regen', 'ebenes Gelände', 'Hanglage', 'unebenes Gelände', 'Morgentau', 'trocken', 'harter Boden'];

export default function TrackSetupScreen() {
  const router = useRouter();
  const { dogs } = useDogs();
  const { session } = useSession();

  const [dogId, setDogId]         = useState<string | null>(dogs.length === 1 ? dogs[0].id : null);
  const [surface, setSurface]     = useState<string[]>([]);
  const [terrain, setTerrain]     = useState<string[]>([]);
  const [liegezeit, setLiegezeit] = useState(90);
  const [notes, setNotes]         = useState('');
  const [ort, setOrt]             = useState('');
  const [wetter, setWetter]       = useState('');
  const [coords, setCoords]       = useState<{ lat: number; lng: number } | null>(null);
  const [gpsQ, setGpsQ]           = useState<GpsQuality | null>(null);
  const [gpsAcc, setGpsAcc]       = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    (async () => {
      const info = await getLocationAndWeather();
      if (info.location) setOrt(info.location);
      if (info.weather)  setWetter(info.weather);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
          setCoords({ lat: fix.coords.latitude, lng: fix.coords.longitude });
          setGpsAcc(fix.coords.accuracy ?? null);
          setGpsQ(getGpsQuality(fix.coords.accuracy));
        }
      } catch { /* GPS optional hier */ }
    })();
  }, []);

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  const dogName = dogs.find(d => d.id === dogId)?.name ?? '—';
  const temp = (() => { const m = wetter.match(/(-?\d+(?:[.,]\d+)?)\s*°/); return m ? parseFloat(m[1].replace(',', '.')) : null; })();
  const canStart = !!dogId && surface.length > 0;

  const handleCreate = async () => {
    if (!canStart || !session?.user.id) return;
    setSaving(true);
    const { data, error } = await createTrackSession(session.user.id, {
      dogId: dogId!, surfaceTypes: surface, terrainConditions: terrain,
      lyingTimeMinutes: liegezeit, notes: notes.trim() || null,
      locationName: ort || null, temperature: temp, weatherCondition: wetter || null,
      latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
    });
    setSaving(false);
    if (error || !data) { Alert.alert('Fehler', error ?? 'Fährte konnte nicht angelegt werden.'); return; }
    router.replace(`/track/record?id=${data.id}` as never);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.trackText} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>FÄHRTENMODUL</Text>
          <Text style={s.title}>Neue Fährte</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.pillRow}>
          {ort ? <AnyvoPill icon="location" label={ort} /> : null}
          {wetter ? <AnyvoPill icon="partly-sunny" label={wetter} /> : null}
          <GpsQualityPill quality={gpsQ} accuracy={gpsAcc} />
          <AnyvoPill icon="paw" label={dogName} tint={dogId ? C.trackPrimary : undefined} />
        </View>

        <Text style={s.label}>HUND *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={s.dogRow}>
          {dogs.length === 0 ? <Text style={s.empty}>Zuerst einen Hund anlegen</Text> :
            dogs.map(d => {
              const on = dogId === d.id;
              return (
                <TouchableOpacity key={d.id} style={[s.dogChip, on && s.dogChipOn]} onPress={() => setDogId(on ? null : d.id)} activeOpacity={0.8}>
                  <DogIcon size={13} color={on ? '#04110F' : C.trackTextSec} />
                  <Text style={[s.dogTxt, on && s.dogTxtOn]}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
        </ScrollView>

        <Text style={s.label}>UNTERGRUND *</Text>
        <View style={s.wrap}>{UNTERGRUND.map(i => <AnyvoChip key={i} label={i} active={surface.includes(i)} onPress={() => setSurface(p => toggle(p, i))} />)}</View>

        <Text style={s.label}>BESCHAFFENHEIT</Text>
        <View style={s.wrap}>{BESCHAFFENHEIT.map(i => <AnyvoChip key={i} label={i} active={terrain.includes(i)} onPress={() => setTerrain(p => toggle(p, i))} />)}</View>

        <Text style={s.label}>LIEGEZEIT</Text>
        <View style={s.stepper}>
          <TouchableOpacity style={s.stepBtn} onPress={() => setLiegezeit(v => Math.max(0, v - 5))} activeOpacity={0.8}><Ionicons name="remove" size={22} color={C.trackText} /></TouchableOpacity>
          <View style={s.stepCenter}>
            <Text style={s.stepVal}>{liegezeit}</Text>
            <Text style={s.stepUnit}>Minuten</Text>
          </View>
          <TouchableOpacity style={s.stepBtn} onPress={() => setLiegezeit(v => v + 5)} activeOpacity={0.8}><Ionicons name="add" size={22} color={C.trackText} /></TouchableOpacity>
        </View>

        <Text style={s.label}>NOTIZEN</Text>
        <TextInput style={s.notes} value={notes} onChangeText={setNotes} placeholder="Notizen zur Fährte hinzufügen…" placeholderTextColor={C.trackTextMut} multiline />

        <AnyvoButton label="Fährte anlegen" icon="navigate-circle" onPress={handleCreate} disabled={!canStart} loading={saving} big style={{ marginTop: 24 }} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.trackCardAlt, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: C.trackPrimary, fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 24, color: C.trackText, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label:   { fontSize: 10, color: C.trackTextMut, fontWeight: '700', letterSpacing: 1.5, marginTop: 22, marginBottom: 10 },
  dogRow:  { paddingHorizontal: 20, gap: 8 },
  dogChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 9 },
  dogChipOn: { borderColor: C.trackPrimary, backgroundColor: C.trackPrimary },
  dogTxt:  { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  dogTxtOn:{ color: '#04110F' },
  empty:   { fontSize: 13, color: C.trackTextMut, paddingHorizontal: 20 },
  wrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, padding: 6 },
  stepBtn: { width: 56, height: 56, borderRadius: 14, backgroundColor: C.trackCardAlt, alignItems: 'center', justifyContent: 'center' },
  stepCenter: { flex: 1, alignItems: 'center' },
  stepVal: { fontSize: 34, color: C.trackText, fontWeight: '900', letterSpacing: -1 },
  stepUnit:{ fontSize: 11, color: C.trackTextMut, fontWeight: '600', marginTop: -4 },
  notes:   { backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 14, color: C.trackText, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
});
