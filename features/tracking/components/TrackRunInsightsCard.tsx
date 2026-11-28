import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { SectionLabel } from '@/features/tracking/components/FaehrtenChrome';
import { RUN_INSIGHTS_NS } from '@/features/tracking/insights/i18n';
import type { ElementQuality, ElevationInsight, RunInsights, VerdictLevel } from '@/features/tracking/insights/runInsights';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const LEVEL_STYLE: Record<VerdictLevel, { icon: IconName; color: string }> = {
  strong: { icon: 'trophy', color: C.trackPrimary },
  solid: { icon: 'thumbs-up', color: C.trackPrimary },
  work: { icon: 'construct', color: C.trackWarning },
  uncertain: { icon: 'cloud-offline', color: C.trackTextSec },
};

const QUALITY_COLOR: Record<ElementQuality, string> = {
  clean: C.trackPrimary,
  checked: C.trackBlue,
  overshoot: C.trackWarning,
  long_search: C.trackWarning,
  cut_inside: C.trackWarning,
  wide_outside: C.trackWarning,
  unknown: C.trackTextMut,
};

function fmt(v: number): string { return Number.isInteger(v) ? String(v) : v.toFixed(1); }

function useInsightsT() {
  return useTranslation(RUN_INSIGHTS_NS).t;
}

