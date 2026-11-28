import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { LEVEL_RANK, observedGroundFromCondition, type DayOutlook, type HourRating, type Reason, type TrackWeatherLevel, type TrackWeatherRating } from './model';
import { TRACK_WEATHER_NS, dayKey, levelKey, nowKey, reasonKey } from './i18n';
import { useTrackWeather } from './useTrackWeather';

// Trainings- und Fährtenwetter — Anzeige. Nur Darstellung; Bewertung in model.ts und trainingModel.ts.

const LEVEL_COLOR: Record<TrackWeatherLevel, string> = { good: C.trackPrimary, medium: C.trackWarning, hard: C.trackDanger };
const LEVEL_DIM: Record<TrackWeatherLevel, string> = {
  good: 'rgba(0,255,204,0.12)', medium: 'rgba(255,181,71,0.14)', hard: 'rgba(255,93,108,0.14)',
};
const LEVEL_ICON: Record<TrackWeatherLevel, React.ComponentProps<typeof Ionicons>['name']> = {
  good: 'checkmark-circle-outline', medium: 'partly-sunny-outline', hard: 'warning-outline',
};

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function useWeatherT() {
  return useTranslation(TRACK_WEATHER_NS).t;
}

function reasonText(t: ReturnType<typeof useWeatherT>, r: Reason): string {
  return t(reasonKey(r.key), r.values);
}

/** «Besser ab …», wenn ein späteres Fenster besser ist als jetzt. */
export function betterLaterWindow(rating: Pick<TrackWeatherRating, 'bestWindow' | 'level'>) {
  const w = rating.bestWindow;
  if (!w || w.startsNow) return null;
  return LEVEL_RANK[w.level] < LEVEL_RANK[rating.level] ? w : null;
}

function LevelPill({ level }: { level: TrackWeatherLevel }) {
  const t = useWeatherT();
  return (
    <View style={[s.pill, { backgroundColor: LEVEL_DIM[level] }]}>
      <Text style={[s.pillTxt, { color: LEVEL_COLOR[level] }]}>{t(levelKey(level))}</Text>
    </View>
  );
}

function HourBar({ hours }: { hours: HourRating[] }) {
  const t = useWeatherT();
  if (hours.length < 2) return null;
  const mid = hours[Math.floor(hours.length / 2)];
  return (
    <View accessible accessibilityLabel={`${t('hoursLabel')}: ${hours.map(h => t('hourA11y', { time: formatClock(h.timeMs), level: t(levelKey(h.level)) })).join(', ')}`}>
      <View style={s.bar}>
        {hours.map(h => (
          <View key={h.timeMs} style={[s.barSeg, { backgroundColor: LEVEL_COLOR[h.level], opacity: h.daylight ? 1 : 0.35 }]} />
        ))}
      </View>
      <View style={s.barLabels}>
        <Text style={s.muted}>{formatClock(hours[0].timeMs)}</Text>
        <Text style={s.muted}>{formatClock(mid.timeMs)}</Text>
        <Text style={s.muted}>{formatClock(hours[hours.length - 1].timeMs + 3_600_000)}</Text>
      </View>
    </View>
  );
}

/**
 * Karte auf dem Startbildschirm: oben das Trainingswetter (für jedes Training),
 * darunter je eine Unterkarte für Fährte bzw. Mantrailing – nur wenn ein Hund die
 * Sparte macht (`showTrack`, `showMantrail`). Beide haben eigene Regeln.
 */
