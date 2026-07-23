import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { usePlan } from '@/hooks/usePlan';
import { getDogById } from '@/services/dogs';
import { getDogHubExtras, getDogDocumentUrl, deleteDogDocument, type DogHubExtras } from '@/services/dogHub';
import { buildDogHubVM } from '@/features/dogs/buildDogHubVM';
import { getHeatCycles, deleteHeatCycle, predictHeat, type HeatCycle } from '@/features/dogs/heatCycles';
import { getCommands, toggleFavorite as toggleCommandFavorite, seedDemoCommands, type DogCommand } from '@/features/dogs/dogCommands';
import { useDogHubDynamic } from '@/features/dogs/useDogHubDynamic';
import { DogHubScreen, type DogHubActions } from '@/features/dogs/DogHubScreen';
import { useDogActiveFaehrte } from '@/features/tracking/hooks/useActiveFaehrte';
import { reopenTarget } from '@/features/tracking/store/activeFaehrtenModel';
import type { DogDocument, DogTrainingItem } from '@/components/dogs/types';
import type { Dog } from '@/types';

// Dünner Wrapper: lädt Hund + Trainings-Feed, baut das Dog-Hub-VM und rendert den
// DogHubScreen. Route/Params/Deep-Links bleiben unverändert (`/dog/[id]`).
export default function DogHubRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPremium } = usePlan();

  const [dog, setDog]     = useState<Dog | null>(null);
  const [loading, setLoad] = useState(true);
  const [error, setError]  = useState<string | null>(null);

  const { feed } = useTrainingFeed(id);
  const dynamic = useDogHubDynamic(id);
  const activeFaehrte = useDogActiveFaehrte(id);   // offene Fährte dieses Hundes (reaktiv)
  const lastFaehrteId = useMemo(() => feed.find(it => it.source === 'track')?.id ?? null, [feed]);   // letzte abgeschlossene Fährte
  const [extras, setExtras] = useState<DogHubExtras | null>(null);
  const [heatCycles, setHeatCycles] = useState<HeatCycle[]>([]);
  const [commands, setCommands] = useState<DogCommand[]>([]);

  useEffect(() => {
    if (!id) return;
    getDogById(id).then(({ data, error: err }) => {
      setLoad(false);
      if (err || !data) { setError(err?.message ?? 'Hund nicht gefunden'); return; }
      setDog(data as Dog);
    });
  }, [id]);

  // Extras (Ziele/Gesundheit/Dokumente) bei jedem Fokus neu laden — so erscheinen
  // frisch angelegte Einträge nach dem Zurückkommen aus den Editoren sofort.
  useFocusEffect(useCallback(() => {
    if (!id) return;
    getDogHubExtras(id).then(setExtras).catch(() => setExtras(null));
    getHeatCycles(id).then(setHeatCycles).catch(() => setHeatCycles([]));
    getCommands(id).then(setCommands).catch(() => setCommands([]));
  }, [id]));

  const vm = useMemo(() => (dog ? buildDogHubVM(dog, feed, extras ?? undefined, dynamic) : null), [dog, feed, extras, dynamic]);
  const heatPrediction = useMemo(() => predictHeat(heatCycles), [heatCycles]);

  const deleteHeat = (c: HeatCycle) => {
    Alert.alert('Läufigkeit löschen?', 'Der Eintrag wird entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deleteHeatCycle(c.id);
        getHeatCycles(id).then(setHeatCycles).catch(() => {});
      } },
    ]);
  };

  const reloadCommands = () => getCommands(id).then(setCommands).catch(() => {});
  const toggleCmdFav = async (c: DogCommand) => { await toggleCommandFavorite(id, c.id); reloadCommands(); };
  const seedCmds = async () => { await seedDemoCommands(id); reloadCommands(); };

  const openDocument = async (doc: DogDocument) => {
    if (!doc.fileUrl) return;
    const url = await getDogDocumentUrl(doc.fileUrl);
    if (url) Linking.openURL(url).catch(() => {});
  };

  const deleteDocument = (doc: DogDocument) => {
    Alert.alert('Dokument löschen?', `„${doc.title}" wird dauerhaft entfernt.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deleteDogDocument(doc.id, doc.fileUrl);
        getDogHubExtras(id).then(setExtras).catch(() => {});   // Liste sofort aktualisieren
      } },
    ]);
  };

  const openTraining = (it: DogTrainingItem) => {
    if      (it.source === 'unit')  router.push({ pathname: '/unit/detail', params: { id: it.id } });
    else if (it.source === 'track') router.push(`/track/${it.id}` as never);
    else                            router.push(`/training/${it.id}` as never);
  };

  const actions: DogHubActions = {
    onBack:             () => router.back(),
    onSettings:         () => dog && router.push({ pathname: '/edit-dog', params: { id: dog.id } }),
    // KI-Hinweis: direkt in den Trainings-Timer (Hund + vorgeschlagene Sparte
    // bereits bekannt) → danach Dokumentation. NICHT mehr über den alten Sparten-Screen.
    // Ausnahme Fährte: die braucht den GPS-Fährtenflow, nicht den normalen Timer.
    onStartTraining:    (discipline, note) => {
      if (discipline === 'Fährte') { if (dog) router.push(`/track/legen?dogId=${dog.id}` as never); return; }
      router.push({
        pathname: '/unit/timer',
        params: {
          ...(dog ? { dogId: dog.id, dogName: dog.name } : {}),
          ...(discipline ? { discipline } : {}),
          ...(note ? { note } : {}),
          source: 'ai_suggestion',
        },
      });
    },
    onStartFaehrte:     () => dog && router.push(`/track/legen?dogId=${dog.id}` as never),
    // Schnellstart-Kachel: konkreter Hund → Timer mit Sparte (Fährte weiter in den
    // GPS-Flow). Sparten ohne Disziplin (Spiel/Custom) → allgemeines Training.
    onQuickAction:      (k) => {
      if (k === 'faehrte') { if (dog) router.push(`/track/legen?dogId=${dog.id}` as never); return; }
      const label = k === 'unterordnung' ? 'Unterordnung' : k === 'schutzdienst' ? 'Schutzdienst' : null;
      router.push({
        pathname: '/unit/timer',
        params: {
          ...(dog ? { dogId: dog.id, dogName: dog.name } : {}),
          ...(label ? { discipline: label } : {}),
          source: 'dog_quickstart',
        },
      });
    },
    onOpenTraining:     openTraining,
    onAddHealth:        () => dog && router.push(`/dog-health/${dog.id}` as never),
    onAddDoc:           () => dog && router.push(`/dog-document/${dog.id}` as never),
    onOpenDocument:     openDocument,
    onDeleteDocument:   deleteDocument,
    onEditGoal:         () => dog && router.push(`/dog-goal/${dog.id}` as never),
    onChat:             () => router.push('/chat' as never),
    onUpgrade:          () => router.push('/premium' as never),
  };

  if (loading) {
    return <View style={s.mitte}><ActivityIndicator size="large" color={C.trackPrimary} /></View>;
  }
  if (error || !vm) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.mitte}>
          <Text style={s.err}>{error ?? 'Hund nicht gefunden'}</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.back}><Text style={s.backTxt}>Zurück</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <DogHubScreen
      vm={vm}
      actions={actions}
      aiUnlocked={isPremium}
      heat={{
        cycles: heatCycles,
        prediction: heatPrediction,
        onAdd: () => router.push(`/dog-heat/${id}` as never),
        onDelete: deleteHeat,
      }}
      commands={{
        commands,
        onAdd: () => router.push({ pathname: '/dog-command/add', params: { dogId: id } } as never),
        onOpen: (c) => router.push({ pathname: '/dog-command/detail', params: { dogId: id, commandId: c.id } } as never),
        onToggleFavorite: toggleCmdFav,
        onSeedDemo: seedCmds,
      }}
      activeFaehrte={activeFaehrte}
      onOpenFaehrte={activeFaehrte ? () => router.push(reopenTarget(activeFaehrte) as never) : undefined}
      lastFaehrteId={lastFaehrteId}
      onOpenLastFaehrte={lastFaehrteId ? () => router.push(`/track/${lastFaehrteId}` as never) : undefined}
    />
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.trackBg },
  mitte:  { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  err:    { fontSize: 15, color: C.trackTextSec, textAlign: 'center', marginBottom: 16 },
  back:   { paddingVertical: 10, paddingHorizontal: 20 },
  backTxt:{ fontSize: 14, color: C.trackPrimary, fontWeight: '700' },
});
