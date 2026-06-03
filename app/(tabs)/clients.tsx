import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useClients } from '@/hooks/useTrainer';
import { respondToRequest, removeRelationship } from '@/services/coachService';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import type { ClientSummary } from '@/types/trainer';

function initial(name: string | null) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}
function formatDate(d: string | null): string {
  if (!d) return 'Noch keine geteilte Einheit';
  const [y, mo, day] = d.split('-');
  return `Zuletzt aktiv: ${day}.${mo}.${y}`;
}

export default function ClientsScreen() {
  const { clients, loading, refresh } = useClients();
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['clients'] });

  const accept = async (c: ClientSummary) => {
    tapHaptic();
    await respondToRequest(c.relationshipId, 'active');
    successHaptic();
    invalidate();
  };
  const reject = async (c: ClientSummary) => {
    tapHaptic();
    await removeRelationship(c.relationshipId);
    invalidate();
  };

  const pending = clients.filter(c => c.status === 'pending');
  const active  = clients.filter(c => c.status === 'active');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.eyebrow}>TRAINER</Text>
        <Text style={s.title}>Kunden</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : clients.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Kunden</Text>
            <Text style={s.emptyTxt}>Teile deinen Trainer-Code, damit sich Kund:innen verbinden.</Text>
          </View>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <Text style={s.section}>OFFENE ANFRAGEN</Text>
                {pending.map(c => (
                  <View key={c.relationshipId} style={s.card}>
                    <View style={[s.avatar, { backgroundColor: `${C.warning}1A` }]}>
                      <Text style={[s.avatarTxt, { color: C.warning }]}>{initial(c.name)}</Text>
                    </View>
                    <View style={s.flex}>
                      <Text style={s.name}>{c.name ?? 'Neue Anfrage'}</Text>
                      <Text style={s.sub}>möchte sich verbinden</Text>
                    </View>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => reject(c)} activeOpacity={0.8}>
                      <Ionicons name="close" size={18} color={C.danger} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.acceptBtn} onPress={() => accept(c)} activeOpacity={0.8}>
                      <Ionicons name="checkmark" size={18} color={C.accentText} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {active.length > 0 && (
              <>
                <Text style={s.section}>VERBUNDEN ({active.length})</Text>
                {active.map(c => (
                  <View key={c.relationshipId} style={s.card}>
                    <View style={s.avatar}>
                      <Text style={s.avatarTxt}>{initial(c.name)}</Text>
                    </View>
                    <View style={s.flex}>
                      <Text style={s.name}>{c.name ?? 'Kunde'}</Text>
                      <Text style={s.sub}>
                        {c.dogNames.length ? `🐾 ${c.dogNames.join(', ')}` : 'Kein Hund angelegt'}
                      </Text>
                      <View style={s.metaRow}>
                        <Text style={s.metaPill}>{c.trainingCount} Trainings</Text>
                        <Text style={s.activity}>{formatDate(c.lastActivity)}</Text>
                      </View>
                    </View>
                    <AnimatedPressable style={s.unlinkBtn} scale={0.9} onPress={() => reject(c)}>
                      <Ionicons name="link-outline" size={16} color={C.muted} />
                    </AnimatedPressable>
                  </View>
                ))}
              </>
            )}
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  section: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 18, marginBottom: 12 },

  card:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, color: C.white, fontWeight: '800' },
  name:   { fontSize: 15, color: C.white, fontWeight: '700' },
  sub:    { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 2 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  metaPill: { fontSize: 11, color: C.accentText, fontWeight: '800', backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  activity: { fontSize: 11, color: C.subtle },

  acceptBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}30`, alignItems: 'center', justifyContent: 'center' },
  unlinkBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  empty:      { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
});
