import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { TodayHint } from '@/features/dogs/dashboard';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// „Heute mit {Hund}" — kompakte, handlungsorientierte Zusammenfassung (max. 4
// Hinweise). Zeigt NUR reale, bereits vorhandene Daten; keine erfundenen Tipps.
export function DogTodayCard({
  dogName, hints, heatDaysUntil, heatActive, goalTitle, backpackActive, backpackPacked, lastTrainingLabel, localeTag, getHintAction,
}: {
  dogName: string;
  hints: TodayHint[];
  heatDaysUntil?: number | null;
  heatActive?: boolean;
  goalTitle?: string | null;
  backpackActive: number;
  backpackPacked: number;
  lastTrainingLabel?: string | null;
  localeTag: string;
  getHintAction?: (hint: TodayHint) => (() => void) | undefined;
}) {
  const { t } = useT();

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
  };
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(localeTag, { day: '2-digit', month: 'short' });
  };

  const rows = hints.map((h) => {
    switch (h.kind) {
      case 'appointment_today': {
        const a = h.appointment!;
        return { key: `appt-${a.id}`, icon: 'calendar' as IconName, accent: C.trackPrimary,
          title: a.title, detail: `${t('dash.today')} · ${fmtTime(a.startAt)}${a.discipline ? ` · ${a.discipline}` : ''}` };
      }
      case 'appointment_overdue': {
        const a = h.appointment!;
        return { key: `over-${a.id}`, icon: 'alert-circle' as IconName, accent: C.trackDanger,
          title: a.title, detail: `${t('dash.overdue')} · ${fmtDate(a.startAt)}` };
      }
      case 'heat':
        return { key: 'heat', icon: 'heart' as IconName, accent: '#F472B6',
          title: t('dash.heat'), detail: heatActive ? t('dash.heatActive') : t('dash.heatInDays', { count: heatDaysUntil ?? 0 }) };
      case 'goal':
        return { key: 'goal', icon: 'flag' as IconName, accent: C.trackPrimary,
          title: t('dash.currentGoal'), detail: goalTitle ?? '' };
      case 'backpack':
        return { key: 'backpack', icon: 'bag-handle' as IconName, accent: C.trackPrimary,
          title: t('backpack.title'), detail: t('backpack.packedSummary', { packed: backpackPacked, total: backpackActive }) };
      case 'last_activity':
        return { key: 'last', icon: 'time' as IconName, accent: C.trackTextSec,
          title: t('dash.recent'), detail: lastTrainingLabel ?? '' };
    }
  });

  return (
    <View style={s.card} accessible={false}>
      <View style={s.head}>
        <View style={s.headIcon}><Ionicons name="sunny" size={16} color={C.trackPrimary} /></View>
        <Text accessibilityRole="header" style={s.title}>{t('dash.todayWith', { name: dogName })}</Text>
      </View>
      {rows.length === 0 ? (
        <Text style={s.nothing}>{t('dash.nothingToday')}</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((r, index) => {
            const action = getHintAction?.(hints[index]);
            const Row = action ? TouchableOpacity : View;
            return <Row key={r.key} style={s.row} onPress={action}
              accessibilityRole={action ? 'button' : undefined}
              accessibilityLabel={`${r.title}. ${r.detail}`} activeOpacity={action ? 0.75 : undefined}>
              <View style={[s.rowIcon, { backgroundColor: `${r.accent}22` }]}><Ionicons name={r.icon} size={15} color={r.accent} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} >{r.title}</Text>
                {r.detail ? <Text style={s.rowDetail} >{r.detail}</Text> : null}
              </View>
              {action ? <Ionicons name="chevron-forward" size={18} color={C.trackPrimary} /> : null}
            </Row>;
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card:     { backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, padding: 16, gap: 12 },
  head:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  title:    { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800' },
  nothing:  { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500' },
  row:      { minHeight: 48, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowIcon:  { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, color: C.trackText, fontWeight: '700' },
  rowDetail:{ fontSize: 12.5, color: C.trackTextSec, fontWeight: '500', marginTop: 1 },
});
