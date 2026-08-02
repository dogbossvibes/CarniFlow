import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { eventMeta } from '@/types/calendar';
import type { EventType } from '@/types/calendar';
import { isSameDay, isTomorrow, type DogAppointment } from '@/features/dogs/dashboard';

// Nächste hundebezogene Termine (max. 3). Überfällige klar gekennzeichnet.
// CTA öffnet den bestehenden Kalender-/Terminbereich. Keine neue Kalenderarchitektur.
export function DogAppointmentsCard({
  appointments, localeTag, onOpenCalendar,
}: {
  appointments: DogAppointment[];
  localeTag: string;
  onOpenCalendar: () => void;
}) {
  const { t } = useT();
  const visible = appointments.slice(0, 3);

  const whenLabel = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
    if (isSameDay(iso, new Date()))  return `${t('dash.today')} · ${time}`;
    if (isTomorrow(iso, new Date())) return `${t('dash.tomorrow')} · ${time}`;
    return `${d.toLocaleDateString(localeTag, { day: '2-digit', month: 'short' })} · ${time}`;
  };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>{t('dash.appointments')}</Text>
        {appointments.length > 0 ? (
          <TouchableOpacity onPress={onOpenCalendar} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('dash.viewAll')}>
            <Text style={s.link}>{t('dash.viewAll')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {visible.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="calendar-outline" size={22} color={C.trackTextMut} />
          <Text style={s.emptyTxt}>{t('dash.noAppointments')}</Text>
          <TouchableOpacity style={s.createBtn} onPress={onOpenCalendar} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel={t('dash.createAppointment')}>
            <Ionicons name="add" size={15} color={C.trackPrimary} />
            <Text style={s.createTxt}>{t('dash.createAppointment')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {visible.map(a => {
            const meta = eventMeta(a.type as EventType);
            return (
              <TouchableOpacity key={a.id} style={s.row} onPress={onOpenCalendar} activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${a.title}. ${a.overdue ? `${t('dash.overdue')}. ` : ''}${whenLabel(a.startAt)}${a.discipline ? `. ${a.discipline}` : ''}`}>
                <View style={[s.rowIcon, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
                  <Ionicons name={meta.icon} size={15} color={meta.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{a.title}</Text>
                  <Text style={s.rowWhen} numberOfLines={1}>
                    {whenLabel(a.startAt)}{a.discipline ? ` · ${a.discipline}` : ''}
                  </Text>
                </View>
                {a.overdue ? (
                  <View style={s.overdueBadge}><Text style={s.overdueTxt}>{t('dash.overdue')}</Text></View>
                ) : (
                  <Ionicons name="chevron-forward" size={15} color={C.trackTextMut} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, padding: 16, gap: 12 },
  head:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:   { fontSize: 15, color: C.trackText, fontWeight: '800' },
  link:    { fontSize: 13, color: C.trackPrimary, fontWeight: '800' },
  empty:   { alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyTxt:{ fontSize: 13, color: C.trackTextMut, fontWeight: '500' },
  createBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, paddingHorizontal: 13, paddingVertical: 9, marginTop: 2 },
  createTxt:{ fontSize: 13, color: C.trackPrimary, fontWeight: '800' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, paddingHorizontal: 12, paddingVertical: 11 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowTitle:{ fontSize: 14, color: C.trackText, fontWeight: '700' },
  rowWhen: { fontSize: 12, color: C.trackTextSec, fontWeight: '500', marginTop: 1 },
  overdueBadge:{ borderRadius: 8, backgroundColor: 'rgba(255,93,108,0.14)', borderWidth: 1, borderColor: 'rgba(255,93,108,0.3)', paddingHorizontal: 8, paddingVertical: 4 },
  overdueTxt:{ fontSize: 10.5, color: C.trackDanger, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
});
