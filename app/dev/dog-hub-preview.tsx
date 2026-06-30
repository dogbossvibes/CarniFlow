import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '@/constants/colors';
import { DogHeroCard } from '@/components/dogs/DogHeroCard';
import { DogCompactCard } from '@/components/dogs/DogCompactCard';
import { DogSmartCard } from '@/components/dogs/DogSmartCard';
import { DogHubStatsGrid } from '@/components/dogs/DogHubStatsGrid';
import { DogQuickActions } from '@/components/dogs/DogQuickActions';
import { DogTrainingList } from '@/components/dogs/DogTrainingList';
import { DogFaehrteSummary } from '@/components/dogs/DogFaehrteSummary';
import { DogGoalsCard } from '@/components/dogs/DogGoalsCard';
import { DogHealthLoadCard } from '@/components/dogs/DogHealthLoadCard';
import { DogDocumentsCard } from '@/components/dogs/DogDocumentsCard';
import { DogTrainerCard } from '@/components/dogs/DogTrainerCard';
import { DogAiCoachCard } from '@/components/dogs/DogAiCoachCard';
import { DogHubScreen, type DogHubActions } from '@/features/dogs/DogHubScreen';
import { DEMO_DOGS } from '@/features/dogs/demoDogs';
import type { DogHubVM } from '@/components/dogs/types';

// ⚠️ NUR DEV/Demo. Galerie aller Dog-Hub-Komponenten mit Demo-Daten
// (Malu/Nero/Inari). Keine echten Daten, keine Backend-Aufrufe.
const noop = () => {};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.section}>{title}</Text>
      {children}
    </View>
  );
}

export default function DogHubPreviewScreen() {
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
      onQuickAction: noop, onAddHealth: noop, onAddDoc: noop, onOpenDocument: noop, onEditGoal: noop, onChat: noop, onUpgrade: noop,
    };
    return <DogHubScreen vm={hub} actions={actions} aiUnlocked />;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>Dog Hub – Preview</Text>
        <Text style={s.sub}>DEV-only · Demo-Daten · tippe eine Karte für den vollen Hub</Text>

        <Section title="Hero Dog Card">
          <DogHeroCard identity={malu.identity} lastTrainingLabel={malu.lastTrainingLabel} todayRecommendation={malu.todayRecommendation} onStartTraining={noop} onPress={() => setHub(malu)} />
        </Section>

        <Section title="Compact Dog Cards">
          {[malu, nero, inari].map(d => (
            <DogCompactCard key={d.identity.id} identity={d.identity} lastTrainingLabel={d.lastTrainingLabel}
              onOpen={() => setHub(d)} onTraining={noop} onFaehrte={noop} onStats={() => setHub(d)} />
          ))}
        </Section>

        <Section title="Smart Card (mit / ohne KI-Daten)">
          <DogSmartCard tip={malu.aiTip} onStart={noop} />
          <DogSmartCard tip={null} onStart={noop} />
        </Section>

        <Section title="Bento-Stats">
          <DogHubStatsGrid stats={malu.stats} columns={2} />
        </Section>

        <Section title="Schnellstart (Training)">
          <DogQuickActions onSelect={noop} />
        </Section>

        <Section title="Letzte Trainings">
          <DogTrainingList items={malu.recentTrainings} onShowAll={noop} />
          <DogTrainingList items={[]} onShowAll={noop} />
        </Section>

        <Section title="Fährte (mit / ohne Daten)">
          <DogFaehrteSummary data={malu.faehrte} onStart={noop} />
          <DogFaehrteSummary data={nero.faehrte} onStart={noop} />
        </Section>

        <Section title="Ziele (gesetzt / leer)">
          <DogGoalsCard goal={malu.goal} onEdit={noop} />
          <DogGoalsCard goal={nero.goal} onEdit={noop} />
        </Section>

        <Section title="Gesundheit & Belastung">
          <DogHealthLoadCard health={malu.health} onAddEntry={noop} />
          <DogHealthLoadCard health={inari.health} onAddEntry={noop} />
        </Section>

        <Section title="Dokumente">
          <DogDocumentsCard documents={malu.documents} onAdd={noop} />
        </Section>

        <Section title="Trainer (verknüpft / leer)">
          <DogTrainerCard trainer={malu.trainer} onChat={noop} />
          <DogTrainerCard trainer={inari.trainer} onChat={noop} />
        </Section>

        <Section title="KI-Coach (entsperrt / gesperrt)">
          <DogAiCoachCard tip={malu.aiTip} isUnlocked onStart={noop} onUpgrade={noop} />
          <DogAiCoachCard tip={malu.aiTip} isUnlocked={false} onStart={noop} onUpgrade={noop} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted:   { fontSize: 14, color: C.trackTextMut },
  scroll:  { padding: 16, gap: 18, paddingBottom: 56 },
  h1:      { fontSize: 26, color: C.trackText, fontWeight: '900', letterSpacing: -0.6 },
  sub:     { fontSize: 12, color: C.trackTextMut, fontWeight: '700', marginTop: -10 },
  section: { fontSize: 12, color: C.trackPrimary, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
});
