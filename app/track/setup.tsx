import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { TrackSlider } from '@/features/tracking/components/TrackSlider';
import { Field, Stepper, Toggle, WeatherStrip } from '@/features/tracking/components/PlanControls';
import { FaehrtenHeader, SectionLabel } from '@/features/tracking/components/FaehrtenChrome';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { getLiveConditions, type LiveConditions } from '@/services/weatherService';
import { createTrackSession } from '@/features/tracking/services/trackService';

const AGES = [{ k: '30 min', m: 30 }, { k: '1 h', m: 60 }, { k: '2 h', m: 120 }, { k: '3 h', m: 180 }];
const SURFACES = ['Acker', 'Wiese', 'Wald', 'Mischung'];

interface Plan { length: number; angles: number; objects: number; age: number; surface: string; distraction: boolean }

export default function TrackPlanenScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { dogs } = useDogs();
  const params = useLocalSearchParams<{ dogId?: string }>();

  const [dogId, setDogId] = useState<string | null>(params.dogId ?? null);
  const [plan, setPlan]   = useState<Plan>({ length: 600, angles: 3, objects: 3, age: 60, surface: 'Acker', distraction: true });
  const [wx, setWx]       = useState<LiveConditions | null>(null);
  const [saving, setSaving] = useState(false);

  const activeDog = dogs.find(d => d.id === dogId) ?? dogs[0] ?? null;

  useEffect(() => { getLiveConditions().then(setWx); }, []);

  const upd = <K extends keyof Plan>(k: K, v: Plan[K]) => setPlan(p => ({ ...p, [k]: v }));
  const ageLabel = AGES.find(a => a.m === plan.age)?.k ?? `${plan.age} min`;

  const previewCells: [string, string][] = [
    [`${plan.length}`, 'Länge'],
    [`${plan.angles} Winkel`, 'Verlauf'],
    [`${plan.objects} Gegenst.`, 'Apportier'],
    [ageLabel, 'Alter'],
  ];

  const create = async (): Promise<string | null> => {
    const uid = session?.user.id;
    if (!uid || !activeDog) { Alert.alert('Hund wählen', 'Bitte zuerst einen Hund auswählen.'); return null; }
    setSaving(true);
    const { data, error } = await createTrackSession(uid, {
      dogId: activeDog.id,
      surfaceTypes: [plan.surface],
      terrainConditions: [],
      lyingTimeMinutes: plan.age,
      notes: null,
      locationName: wx?.location || null,
      temperature: wx?.temp ?? null,
      weatherCondition: wx ? `${wx.emoji} ${wx.temp ?? '–'}°C` : null,
      latitude: wx?.lat ?? null,
      longitude: wx?.lng ?? null,
      plannedLengthSteps: plan.length,
      corners: plan.angles,
      articles: plan.objects,
      distraction: plan.distraction,
      humidity: wx?.humidity ?? null,
      windSpeed: wx?.windSpeed ?? null,
    });
    setSaving(false);
    if (error || !data) { Alert.alert('Fehler', error ?? 'Fährte konnte nicht angelegt werden.'); return null; }
    return data.id;
  };

  const onLive  = async () => { const id = await create(); if (id) router.replace(`/track/record?id=${id}` as never); };
  const onDraft = async () => { const id = await create(); if (id) router.replace('/track' as never); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FaehrtenHeader title="FÄHRTE PLANEN" onBack={() => router.back()} dog={activeDog} dogs={dogs} onDog={setDogId} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Vorschau */}
        <View style={[s.card, s.cardGlow, { padding: 0, overflow: 'hidden', marginBottom: 16 }]}>
          <View style={s.preview}>
            <TrackSketch legs={plan.angles} objects={plan.objects} w={320} h={188} progress={1} showLabels />
          </View>
          <View style={s.previewFooter}>
            {previewCells.map((c, i) => (
              <View key={i} style={[s.previewCell, i > 0 && s.previewDivider]}>
                <Text style={s.previewVal}>{c[0]}</Text>
                <Text style={s.previewLabel}>{c[1]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Parameter */}
        <SectionLabel>Parameter</SectionLabel>
        <View style={{ gap: 11 }}>
          <View style={[s.card, { padding: 16 }]}>
            <View style={s.lenHead}>
              <Text style={s.lenLabel}>Länge</Text>
              <Text style={s.lenVal}>{plan.length} <Text style={s.lenUnit}>Schritt</Text></Text>
            </View>
            <TrackSlider value={plan.length} min={200} max={1500} step={50} onChange={v => upd('length', v)} minLabel="200" maxLabel="1500" />
          </View>
          <Field icon="git-branch" label="Winkel" hint="Anzahl Richtungswechsel">
            <Stepper value={plan.angles} set={v => upd('angles', v)} min={0} max={5} />
          </Field>
          <Field icon="flag" label="Gegenstände" hint="Apportierstücke auf der Fährte">
            <Stepper value={plan.objects} set={v => upd('objects', v)} min={0} max={5} />
          </Field>
        </View>

        {/* Liegezeit */}
        <View style={{ height: 18 }} />
        <SectionLabel>Liegezeit</SectionLabel>
        <View style={s.chipRow}>
          {AGES.map(a => {
            const on = plan.age === a.m;
            return (
              <TouchableOpacity key={a.m} style={[s.chip, on && s.chipOn]} onPress={() => upd('age', a.m)} activeOpacity={0.8}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{a.k}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Untergrund */}
        <View style={{ height: 18 }} />
        <SectionLabel>Untergrund</SectionLabel>
        <View style={s.chipRow}>
          {SURFACES.map(srf => {
            const on = plan.surface === srf;
            return (
              <TouchableOpacity key={srf} style={[s.chip, on && s.chipOn]} onPress={() => upd('surface', srf)} activeOpacity={0.8}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{srf}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Verleitung */}
        <View style={{ height: 18 }} />
        <Field icon="shuffle" label="Verleitung" hint="Fremdfährte kreuzen lassen">
          <Toggle on={plan.distraction} onToggle={() => upd('distraction', !plan.distraction)} />
        </Field>

        {/* Bedingungen */}
        <View style={{ height: 18 }} />
        <SectionLabel>Bedingungen</SectionLabel>
        <View style={[s.card, { padding: 16 }]}>
          <WeatherStrip wx={wx} />
          <View style={s.wxHint}>
            <Ionicons name="sparkles-outline" size={16} color={C.trackPrimary} />
            <Text style={s.wxHintTxt}>{wx?.location ? `${wx.location} — aktuelle Bedingungen.` : 'Wetter wird geladen…'}</Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <AnyvoButton label="Entwurf" variant="secondary" onPress={onDraft} disabled={saving || !activeDog} style={{ flex: 1 }} />
        <AnyvoButton label="Live starten" icon="play" onPress={onLive} loading={saving} disabled={!activeDog} style={{ flex: 1.4 }} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },

  card:     { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder },
  cardGlow: { borderColor: C.trackPrimaryDk + '38', shadowColor: C.trackPrimary, shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 5 },

  preview:      { height: 188, backgroundColor: '#08100e' },
  previewFooter:{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.trackBorder },
  previewCell:  { flex: 1, paddingVertical: 11, paddingHorizontal: 6, alignItems: 'center' },
  previewDivider:{ borderLeftWidth: 1, borderLeftColor: C.trackBorder },
  previewVal:   { fontSize: 13.5, fontWeight: '800', color: C.trackText },
  previewLabel: { fontSize: 8, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },

  lenHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  lenLabel: { fontSize: 14, fontWeight: '700', color: C.trackText },
  lenVal:   { fontSize: 17, fontWeight: '800', color: C.trackPrimary },
  lenUnit:  { fontSize: 11, color: C.trackTextSec, fontWeight: '600' },

  chipRow:  { flexDirection: 'row', gap: 8 },
  chip:     { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center' },
  chipOn:   { backgroundColor: C.trackPrimaryDk + '22', borderColor: C.trackPrimary },
  chipTxt:  { fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  chipTxtOn:{ color: C.trackPrimary, fontWeight: '700' },

  wxHint:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: C.trackBorder },
  wxHintTxt: { fontSize: 12.5, color: 'rgba(255,255,255,0.8)', flex: 1 },

  footer:  { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, borderTopWidth: 1, borderTopColor: C.trackBorder, backgroundColor: C.trackBg },
});
