import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { BadgeGroups, BadgeOverview, useBadgeT } from '@/features/badges/components';
import { useBadges } from '@/features/badges/useBadges';
import { useDogs } from '@/hooks/useDogs';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';

// Erfolge: alle Abzeichen mit Stufen I–III, optional pro Hund.
// Nur Anzeige; Berechnung in features/badges/model.ts aus vorhandenen Daten.
export default function ErfolgeScreen() {
  const router = useRouter();
  const { t: tApp } = useT();
  const t = useBadgeT();
  const [dogId, setDogId] = useState<string | null>(null);
  const { dogs } = useDogs();
  const { feed, loading, refresh: refreshFeed } = useTrainingFeed();
  const dogIds = useMemo(() => dogs.map(d => d.id), [dogs]);
  const { summary, fresh, hasActivity, markSeen, reloadExams } = useBadges({ feed, dogIds, dogId });
  const [refreshing, setRefreshing] = useState(false);

  // «Neu»-Marken bleiben während des Besuchs sichtbar und gelten beim Verlassen als gesehen.
  const markSeenRef = useRef(markSeen);
  useEffect(() => { markSeenRef.current = markSeen; }, [markSeen]);
  useFocusEffect(useCallback(() => () => markSeenRef.current(), []));

  const freshIds = useMemo(() => new Set<string>(fresh.map(b => b.def.id)), [fresh]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshFeed(), reloadExams()]); } finally { setRefreshing(false); }
  };

  const chips = [{ id: null as string | null, label: t('allDogs') }, ...dogs.map(d => ({ id: d.id as string | null, label: d.name }))];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={tApp('common.back')}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </Pressable>
        <Text style={s.title} accessibilityRole="header">{t('title')}</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>
        {dogs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {chips.map(c => {
              const active = c.id === dogId;
              return (
                <Pressable key={c.id ?? 'all'} onPress={() => setDogId(c.id)}
                  style={[s.chip, active && s.chipActive]}
                  accessibilityRole="button" accessibilityState={{ selected: active }}>
                  <Text style={[s.chipTxt, active && s.chipTxtActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {loading ? (
          <View style={s.loading}>
            <ActivityIndicator color={C.accent} />
            <Text style={s.muted}>{t('loading')}</Text>
          </View>
        ) : (
          <>
            {!hasActivity && <Text style={s.muted}>{t('empty')}</Text>}
            <BadgeOverview summary={summary} />
            <BadgeGroups summary={summary} freshIds={freshIds} />
            <Text style={s.footer}>{t('footer')}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, color: C.white, fontWeight: '800' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48, gap: 18 },
  chips: { gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.card, justifyContent: 'center' },
  chipActive: { borderColor: C.accent, backgroundColor: C.accentDim },
  chipTxt: { color: C.white, fontSize: 13, fontWeight: '600' },
  chipTxtActive: { color: C.accent, fontWeight: '700' },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  muted: { fontSize: 13, color: C.textMuted },
  footer: { fontSize: 12, lineHeight: 17, color: C.textMuted },
});
