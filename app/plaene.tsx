import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { getSharedPlans } from '@/services/trainingPlanService';
import type { TrainingPlan } from '@/types/trainingPlan';

export default function MeinePlaeneScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [plans, setPlans]   = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!session?.user.id) return;
    setLoading(true);
    getSharedPlans(session.user.id).then(p => { setPlans(p); setLoading(false); });
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>VON DEINEM TRAINER</Text>
          <Text style={s.title}>Trainingspläne</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : plans.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="clipboard-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Pläne</Text>
            <Text style={s.emptyTxt}>Sobald deine Trainer:in einen Plan mit dir teilt, erscheint er hier.</Text>
          </View>
        ) : (
          plans.map(p => (
            <TouchableOpacity key={p.id} style={s.card} onPress={() => router.push(`/trainer/plan/${p.id}`)} activeOpacity={0.85}>
              <View style={s.cardIcon}><Ionicons name="clipboard" size={20} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{p.title}</Text>
                <Text style={s.cardSub}>{p.discipline ? `${p.discipline} · ` : ''}{p.steps.length} Schritte</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.subtle} />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
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
});
