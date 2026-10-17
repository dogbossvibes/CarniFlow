import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

// Wiederverwendbares Datums-/Zeitfeld: tippen öffnet den nativen Picker
// (Android = Dialog, iOS = Spinner mit Tag·Monat·Jahr). Kein manuelles Tippen. CH-Format.
// Fabric 8.4.4 converts cleared bounds to timestamp 0 and does not reset
// UIDatePicker bounds on recycling. Medication dates opt into explicit bounds
// covering the full four-digit calendar-date range instead of inheriting 1970.
const IOS_FIRST_DATE = new Date('0001-01-01T00:00:00');
const IOS_LAST_DATE = new Date('9999-12-31T23:59:59');

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DateField({
  value, onChange, label, placeholder, maximumDate, minimumDate, onClear, style, mode = 'date', stabilizeIOSBounds = false,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  label?: string;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onClear?: () => void;
  style?: StyleProp<ViewStyle>;
  mode?: 'date' | 'time';
  stabilizeIOSBounds?: boolean;
}) {
  const { t } = useT();
  const [showIOS, setShowIOS] = useState(false);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => setShowIOS(false));
    return () => sub.remove();
  }, []);
  const isTime = mode === 'time';
  const format = isTime ? fmtTime : fmtDate;
  const ph = placeholder ?? (isTime ? t('date.chooseTime') : t('date.chooseDate'));
  const icon = isTime ? 'time-outline' : 'calendar-outline';

  const open = () => {
    const base = value ?? new Date();
    Keyboard.dismiss();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: base, mode, is24Hour: true, maximumDate, minimumDate,
        // Datum als Walzen-Picker (Tag·Monat·Jahr) statt großem Monatskalender:
        // das Jahr ist damit direkt wähl-/scrollbar wie auf iOS — ältere Jahrgänge
        // (z. B. 2010/2015) ohne Monat-für-Monat-Zurücktippen. Zeit bleibt beim
        // nativen Default (Uhr). maximumDate verhindert weiterhin Zukunftsdaten,
        // fehlendes minimumDate lässt beliebig weit zurückliegende Jahre zu.
        display: isTime ? 'default' : 'spinner',
        onChange: (e, d) => { if (e.type === 'set' && d) onChange(d); },
      });
    } else {
      setShowIOS(s => !s);
    }
  };

  return (
    <View style={style}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable style={s.field} onPress={open} testID="date-field" accessibilityRole="button" accessibilityLabel={[label, value ? format(value) : ph].filter(Boolean).join(': ')} accessibilityState={{ expanded: showIOS }}>
        <Ionicons name={icon} size={18} color={C.accent} />
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>{value ? format(value) : ph}</Text>
        {value && onClear ? (
          <Pressable onPress={e => { e.stopPropagation(); onClear(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.delete')}><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable>
        ) : (
          <Ionicons name={showIOS ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
        )}
      </Pressable>

      {Platform.OS === 'ios' && showIOS && (
        <View style={s.iosWrap}>
          <DateTimePicker
            value={value ?? new Date()} mode={mode} display="spinner"
            is24Hour
            maximumDate={stabilizeIOSBounds && !isTime ? maximumDate ?? IOS_LAST_DATE : maximumDate}
            minimumDate={stabilizeIOSBounds && !isTime ? minimumDate ?? IOS_FIRST_DATE : minimumDate}
            themeVariant="dark"
            onChange={(e, d) => { if (e.type === 'set' && d) onChange(d); }}
            style={{ alignSelf: 'stretch' }}
          />
          <Pressable style={s.done} onPress={() => setShowIOS(false)} accessibilityRole="button">
            <Text style={s.doneTxt}>{t('common.done')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label:      { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  field:      { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 14 },
  value:      { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },
  placeholder:{ color: C.muted, fontWeight: '500' },
  iosWrap:    { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginTop: 8, padding: 6 },
  done:       { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  doneTxt:    { fontSize: 15, color: C.accent, fontWeight: '800' },
});
