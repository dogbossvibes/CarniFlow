import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { Field, Toggle, WeatherStrip } from '@/features/tracking/components/PlanControls';
import { FaehrtenHeader, SectionLabel } from '@/features/tracking/components/FaehrtenChrome';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { getLiveConditions, type LiveConditions } from '@/services/weatherService';
import { createTrackSession } from '@/features/tracking/services/trackService';

const SURFACES = ['Acker', 'Wiese', 'Wald', 'Mischung'];

// Minimaler Start: Länge, Winkel, Gegenstände und Liegezeit werden NICHT geplant —
// sie entstehen live beim Legen bzw. danach. Hier nur Hund + Untergrund (+ Verleitung).
export default function TrackStartScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { dogs } = useDogs();
  const params = useLocalSearchParams<{ dogId?: string }>();

  const [dogId, setDogId]   = useState<string | null>(params.dogId ?? null);
  const [surface, setSurface] = useState('Acker');
  const [distraction, setDistraction] = useState(false);
  const [wx, setWx]       = useState<LiveConditions | null>(null);
  const [saving, setSaving] = useState(false);

  const activeDog = dogs.find(d => d.id === dogId) ?? dogs[0] ?? null;

  useEffect(() => { getLiveConditions().then(setWx); }, []);

  const start = async () => {
    const uid = session?.user.id;
    if (!uid || !activeDog) { Alert.alert('Hund wählen', 'Bitte zuerst einen Hund auswählen.'); return; }
    setSaving(true);
    const { data, error } = await createTrackSession(uid, {
      dogId: activeDog.id,
      surfaceTypes: [surface],
      terrainConditions: [],
      lyingTimeMinutes: 0,            // wird nach dem Legen gemessen
      notes: null,
      locationName: wx?.location || null,
      temperature: wx?.temp ?? null,
      weatherCondition: wx ? `${wx.emoji} ${wx.temp ?? '–'}°C` : null,
      latitude: wx?.lat ?? null,
      longitude: wx?.lng ?? null,
      distraction,
      humidity: wx?.humidity ?? null,
      windSpeed: wx?.windSpeed ?? null,
    });
    setSaving(false);
    if (error || !data) { Alert.alert('Fehler', error ?? 'Fährte konnte nicht angelegt werden.'); return; }
    router.replace(`/track/record?id=${data.id}` as never);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FaehrtenHeader title="NEUE FÄHRTE" onBack={() => router.back()} dog={activeDog} dogs={dogs} onDog={setDogId} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.card, s.intro]}>
          <View style={s.introIcon}><Ionicons name="git-branch" size={22} color={C.trackPrimary} /></View>
          <Text style={s.introTitle}>Fährte legen</Text>
          <Text style={s.introSub}>
            Länge, Winkel und Gegenstände entscheidest du live beim Legen. Tippe unten auf „Fährte legen“ und lauf los —
            Winkel und Gegenstände setzt du unterwegs als Markierung.
          </Text>
        </View>

        <SectionLabel>Untergrund</SectionLabel>
        <View style={s.chipRow}>
          {SURFACES.map(srf => {
            const on = surface === srf;
            return (
              <TouchableOpacity key={srf} style={[s.chip, on && s.chipOn]} onPress={() => setSurface(srf)} activeOpacity={0.8}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{srf}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 18 }} />
        <Field icon="shuffle" label="Verleitung" hint="Fremdfährte kreuzen lassen">
          <Toggle on={distraction} onToggle={() => setDistraction(v => !v)} />
        </Field>

        <View style={{ height: 18 }} />
        <SectionLabel>Bedingungen</SectionLabel>
        <View style={[s.card, { padding: 16 }]}>
          <WeatherStrip wx={wx} />
          <View style={s.wxHint}>
            <Ionicons name="location-outline" size={15} color={C.trackPrimary} />
            <Text style={s.wxHintTxt}>{wx?.location ? `${wx.location} — aktuelle Bedingungen.` : 'Wetter wird geladen…'}</Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={s.footer}>
        <AnyvoButton label="Fährte legen" icon="play" onPress={start} loading={saving} disabled={!activeDog} big style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },

  card:    { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder },
  intro:   { padding: 18, marginBottom: 18, alignItems: 'flex-start' },
  introIcon:{ width: 44, height: 44, borderRadius: 13, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  introTitle:{ fontSize: 18, color: C.trackText, fontWeight: '900', letterSpacing: -0.3 },
  introSub: { fontSize: 13, color: C.trackTextSec, lineHeight: 19, marginTop: 6 },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip:    { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center' },
  chipOn:  { backgroundColor: C.trackPrimaryDk + '22', borderColor: C.trackPrimary },
  chipTxt: { fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  chipTxtOn:{ color: C.trackPrimary, fontWeight: '700' },

  wxHint:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: C.trackBorder },
  wxHintTxt: { fontSize: 12.5, color: 'rgba(255,255,255,0.8)', flex: 1 },

  footer:  { flexDirection: 'row', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, borderTopWidth: 1, borderTopColor: C.trackBorder, backgroundColor: C.trackBg },
});
