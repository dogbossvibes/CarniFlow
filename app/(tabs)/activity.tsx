import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { UnitListCard } from '@/components/training/UnitListCard';
import { useSession } from '@/hooks/useSession';
import { getConnectedActivity } from '@/services/connectionService';
import type { ActivityItem } from '@/types/trainer';

export default function ActivityScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    if (!session?.user.id) return;
    setLoading(true);
    getConnectedActivity(session.user.id).then(a => { setActivity(a); setLoading(false); });
  }, [session]));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.eyebrow}>TRAINER</Text>
        <Text style={s.title}>Aktivität</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : activity.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="newspaper-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine geteilten Einheiten</Text>
            <Text style={s.emptyTxt}>Sobald Kund:innen Trainings mit dir teilen, erscheinen sie hier.</Text>
          </View>
        ) : (
          // Tippen öffnet die read-only Trainer-Detailansicht der Kunden-Einheit.
          activity.map(u => (
            <UnitListCard
              key={u.id}
              unit={u}
              clientName={u.clientName}
              onPress={() => router.push({ pathname: '/unit/detail', params: { id: u.id, readonly: '1', clientName: u.clientName ?? '' } })}
            />
          ))
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  empty:      { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
});
