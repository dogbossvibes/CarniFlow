import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { canEditOwnEvent } from '@/features/calendar/eventEditing';
import type { CalendarEvent } from '@/types/calendar';
import { fmtTime, relativeDayLabel } from '@/lib/eventFormat';
import { DEVICE_CALENDAR_AVAILABLE } from '@/lib/deviceCalendar';

export function EventActionsSheet({ visible, event, userId, onClose, onDismiss, onEdit, onDelete, onExport }: {
  visible: boolean; onDismiss: () => void; event: CalendarEvent; userId: string; onClose: () => void;
  onEdit: () => void; onDelete: () => void; onExport: () => void;
}) {
  const { t } = useT();
  const editable = canEditOwnEvent(event, userId);
  return <AnyvoBottomSheet visible={visible} onClose={onClose} onDismiss={onDismiss} title={event.title} closeButton keyboardAware>
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.body}>
      <Text style={s.detail}>{relativeDayLabel(event.start_at)} · {fmtTime(event.start_at)}{event.end_at ? ` – ${fmtTime(event.end_at)}` : ''}</Text>
      {event.dog?.name ? <Text style={s.detail}>{event.dog.name}</Text> : null}
      {event.location ? <Text style={s.detail}>{event.location}</Text> : null}
      {event.notes ? <Text style={s.detail}>{event.notes}</Text> : null}
      {editable ? <Action label={t('common.edit')} onPress={onEdit} /> : null}
      {DEVICE_CALENDAR_AVAILABLE ? <Action label={t('calendar.exportEvent')} onPress={onExport} /> : null}
      {editable ? <Action label={t('calendar.deleteEvent')} onPress={onDelete} /> : null}
      <Action label={t('common.cancel')} onPress={onClose} />
    </ScrollView>
  </AnyvoBottomSheet>;
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={s.action}><Text style={s.label}>{label}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  body: { gap: 12, paddingBottom: 12 }, detail: { color: C.white, fontSize: 15 },
  action: { minHeight: 48, padding: 14, backgroundColor: C.cardAlt, borderRadius: 12 },
  label: { color: C.white, fontSize: 16, fontWeight: '700' },
});