export function TrackWeatherCard({ onOpen, onOpenMantrail, onHide, showTrack = true, showMantrail = false }: {
  onOpen?: () => void; onOpenMantrail?: () => void; onHide?: () => void; showTrack?: boolean; showMantrail?: boolean;
}) {
  const t = useWeatherT();
  const { view, requestPermission } = useTrackWeather();
  if (view.kind === 'off') return null;

  const header = (right?: React.ReactNode) => (
    <View style={s.row}>
      <View style={s.titleRow}>
        <Ionicons name="partly-sunny-outline" size={16} color={C.trackTextSec} />
        <Text style={s.title}>{t('trainingTitle')}</Text>
      </View>
      {right}
    </View>
  );

  if (view.kind === 'loading') {
    return <View style={s.card}>{header(<ActivityIndicator size="small" color={C.trackTextSec} />)}<Text style={s.muted}>{t('loading')}</Text></View>;
  }
  if (view.kind === 'noPermission') {
    return (
      <View style={s.card}>
        {header()}
        <Text style={s.body}>{t('noPermission')}</Text>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" onPress={() => void requestPermission()} style={[s.btn, s.btnPrimary]}>
            <Ionicons name="location-outline" size={15} color={C.trackPrimary} />
            <Text style={[s.btnTxt, { color: C.trackPrimary }]}>{t('allow')}</Text>
          </Pressable>
          {onHide && (
            <Pressable accessibilityRole="button" onPress={onHide} style={s.btn}>
              <Text style={s.btnTxt}>{t('hide')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }
  if (view.kind === 'unavailable' || view.kind === 'stale' || !view.training) {
    const stale = view.kind === 'stale' || view.kind === 'ready';
    return (
      <View style={s.card}>
        {header(<Ionicons name="cloud-offline-outline" size={16} color={C.trackTextMut} />)}
        <Text style={s.muted}>{stale ? t('stale', { time: formatClock(view.fetchedAtMs) }) : t('unavailable')}</Text>
      </View>
    );
  }

  const { rating, training, mantrail } = view;
  const temp = training.current.temperature;
  const later = betterLaterWindow(training);
  const summary = [
    temp != null ? `${Math.round(temp)} °C` : null,
    ...training.reasons.filter(r => !(r.key === 'tMild' && temp != null)).map(r => reasonText(t, r)),
    later ? t('betterFrom', { from: formatClock(later.startMs) }) : null,
  ].filter(Boolean).join(' · ');
  const nextDays = training.days.filter(d => d.offset > 0)
    .map(d => t('dayShort', { day: t(dayKey(d.offset)), level: t(levelKey(d.level)) })).join(' · ');
  return (
    <View style={s.card}>
      {header(<LevelPill level={training.level} />)}
      {summary.length > 0 && <Text style={s.body}>{summary}</Text>}
      {nextDays.length > 0 && <Text style={s.muted}>{nextDays}</Text>}
      {showTrack && <SportSection kind="track" rating={rating} onOpen={onOpen} />}
      {showMantrail && mantrail && <SportSection kind="mantrail" rating={mantrail} onOpen={onOpenMantrail} />}
      <View style={s.row}>
        <Text style={s.muted}>{view.fromCache ? t('asOf', { time: formatClock(view.fetchedAtMs) }) : t('hint')}</Text>
        <Text style={s.muted}>{t('source')}</Text>
      </View>
    </View>
  );
}

type SportRating = Pick<TrackWeatherRating, 'level' | 'reasons' | 'bestWindow' | 'hours' | 'days'>;
const SPORT = {
  track: { title: 'trackSection', more: 'trackMore', icon: 'leaf-outline' },
  mantrail: { title: 'mantrailSection', more: 'mantrailMore', icon: 'walk-outline' },
} as const;

/** Unterkarte Fährte/Mantrailing: eigene Ampel, bestes Fenster; aufklappbar Stunden und Tage. */
function SportSection({ kind, rating, onOpen }: { kind: keyof typeof SPORT; rating: SportRating; onOpen?: () => void }) {
  const sport = SPORT[kind];
  const t = useWeatherT();
  const [open, setOpen] = useState(false);
  const w = rating.bestWindow;
  const daysSummary = rating.days.map(d => (d.bestWindow
    ? t('dayShortWindow', { day: t(dayKey(d.offset)), from: formatClock(d.bestWindow.startMs), to: formatClock(d.bestWindow.endMs) })
    : t('dayShort', { day: t(dayKey(d.offset)), level: t(levelKey(d.level)) }))).join(' · ');
  return (
    <View style={s.sub}>
      <Pressable accessibilityRole={onOpen ? 'button' : 'text'} onPress={onOpen} disabled={!onOpen} style={s.subHead}>
        <View style={s.row}>
          <View style={s.titleRow}>
            <Ionicons name={sport.icon} size={15} color={C.trackTextSec} />
            <Text style={s.subTitle}>{t(sport.title)}</Text>
          </View>
          <LevelPill level={rating.level} />
        </View>
        {rating.reasons.length > 0 && <Text style={s.body}>{rating.reasons.map(r => reasonText(t, r)).join(' · ')}</Text>}
        <View style={[s.window, { backgroundColor: w ? LEVEL_DIM[w.level] : 'rgba(255,255,255,0.05)' }]}>
          <Ionicons name="time-outline" size={15} color={w ? LEVEL_COLOR[w.level] : C.trackTextSec} />
          <Text style={[s.windowTxt, { color: w ? LEVEL_COLOR[w.level] : C.trackTextSec }]}>
            {w
              ? `${w.startsNow ? t('windowNow', { to: formatClock(w.endMs) }) : t('window', { from: formatClock(w.startMs), to: formatClock(w.endMs) })} · ${t(levelKey(w.level))}`
              : t('noWindow')}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${t(sport.more)}. ${daysSummary}`}
        onPress={() => setOpen(!open)} style={s.dayRow} hitSlop={4}
      >
        <Text style={[s.muted, { flex: 1 }]} numberOfLines={2}>{daysSummary || t(sport.more)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.trackTextSec} />
      </Pressable>
      {open && (
        <View style={{ gap: 8 }}>
          <HourBar hours={rating.hours} />
          <DayList days={rating.days} />
        </View>
      )}
    </View>
  );
}

/** Heute, morgen, übermorgen – je Ampel; Tipp zeigt Fenster, Grund und Stunden. */
function DayList({ days }: { days: DayOutlook[] }) {
  const t = useWeatherT();
  const [open, setOpen] = useState<number | null>(null);
  if (days.length === 0) return null;
  return (
    <View accessibilityLabel={t('daysLabel')}>
      {days.map(d => {
        const isOpen = open === d.offset;
        const w = d.bestWindow;
        const windowText = w ? t('dayWindow', { from: formatClock(w.startMs), to: formatClock(w.endMs) }) : t('dayNoWindow');
        return (
          <View key={d.offset} style={s.day}>
            <Pressable
              accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityHint={t('dayExpand')}
              accessibilityLabel={t('dayA11y', { day: t(dayKey(d.offset)), level: t(levelKey(d.level)), window: windowText })}
              onPress={() => setOpen(isOpen ? null : d.offset)} style={s.dayRow} hitSlop={4}
            >
              <Text style={[s.dayName]}>{t(dayKey(d.offset))}</Text>
              <LevelPill level={d.level} />
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.trackTextSec} />
            </Pressable>
            {isOpen && (
              <View style={s.dayBody}>
                <Text style={[s.windowTxt, { color: w ? LEVEL_COLOR[w.level] : C.trackTextSec }]}>{windowText}</Text>
                {d.reasons.length > 0 && <Text style={s.body}>{d.reasons.map(r => reasonText(t, r)).join(' · ')}</Text>}
                <HourBar hours={d.hours} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Variante B: kompakter Hinweis beim Fährten-Einstieg. Still, solange nichts Sicheres vorliegt. */
export function TrackWeatherHint({ onPress }: { onPress?: () => void }) {
  const t = useWeatherT();
  const { view } = useTrackWeather();
  if (view.kind !== 'ready') return null;
  const { rating } = view;
  const later = betterLaterWindow(rating);
  const lines = [rating.reasons[0] ? reasonText(t, rating.reasons[0]) : null, later ? t('betterFrom', { from: formatClock(later.startMs) }) : null]
    .filter(Boolean).join('. ');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'} onPress={onPress} disabled={!onPress}
      style={[s.hint, { backgroundColor: LEVEL_DIM[rating.level], borderColor: LEVEL_COLOR[rating.level] }]}
    >
      <View style={s.row}>
        <View style={s.titleRow}>
          <Ionicons name={LEVEL_ICON[rating.level]} size={16} color={LEVEL_COLOR[rating.level]} />
          <Text style={[s.title, { color: LEVEL_COLOR[rating.level] }]}>{t(nowKey(rating.level))}</Text>
        </View>
        <Text style={s.muted}>{t('source')}</Text>
      </View>
      {lines.length > 0 && <Text style={s.body}>{lines}</Text>}
    </Pressable>
  );
}

/** Variante B2: eine Zeile auf dem Lege-Screen vor dem Start. `condition` = gewählte Beschaffenheit. */
export function TrackWeatherLine({ condition }: { condition?: string | null }) {
  const t = useWeatherT();
  const { view } = useTrackWeather(observedGroundFromCondition(condition));
  if (view.kind !== 'ready') return null;
  const { rating } = view;
  const later = betterLaterWindow(rating);
  const text = [rating.reasons[0] ? reasonText(t, rating.reasons[0]) : null, later ? t('betterFrom', { from: formatClock(later.startMs) }) : null]
    .filter(Boolean).join(' · ');
  return (
    <View style={s.line} accessible accessibilityLabel={`${t('title')}: ${t(levelKey(rating.level))}. ${text}`}>
      <LevelPill level={rating.level} />
      <Text style={[s.body, { flex: 1 }]} numberOfLines={2}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.trackCard, borderColor: C.trackBorder, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8, marginBottom: 24 },
  hint: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, marginBottom: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  title: { color: C.trackText, fontSize: 15, fontWeight: '700' },
  body: { color: C.trackText, fontSize: 14, lineHeight: 19 },
  muted: { color: C.trackTextSec, fontSize: 12 },
  pill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 },
  pillTxt: { fontSize: 12, fontWeight: '700' },
  bar: { flexDirection: 'row', gap: 2, marginTop: 2 },
  barSeg: { flex: 1, height: 12, borderRadius: 3 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  window: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  windowTxt: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  day: { borderTopWidth: 1, borderTopColor: C.trackBorder },
  sub: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: C.trackBorder, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingTop: 10, gap: 4 },
  subHead: { gap: 6 },
  subTitle: { color: C.trackText, fontSize: 14, fontWeight: '700' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  dayName: { flex: 1, color: C.trackText, fontSize: 14, fontWeight: '600' },
  dayBody: { gap: 4, paddingBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.trackBorder },
  btnPrimary: { borderColor: 'rgba(0,255,204,0.45)' },
  btnTxt: { color: C.trackText, fontSize: 13, fontWeight: '600' },
});
