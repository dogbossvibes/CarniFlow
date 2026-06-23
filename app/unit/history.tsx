import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { UnitListCard } from '@/components/training/UnitListCard';
import { SwipeableTrainingItem } from '@/components/training/SwipeableTrainingItem';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { useFeedDelete } from '@/hooks/useFeedDelete';
import type { FeedItem } from '@/services/trainingFeed';

export default function HistoryScreen() {
  const router = useRouter();
  const { feed, loading, refresh } = useTrainingFeed();
  const { onDelete: deleteItem, toast } = useFeedDelete();

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openItem = (item: FeedItem) => {
    if      (item.source === 'unit')  router.push({ pathname: '/unit/detail', params: { id: item.id } });
    else if (item.source === 'track') router.push(`/track/${item.id}` as never);
    else                              router.push(`/training/${item.id}` as never);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </TouchableOpacity>
          <View>
            <Text style={s.eyebrow}>TRAININGSVERLAUF</Text>
            <Text style={s.title}>Einheiten</Text>
          </View>
        </View>
        <TouchableOpacity style={s.backBtn} onPress={() => router.push('/unit/stats')} activeOpacity={0.7}>
          <Ionicons name="stats-chart-outline" size={20} color={C.white} />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : feed.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="footsteps-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Einheiten</Text>
            <Text style={s.emptyTxt}>Starte dein erstes Training über das Dashboard.</Text>
          </View>
        ) : (
          feed.map(item => (
            <SwipeableTrainingItem key={`${item.source}-${item.id}`} trainingId={item.id} onDelete={() => deleteItem(item)}>
              <UnitListCard unit={item} onPress={() => openItem(item)} />
            </SwipeableTrainingItem>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
      {toast}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerLeft:{ flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  empty:      { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
});
