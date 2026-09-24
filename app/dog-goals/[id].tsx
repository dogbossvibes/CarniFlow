import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { DogGoalsCard } from '@/components/dogs/DogGoalsCard';
import { getActiveDogGoal } from '@/services/dogHub';
import type { DogGoal } from '@/components/dogs/types';

function toGoal(row: Awaited<ReturnType<typeof getActiveDogGoal>>): DogGoal {
  return row
    ? { title: row.title, overallPct: row.overall_pct, parts: row.parts }
    : { title: null, overallPct: null, parts: [] };
}

export default function DogGoalsHub() {
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const [goal, setGoal] = useState<DogGoal>({ title: null, overallPct: null, parts: [] });
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!dogId) return;
    let active = true;
    setLoading(true);
    getActiveDogGoal(dogId).then(row => {
      if (active) setGoal(toGoal(row));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [dogId]));

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
            <Ionicons name="chevron-back" size={20} color={C.trackText} />
          </TouchableOpacity>
          <Text style={s.barTitle}>Ziele</Text>
          <View style={s.barSpacer} />
        </View>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {loading ? <ActivityIndicator color={C.trackPrimary} /> : (
            <DogGoalsCard goal={goal} onEdit={() => router.push(`/dog-goal/${dogId}` as never)} />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  barSpacer: { width: 38 },
  scroll: { padding: 16, paddingBottom: 48 },
});