function Kpi({ icon, value, label, testID }: { icon: IconName; value: string; label: string; testID?: string }) {
  return (
    <View style={s.kpi} testID={testID}>
      <Ionicons name={icon} size={17} color={C.trackPrimary} />
      <Text style={s.kpiVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={s.kpiLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function QualityChip({ quality }: { quality: ElementQuality }) {
  const t = useInsightsT();
  const color = QUALITY_COLOR[quality];
  return (
    <View style={[s.chip, { borderColor: color + '66', backgroundColor: color + '1A' }]}>
      <Text style={[s.chipTxt, { color }]}>{t(`quality.${quality}`)}</Text>
    </View>
  );
}

function ElevationChart({ elevation }: { elevation: ElevationInsight }) {
  const t = useInsightsT();
  const W = 300, H = 64;
  const path = useMemo(() => {
    const pts = elevation.profile;
    const maxD = pts[pts.length - 1]?.distM || 1;
    // Mindestens 6 m Höhenspanne darstellen, sonst wirkt GPS-Rauschen wie ein Berg.
    const span = Math.max(6, elevation.maxM - elevation.minM);
    const base = (elevation.maxM + elevation.minM) / 2 - span / 2;
    const xy = pts.map(p => [(p.distM / maxD) * W, H - 4 - ((p.altM - base) / span) * (H - 8)] as const);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  }, [elevation]);
  return (
    <View accessible accessibilityLabel={t('elevationA11y', { up: elevation.ascentM, down: elevation.descentM })}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.trackPrimary} stopOpacity={0.35} />
            <Stop offset="1" stopColor={C.trackPrimary} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={path.area} fill="url(#elevFill)" />
        <Path d={path.line} stroke={C.trackPrimary} strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}

function PaceBars({ values }: { values: number[] }) {
  const t = useInsightsT();
  if (values.length < 2) return null;
  const W = 300, H = 40, gap = 3;
  const max = Math.max(...values, 0.1);
  const bw = (W - gap * (values.length - 1)) / values.length;
  return (
    <View accessible accessibilityLabel={t('paceProfileA11y')}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {values.map((v, i) => {
          const h = Math.max(3, (v / max) * H);
          return <Rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={2} fill={C.trackPrimaryDk} opacity={0.85} />;
        })}
      </Svg>
    </View>
  );
}

/**
 * Laufauswertung oben in der Fährtenauswertung: Einschätzung mit Stärken und Tipps,
 * Kennzahlen, Winkel und Bögen, Tempo und Höhenprofil. Reine Anzeige der in
 * runInsights.ts abgeleiteten Werte; ändert keine Bewertung und keine Daten.
 */
export function TrackRunInsightsCard({ insights }: { insights: RunInsights }) {
  const t = useInsightsT();
  const { verdict, findRate, pace, elevation } = insights;
  const level = LEVEL_STYLE[verdict.level];
  const elements = [
    ...insights.angles.map(a => ({
      key: `a${a.index}`, atM: a.atM, quality: a.quality,
      label: t(a.sharp ? 'sharpAngleLabel' : 'angleLabel', { n: a.index, side: t(`side.${a.side}`) }),
      detail: a.quality === 'overshoot' && a.overshootM != null ? t('overshootDetail', { m: fmt(a.overshootM) })
        : a.settleSec != null && a.quality !== 'clean' ? t('settleDetail', { s: fmt(a.settleSec) }) : null,
      icon: (a.side === 'links' ? 'return-up-back' : 'return-up-forward') as IconName,
    })),
    ...insights.arcs.map(b => ({
      key: `b${b.index}`, atM: b.startM, quality: b.quality,
      label: t('arcLabel', { n: b.index, side: t(`side.${b.side}`), deg: b.turnDeg }),
      detail: b.meanOffsetM != null ? t('arcOffsetDetail', { m: fmt(b.meanOffsetM) }) : null,
      icon: 'sync' as IconName,
    })),
  ].sort((x, y) => x.atM - y.atM);

  return (
    <>
    <SectionLabel>{t('title')}</SectionLabel>
    <View style={[s.card, s.cardGlow]} testID="run-insights-card">
      <View style={s.verdictRow}>
        <View style={[s.verdictIcon, { backgroundColor: level.color + '22', borderColor: level.color + '55' }]}>
          <Ionicons name={level.icon} size={20} color={level.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.verdictTitle} testID="run-insights-level">{t(`level.${verdict.level}`)}</Text>
          <Text style={s.subtitle}>{t('subtitle')}</Text>
        </View>
      </View>

      <View style={s.kpiRow}>
        <Kpi testID="run-insights-kpi-find" icon="flag" label={t('kpi.findRate')} value={findRate ? `${findRate.percent} %` : t('kpi.none')} />
        <Kpi icon="git-branch" label={t('kpi.elements')} value={insights.elementsTotal ? `${insights.elementsClean}/${insights.elementsTotal}` : t('kpi.none')} />
        <Kpi icon="speedometer" label={t('kpi.pace')} value={pace ? `${fmt(pace.avgKmh)} km/h` : t('kpi.none')} />
        <Kpi icon="trending-up" label={t('kpi.elevation')} value={elevation ? (elevation.flat ? t('kpi.flat') : `${elevation.ascentM} m`) : t('kpi.none')} />
      </View>

      {verdict.strengths.length > 0 && (
        <View style={s.block}>
          <Text style={s.blockTitle}>{t('strengths')}</Text>
          {verdict.strengths.map((m, i) => (
            <View key={`s${i}`} style={s.msgRow}>
              <Ionicons name="checkmark-circle" size={16} color={C.trackPrimary} />
              <Text style={s.msgTxt}>{t(m.key, m.params)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.block}>
        <Text style={s.blockTitle}>{t('tips')}</Text>
        {verdict.tips.map((m, i) => (
          <View key={`t${i}`} style={s.msgRow} testID="run-insights-tip">
            <Ionicons name="bulb" size={16} color={C.trackWarning} />
            <Text style={s.msgTxt}>{t(m.key, m.params)}</Text>
          </View>
        ))}
      </View>

      <View style={s.divider} />
      <Text style={s.blockTitle}>{t('elementsTitle')}</Text>
      {elements.length === 0 ? (
        <Text style={s.muted}>{t('elementsEmpty')}</Text>
      ) : elements.map(e => (
        <View key={e.key} style={s.elementRow}>
          <Ionicons name={e.icon} size={15} color={C.trackTextSec} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.elementLabel} numberOfLines={1}>{e.label}</Text>
            {e.detail && <Text style={s.muted}>{e.detail}</Text>}
          </View>
          <QualityChip quality={e.quality} />
        </View>
      ))}

      {findRate && (
        <>
          <View style={s.divider} />
          <View style={s.headRow}>
            <Text style={s.blockTitle}>{t('findTitle')}</Text>
            <Text style={s.headValue}>{findRate.found}/{findRate.total}</Text>
          </View>
          <View style={s.track}><View style={[s.trackFill, { width: `${findRate.percent}%` }]} /></View>
          <Text style={s.muted}>
            {t('findDetail', { found: findRate.found, total: findRate.total })}
            {findRate.calmStops != null ? ` · ${t('findCalm', { n: findRate.calmStops })}` : ''}
            {findRate.passedWithoutStop ? ` · ${t('findPassed', { n: findRate.passedWithoutStop })}` : ''}
          </Text>
        </>
      )}

      {pace && (
        <>
          <View style={s.divider} />
          <View style={s.headRow}>
            <Text style={s.blockTitle}>{t('paceTitle')}</Text>
            <Text style={s.headValue}>{t(`paceBand.${pace.band}`)}</Text>
          </View>
          <PaceBars values={pace.profileKmh} />
          <Text style={s.muted}>
            {t('paceDetail', { avg: fmt(pace.avgKmh), median: fmt(pace.medianKmh) })}
            {' · '}{t('paceConsistency', { pct: pace.consistencyPct })}
            {pace.stops != null ? ` · ${t('paceStops', { n: pace.stops })}` : ''}
          </Text>
          {pace.trend && <Text style={s.muted}>{t(`paceTrend.${pace.trend}`)}</Text>}
        </>
      )}

      {elevation && (
        <>
          <View style={s.divider} />
          <View style={s.headRow}>
            <Text style={s.blockTitle}>{t('elevationTitle')}</Text>
            <Text style={s.headValue}>{elevation.flat ? t('kpi.flat') : `↑ ${elevation.ascentM} m`}</Text>
          </View>
          <ElevationChart elevation={elevation} />
          <Text style={s.muted}>
            {elevation.flat ? t('elevationFlat') : t('elevationDetail', { up: elevation.ascentM, down: elevation.descentM, min: elevation.minM, max: elevation.maxM })}
          </Text>
          <Text style={s.hint}>{t('elevationHint')}</Text>
        </>
      )}
    </View>
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, padding: 16, marginBottom: 16, gap: 8 },
  cardGlow: { borderColor: C.trackPrimaryDk + '38', shadowColor: C.trackPrimary, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  verdictIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  verdictTitle: { fontSize: 18, color: C.trackText, fontWeight: '900' },
  subtitle: { fontSize: 11, color: C.trackTextSec, fontWeight: '600', marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  kpi: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, backgroundColor: C.trackCardAlt },
  kpiVal: { fontSize: 15, color: C.trackText, fontWeight: '900' },
  kpiLabel: { fontSize: 8, color: C.trackTextSec, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  block: { gap: 6, marginTop: 6 },
  blockTitle: { fontSize: 10, color: C.trackTextSec, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  msgTxt: { flex: 1, fontSize: 13, lineHeight: 18, color: C.trackText, fontWeight: '600' },
  divider: { height: 1, backgroundColor: C.trackBorder, marginVertical: 6 },
  elementRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  elementLabel: { fontSize: 13, color: C.trackText, fontWeight: '700' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipTxt: { fontSize: 10.5, fontWeight: '800' },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headValue: { fontSize: 13, color: C.trackText, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: C.trackCardAlt, overflow: 'hidden' },
  trackFill: { height: 8, borderRadius: 4, backgroundColor: C.trackPrimary },
  muted: { fontSize: 12, color: C.trackTextSec, fontWeight: '600', lineHeight: 17 },
  hint: { fontSize: 10.5, color: C.trackTextMut, fontWeight: '600', lineHeight: 15 },
});
