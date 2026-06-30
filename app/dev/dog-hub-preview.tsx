import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { DogHeroCard } from '@/components/dogs/DogHeroCard';
import { DogCompactCard } from '@/components/dogs/DogCompactCard';
import { DogSmartCard } from '@/components/dogs/DogSmartCard';
import { DogHubScreen, type DogHubActions } from '@/features/dogs/DogHubScreen';
import { DEMO_DOGS } from '@/features/dogs/demoDogs';
import type { DogHubVM } from '@/components/dogs/types';

// ⚠️ NUR DEV/Demo. Zeigt alle neuen Dog-Hub-Komponenten mit Demo-Daten
// (Malu/Nero/Inari). Keine echten Daten, keine Backend-Aufrufe.
const noop = () => {};

export default function DogHubPreviewScreen() {
  const router = useRouter();
  const [hub, setHub] = useState<DogHubVM | null>(null);
  const [malu, nero, inari] = DEMO_DOGS;

  if (!__DEV__) {
    return (
      <SafeAreaView style={s.safe}><View style={s.center}>
        <Text style={s.muted}>Nur im Entwicklungsmodus verfügbar.</Text>
      </View></SafeAreaView>
    );
  }

  if (hub) {
    const actions: DogHubActions = {
      onBack: () => setHub(null),
      onSettings: noop, onStartTraining: noop, onStartFaehrte: noop, onShowAllTrainings: noop,
      onQuickAction: noop, onAddHealth: noop, onAddDoc: noop, onEditGoal: noop, onChat: noop, onUpgrade: noop,
    };
    return <DogHubScreen vm={hub} actions={actions} aiUnlocked />;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>Dog Hub – Preview</Text>
        <Text style={s.sub}>DEV-only · Demo-Daten</Text>

        <Text style={s.section}>Hero Dog Card</Text>
        <DogHeroCard
          identity={malu.identity}
          lastTrainingLabel={malu.lastTrainingLabel}
          todayRecommendation={malu.todayRecommendation}
          onStartTraining={noop}
          onPress={() => setHub(malu)}
        />

        <Text style={s.section}>Compact Dog Cards</Text>
        {[malu, nero, inari].map(d => (
          <DogCompactCard
            key={d.identity.id}
            identity={d.identity}
            lastTrainingLabel={d.lastTrainingLabel}
            onOpen={() => setHub(d)}
            onTraining={noop} onFaehrte={noop} onStats={() => setHub(d)}
          />
        ))}

        <Text style={s.section}>Smart Dog Card</Text>
        <DogSmartCard tip={malu.aiTip} onStart={noop} />
        <DogSmartCard tip={null} onStart={noop} />

        <Text style={s.section}>DogHub-Beispiel</Text>
        <Text style={s.hint}>Tippe eine Karte oben an, um den vollständigen DogHub (alle Tabs) zu öffnen.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted:   { fontSize: 14, color: C.trackTextMut },
  scroll:  { padding: 16, gap: 12, paddingBottom: 48 },
  h1:      { fontSize: 26, color: C.trackText, fontWeight: '900', letterSpacing: -0.6 },
  sub:     { fontSize: 12, color: C.trackTextMut, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: -6, marginBottom: 4 },
  section: { fontSize: 12, color: C.trackPrimary, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12 },
  hint:    { fontSize: 13, color: C.trackTextSec },
});
