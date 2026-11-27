import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { loadMantrailDetail, type MantrailDetail } from '@/features/mantrailing/history';
import { corridorStats, MANTRAIL_CORRIDOR_M, type TrailWind } from '@/features/mantrailing/model';
import { windCompass } from '@/features/mantrailing/session';
import { formatDuration, formatPercent, formatTrailAge } from '@/features/mantrailing/format';
import { MANTRAIL_ACCENT as ACCENT } from '@/features/mantrailing/ui/controls';

// Auswertung eines Trails (Spec 02, PR C): beide Spuren auf einer Karte, Dauer, Länge,
// grösste Abweichung und Anteil «in der Nähe» (fester Korridor 25 m). Keine Winkel- oder
// Gegenstandsbewertung. Nur lesend.
export default function MantrailDetailScreen() {
  const { t } = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const trailId = typeof id === 'string' ? id : null;
  const { session } = useSession();
  const { dogs } = useDogs();
  const uid = session?.user?.id ?? null;
  const [detail, setDetail] = useState<MantrailDetail | null | undefined>(undefined);

  useEffect(() => {
    if (!uid || !trailId) return;
    let alive = true;
    void loadMantrailDetail(uid, trailId).then(d => { if (alive) setDetail(d); });
    return () => { alive = false; };
  }, [uid, trailId]);

  const stats = useMemo(() => (detail ? corridorStats(detail.dog, detail.trailer.length > 1 ? detail.trailer : null) : null), [detail]);
  const fit = useMemo(() => (detail ? [...detail.trailer, ...detail.dog] : []), [detail]);
  const d = detail?.data ?? null;
  const dogName = dogs.find(x => x.id === detail?.dogId)?.name ?? '—';
  const wind = (w: TrailWind | null) => w
    ? [windCompass(w.fromDeg), w.speedKmh != null ? `${Math.round(w.speedKmh)} km/h` : null].filter(Boolean).join(' ') : null;

  const rows: [string, string | null][] = d ? [
    [t('mantrail.result'), d.result ? t(`mantrail.res.${d.result}` as TranslationKey) : t('mantrail.resultOpen')],
    [t('mantrail.indication'), d.indication],
    [t('mantrail.trailAge'), d.trailAgeMinutes != null ? `${formatTrailAge(d.trailAgeMinutes, t)}${d.trailAgeManual ? ` (${t('mantrail.manual')})` : ''}` : null],
    [t('mantrail.windLayLabel'), wind(d.windLay)],
    [t('mantrail.windRunLabel'), wind(d.windRun)],
    [t('mantrail.scentArticle'), d.scentArticle ? (d.scentArticle === 'other' && d.scentArticleLabel ? d.scentArticleLabel : t(`mantrail.scent.${d.scentArticle}` as TranslationKey)) + (d.scentContaminated ? ` · ${t('mantrail.scentContaminated')}` : '') : null],
    [t('mantrail.environment'), [d.environment ? t(`mantrail.env.${d.environment}` as TranslationKey) : null, d.surface].filter(Boolean).join(' · ') || null],
    [t('mantrail.trailType'), [d.negative ? t('mantrail.negative') : null, d.doubleBlind ? t('mantrail.doubleBlind') : null,
      d.trailSource === 'transfer' ? t('mantrail.sourceTransfer') : d.trailSource === 'none' ? t('mantrail.sourceNone') : null].filter(Boolean).join(' · ') || null],
  ] : [];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/mantrail' as never))} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{detail ? `${dogName} · ${detail.startedAt ? new Date(detail.startedAt).toLocaleDateString() : ''}` : t('mantrail.detailTitle')}</Text>
        <View style={s.iconBtn} />
      </View>
      {detail === undefined ? <ActivityIndicator style={{ marginTop: 60 }} color={ACCENT} /> : detail === null ? (
        <Text style={[s.meta, { margin: 24 }]}>{t('mantrail.notFoundDetail')}</Text>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.map}>
            {fit.length > 0 ? (
              <TrackingMap layPoints={detail.trailer} runPoints={detail.dog} currentPosition={null} follow={false} hideControls fitToPoints={fit} />
            ) : <Text style={[s.meta, { margin: 16 }]}>{t('mantrail.noGeometry')}</Text>}
          </View>
          <Text style={s.legend}>{`┄ ${t('mantrail.legendTrailer')}   ━ ${dogName}`}</Text>
          <View style={s.grid} testID="mantrail-detail-stats">
            <Metric label={t('mantrail.duration')} value={formatDuration(detail.durationS)} />
            <Metric label={t('mantrail.dogLength')} value={stats ? `${stats.dogLengthM} m` : '–'} />
            <Metric label={t('mantrail.trailerLength')} value={stats?.trailerLengthM != null ? `${stats.trailerLengthM} m` : '–'} />
            <Metric label={t('mantrail.nearShare', { m: MANTRAIL_CORRIDOR_M })} value={formatPercent(stats?.nearShare)} />
            <Metric label={t('mantrail.maxDeviation')} value={stats?.maxDeviationM != null ? `${stats.maxDeviationM} m` : '–'} />
          </View>
          {stats?.nearShare == null && <Text style={s.meta}>{t('mantrail.noComparison')}</Text>}
          {d?.revealedEarly && <Text style={s.meta}>{t('mantrail.revealedNote')}</Text>}
          <View style={s.card}>
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <View key={k} style={s.kv}>
                <Text style={s.k}>{k}</Text>
                <Text style={s.v}>{v}</Text>
              </View>
            ))}
          </View>
          {detail.source === 'remote' && <Text style={s.meta}>{t('mantrail.fromServer')}</Text>}
        </ScrollView>
      )}
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
  title: { color: C.white, fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  map: { height: 300, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  legend: { color: C.muted, fontSize: 12, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 14 },
  metric: { width: '33.3%', alignItems: 'center' },
  metricValue: { color: C.white, fontSize: 19, fontWeight: '800' },
  metricLabel: { color: C.muted, fontSize: 11, marginTop: 2, textAlign: 'center' },
  meta: { color: C.muted, fontSize: 13, marginTop: 10 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 16, gap: 10 },
  kv: { flexDirection: 'row', gap: 12 },
  k: { color: C.muted, fontSize: 13, width: 120 },
  v: { color: C.white, fontSize: 14, flex: 1 },
});
