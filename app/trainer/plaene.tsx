import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { getMyPlans } from '@/services/trainingPlanService';
import type { TrainingPlan } from '@/types/trainingPlan';

export default function TrainerPlaeneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { isTrainerModule } = useCapabilities();
  const [plans, setPlans]   = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!session?.user.id) return;
    setLoading(true);
    getMyPlans(session.user.id).then(p => { setPlans(p); setLoading(false); });
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isTrainerModule) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={s.locked}>
          <Ionicons name="lock-closed" size={32} color={C.muted} />
          <Text style={s.lockedTxt}>Trainer-Modul erforderlich</Text>
          <TouchableOpacity style={s.upgrade} onPress={() => router.push('/premium')} activeOpacity={0.85}>
            <Text style={s.upgradeTxt}>Trainer freischalten</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : plans.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="clipboard-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Pläne</Text>
            <Text style={s.emptyTxt}>Erstelle einen Trainingsplan und teile ihn mit deinen Kund:innen.</Text>
          </View>
        ) : (
          plans.map(p => (
            <TouchableOpacity key={p.id} style={s.card} onPress={() => router.push(`/trainer/plan/${p.id}`)} activeOpacity={0.85}>
              <View style={s.cardIcon}><Ionicons name="clipboard" size={20} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{p.title}</Text>
                <Text style={s.cardSub}>
                  {p.discipline ? `${p.discipline} · ` : ''}{p.steps.length} Schritte · {p.shared_with.length} geteilt
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.subtle} />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={[s.fab, { bottom: 30 + (Platform.OS === 'android' ? insets.bottom : 0) }]} onPress={() => router.push('/trainer/plan-neu')} activeOpacity={0.9}>
        <Ionicons name="add" size={24} color={C.accentText} />
        <Text style={s.fabTxt}>Neuer Plan</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.back} onPress={onBack} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.eyebrow}>TRAINER</Text>
        <Text style={s.title}>Trainingspläne</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: '#00F5D4', fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  card:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 10 },
  cardIcon:{ width: 44, height: 44, borderRadius: 13, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, color: C.white, fontWeight: '800' },
  cardSub:   { fontSize: 12, color: C.muted, marginTop: 2 },
  empty:      { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
  fab:     { position: 'absolute', right: 20, bottom: 30, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14 },
  fabTxt:  { fontSize: 15, color: C.accentText, fontWeight: '800' },
  locked:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  lockedTxt: { fontSize: 16, color: C.white, fontWeight: '700' },
  upgrade:  { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  upgradeTxt: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
