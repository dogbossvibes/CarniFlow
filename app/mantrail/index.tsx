import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { listMantrails, type MantrailSummary } from '@/features/mantrailing/history';
import { mantrailStats, TRAIL_ENVIRONMENTS } from '@/features/mantrailing/model';
import { Chip, MANTRAIL_ACCENT as ACCENT } from '@/features/mantrailing/ui/controls';
import { formatTrailAge, formatPercent } from '@/features/mantrailing/format';

// Mantrailing-Übersicht (Spec 02, PR C): Trail legen, eigene Statistik, Verlauf.
// Nur lesend; IGP-Fährten erscheinen hier nie (type = 'mantrail').
export default function MantrailOverviewScreen() {
  const { t } = useT();
  const router = useRouter();
  const { session } = useSession();
  const { dogs } = useDogs();
  const uid = session?.user?.id ?? null;
  const [trails, setTrails] = useState<MantrailSummary[] | null>(null);
  const [dogFilter, setDogFilter] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!uid) return;
    let alive = true;
    void listMantrails(uid).then(list => { if (alive) setTrails(list); });
    return () => { alive = false; };
  }, [uid]));

  const shown = useMemo(() => (trails ?? []).filter(x => !dogFilter || x.dogId === dogFilter), [trails, dogFilter]);
  const stats = useMemo(() => mantrailStats(shown.filter(x => x.hasRun).map(x => ({ data: x.data, lengthM: x.dogDistanceM }))), [shown]);
  const dogName = (id: string | null) => dogs.find(d => d.id === id)?.name ?? '—';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.title}>{t('mantrail.overviewTitle')}</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity accessibilityRole="button" testID="mantrail-overview-lay" style={s.primary} onPress={() => router.push('/mantrail/legen' as never)}>
          <Ionicons name="add" size={20} color={C.bg} />
          <Text style={s.primaryText}>{t('mantrail.layTitle')}</Text>
        </TouchableOpacity>

        {dogs.length > 1 && (
          <View style={[s.chips, { marginTop: 16 }]}>
            <Chip label={t('mantrail.allDogs')} active={!dogFilter} onPress={() => setDogFilter(null)} />
            {dogs.map(d => <Chip key={d.id} label={d.name} active={dogFilter === d.id} onPress={() => setDogFilter(d.id)} />)}
          </View>
        )}

        <Text style={s.label}>{t('mantrail.statsTitle')}</Text>
        <View style={s.card} testID="mantrail-stats">
          <View style={s.row}>
            <Metric label={t('mantrail.statTrails')} value={String(stats.trails)} />
            <Metric label={t('mantrail.statFoundRate')} value={formatPercent(stats.foundRate)} />
            <Metric label={t('mantrail.statNegativeRate')} value={formatPercent(stats.negativeCorrectRate)} />
          </View>
          <View style={s.row}>
            <Metric label={t('mantrail.statAvgAge')} value={formatTrailAge(stats.avgAgeMinutes, t)} />
            <Metric label={t('mantrail.statMaxAge')} value={formatTrailAge(stats.maxAgeMinutes, t)} />
            <Metric label={t('mantrail.statLongest')} value={stats.longestM != null ? `${stats.longestM} m` : '–'} />
          </View>
          {Object.keys(stats.byEnvironment).length > 0 && (
            <Text style={s.meta}>
              {TRAIL_ENVIRONMENTS.filter(e => stats.byEnvironment[e]).map(e => `${t(`mantrail.env.${e}` as TranslationKey)} ${stats.byEnvironment[e]}`).join(' · ')}
            </Text>
          )}
        </View>

        <Text style={s.label}>{t('mantrail.historyTitle')}</Text>
        {trails == null ? <ActivityIndicator color={ACCENT} /> : shown.length === 0 ? (
          <Text style={s.meta}>{t('mantrail.historyEmpty')}</Text>
        ) : shown.map(x => (
          <TouchableOpacity key={x.id} accessibilityRole="button" style={s.item} onPress={() => router.push(`/mantrail/${x.id}` as never)}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{`${dogName(x.dogId)} · ${x.startedAt ? new Date(x.startedAt).toLocaleDateString() : '—'}`}</Text>
              <Text style={s.meta}>{[
                x.data?.result ? t(`mantrail.res.${x.data.result}` as TranslationKey) : t(x.hasRun ? 'mantrail.resultOpen' : 'mantrail.notRunYet'),
                x.data?.trailAgeMinutes != null ? formatTrailAge(x.data.trailAgeMinutes, t) : null,
                x.dogDistanceM != null ? `${Math.round(x.dogDistanceM)} m` : null,
                x.data?.negative ? t('mantrail.negative') : null,
                x.data?.doubleBlind ? t('mantrail.doubleBlind') : null,
              ].filter(Boolean).join(' · ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  title: { color: C.white, fontSize: 18, fontWeight: '800' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  primary: { minHeight: 56, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryText: { color: C.bg, fontSize: 16, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: C.white, fontSize: 20, fontWeight: '800' },
  metricLabel: { color: C.muted, fontSize: 11, marginTop: 2, textAlign: 'center' },
  meta: { color: C.muted, fontSize: 13, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  itemTitle: { color: C.white, fontSize: 15, fontWeight: '700' },
});
