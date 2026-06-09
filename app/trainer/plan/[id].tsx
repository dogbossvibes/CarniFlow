import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useClients } from '@/hooks/useTrainer';
import { deletePlan, getPlan, updateShared } from '@/services/trainingPlanService';
import { successHaptic, tapHaptic } from '@/lib/haptics';
import type { TrainingPlan } from '@/types/trainingPlan';

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { clients } = useClients();

  const [plan, setPlan]     = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getPlan(id).then(p => { setPlan(p); setLoading(false); });
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwner = !!plan && plan.trainer_id === session?.user.id;
  const active  = clients.filter(c => c.status === 'active');

  const toggleShare = async (clientId: string) => {
    if (!plan) return;
    tapHaptic();
    const next = plan.shared_with.includes(clientId)
      ? plan.shared_with.filter(x => x !== clientId)
      : [...plan.shared_with, clientId];
    setPlan({ ...plan, shared_with: next });
    const { error } = await updateShared(plan.id, next);
    if (error) { Alert.alert('Fehler', error); load(); }
  };

  const onDelete = () => {
    if (!plan) return;
    Alert.alert('Plan löschen?', 'Dieser Trainingsplan wird unwiderruflich entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const { error } = await deletePlan(plan.id);
        if (error) { Alert.alert('Fehler', error); return; }
        successHaptic();
        router.back();
      } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{plan?.title ?? 'Plan'}</Text>
        {isOwner && (
          <TouchableOpacity style={s.delBtn} onPress={onDelete} hitSlop={8}><Ionicons name="trash-outline" size={18} color={C.danger} /></TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : !plan ? (
        <View style={s.empty}><Text style={s.emptyTxt}>Plan nicht gefunden.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.planTitle}>{plan.title}</Text>
          {plan.discipline ? <Text style={s.planDisc}>{plan.discipline}</Text> : null}

          {plan.notes ? (
            <View style={s.notesCard}>
              <Text style={s.notesTxt}>{plan.notes}</Text>
            </View>
          ) : null}

          <Text style={s.section}>SCHRITTE</Text>
          {plan.steps.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <View style={s.stepNum}><Text style={s.stepNumTxt}>{i + 1}</Text></View>
              <Text style={s.stepTxt}>{step}</Text>
            </View>
          ))}

          {isOwner && (
            <>
              <Text style={[s.section, { marginTop: 24 }]}>GETEILT MIT</Text>
              {active.length === 0 ? (
                <Text style={s.noClients}>Noch keine verbundenen Kund:innen.</Text>
              ) : (
                active.map(c => {
                  const on = plan.shared_with.includes(c.clientId);
                  return (
                    <TouchableOpacity key={c.clientId} style={[s.clientRow, on && s.clientRowOn]} onPress={() => toggleShare(c.clientId)} activeOpacity={0.8}>
                      <View style={[s.checkbox, on && s.checkboxOn]}>{on && <Ionicons name="checkmark" size={14} color={C.accentText} />}</View>
                      <Text style={s.clientName}>{c.name ?? 'Kunde'}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, color: C.white, fontWeight: '800' },
  delBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}30`, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  planTitle: { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  planDisc:  { fontSize: 14, color: C.accent, fontWeight: '700', marginTop: 4 },
  notesCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 16 },
  notesTxt:  { fontSize: 14, color: C.muted, lineHeight: 21 },
  section:   { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 22, marginBottom: 12 },
  stepRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 },
  stepNum:   { width: 26, height: 26, borderRadius: 13, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  stepNumTxt:{ fontSize: 13, color: C.accent, fontWeight: '800' },
  stepTxt:   { flex: 1, fontSize: 15, color: C.white, lineHeight: 21, paddingTop: 2 },
  noClients: { fontSize: 13, color: C.subtle, paddingVertical: 6 },
  clientRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 },
  clientRowOn: { borderColor: C.accentMid, backgroundColor: C.accentDim },
  checkbox:    { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  checkboxOn:  { backgroundColor: C.accent, borderColor: C.accent },
  clientName:  { flex: 1, fontSize: 15, color: C.white, fontWeight: '700' },
  empty:    { alignItems: 'center', marginTop: 60 },
  emptyTxt: { fontSize: 14, color: C.subtle },
});
