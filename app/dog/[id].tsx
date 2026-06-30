import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { usePlan } from '@/hooks/usePlan';
import { getDogById } from '@/services/dogs';
import { getDogHubExtras, getDogDocumentUrl, type DogHubExtras } from '@/services/dogHub';
import { buildDogHubVM } from '@/features/dogs/buildDogHubVM';
import { useDogHubDynamic } from '@/features/dogs/useDogHubDynamic';
import { DogHubScreen, type DogHubActions } from '@/features/dogs/DogHubScreen';
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
  const [extras, setExtras] = useState<DogHubExtras | null>(null);

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
  }, [id]));

  const vm = useMemo(() => (dog ? buildDogHubVM(dog, feed, extras ?? undefined, dynamic) : null), [dog, feed, extras, dynamic]);

  const openDocument = async (doc: DogDocument) => {
    if (!doc.path) return;
    const url = await getDogDocumentUrl(doc.path);
    if (url) Linking.openURL(url).catch(() => {});
  };

  const openTraining = (it: DogTrainingItem) => {
    if      (it.source === 'unit')  router.push({ pathname: '/unit/detail', params: { id: it.id } });
    else if (it.source === 'track') router.push(`/track/${it.id}` as never);
    else                            router.push(`/training/${it.id}` as never);
  };

  const actions: DogHubActions = {
    onBack:             () => router.back(),
    onSettings:         () => dog && router.push({ pathname: '/edit-dog', params: { id: dog.id } }),
    onStartTraining:    () => router.push('/unit/start'),
    onStartFaehrte:     () => dog && router.push(`/track/legen?dogId=${dog.id}` as never),
    onQuickAction:      () => router.push('/unit/start'),
    onOpenTraining:     openTraining,
    onAddHealth:        () => dog && router.push(`/dog-health/${dog.id}` as never),
    onAddDoc:           () => dog && router.push(`/dog-document/${dog.id}` as never),
    onOpenDocument:     openDocument,
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

  return <DogHubScreen vm={vm} actions={actions} aiUnlocked={isPremium} />;
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.trackBg },
  mitte:  { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  err:    { fontSize: 15, color: C.trackTextSec, textAlign: 'center', marginBottom: 16 },
  back:   { paddingVertical: 10, paddingHorizontal: 20 },
  backTxt:{ fontSize: 14, color: C.trackPrimary, fontWeight: '700' },
});
