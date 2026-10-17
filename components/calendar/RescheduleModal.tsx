import { useEffect, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { fmtTime } from '@/lib/eventFormat';
import { useT } from '@/i18n';
import type { CalendarEvent } from '@/types/calendar';

const ACCENT = '#00F5D4';

function fmtDateInput(t: string): string {
  const c = t.replace(/\D/g, '');
  if (c.length >= 4) return `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 8)}`;
  if (c.length >= 2) return `${c.slice(0, 2)}.${c.slice(2)}`;
  return c;
}
function fmtTimeInput(t: string): string {
  const c = t.replace(/\D/g, '');
  return c.length >= 2 ? `${c.slice(0, 2)}:${c.slice(2, 4)}` : c;
}
function toISO(dateCH: string, timeHM: string): string | null {
  const dm = dateCH.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const tm = timeHM.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const d = new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2]);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function prefill(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`,
    time: fmtTime(iso),
  };
}

export function RescheduleModal({
  visible, event, onClose, onSubmit,
}: {
  visible: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onSubmit: (startISO: string, endISO: string | null) => void;
}) {
  const { t } = useT();
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (event) {
      const p = prefill(event.start_at);
      setDate(p.date); setStart(p.time);
      setEnd(event.end_at ? fmtTime(event.end_at) : '');
    }
  }, [event]);

  const submit = () => {
    const startISO = toISO(date, start);
    if (!startISO) { Alert.alert(t('calendar.dateTimeTitle'), t('calendar.dateStartFormatBody')); return; }
    const endISO = end ? toISO(date, end) : null;
    Keyboard.dismiss();
    onSubmit(startISO, endISO);
  };

  return (
    <AnyvoBottomSheet visible={visible} onClose={() => { Keyboard.dismiss(); onClose(); }} title={t('calendar.suggestNewTime')} keyboardAware closeButton>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={s.sub}>{t('calendar.customerMustConfirm')}</Text>

          <View style={s.row}>
            <Field label={t('calendar.dateUpper')}><TextInput style={s.input} value={date} onChangeText={value => setDate(fmtDateInput(value))} placeholder={t('calendar.datePlaceholder')} placeholderTextColor={C.subtle} keyboardType="numeric" accessibilityLabel={t('calendar.dateUpper')} maxLength={10} /></Field>
            <Field label={t('calendar.startUpper')}><TextInput style={s.input} value={start} onChangeText={value => setStart(fmtTimeInput(value))} placeholder={t('calendar.timePlaceholder')} placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={5} /></Field>
            <Field label={t('calendar.endUpper')}><TextInput style={s.input} value={end} onChangeText={value => setEnd(fmtTimeInput(value))} placeholder={t('calendar.timePlaceholder')} placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={5} /></Field>
          </View>

          </ScrollView>
          <TouchableOpacity style={s.btn} accessibilityRole="button" onPress={submit} activeOpacity={0.9}>
            <Ionicons name="paper-plane" size={18} color="#001210" />
            <Text style={s.btnTxt}>{t('calendar.sendSuggestion')}</Text>
          </TouchableOpacity>
    </AnyvoBottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text>{children}</View>;
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:   { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  handle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  title:   { fontSize: 18, color: C.white, fontWeight: '800', textAlign: 'center' },
  sub:     { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  row:     { flexDirection: 'column', gap: 10, marginBottom: 18 },
  field:   {},
  label:   { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  input:   { backgroundColor: C.input, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 12, color: C.white, fontSize: 15, fontWeight: '700' },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 54, padding: 12, borderRadius: 16, backgroundColor: ACCENT },
  btnTxt:  { fontSize: 16, color: '#001210', fontWeight: '900', flexShrink: 1, textAlign: 'center' },
});
