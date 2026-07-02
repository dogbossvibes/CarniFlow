import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

// Wiederverwendbares Datums-/Zeitfeld: tippen öffnet den nativen Picker
// (Android = Dialog, iOS = Inline). Kein manuelles Tippen. CH-Format.
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DateField({
  value, onChange, label, placeholder, maximumDate, minimumDate, onClear, style, mode = 'date',
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
}) {
  const [showIOS, setShowIOS] = useState(false);
  const isTime = mode === 'time';
  const format = isTime ? fmtTime : fmtDate;
  const ph = placeholder ?? (isTime ? 'Zeit wählen' : 'Datum wählen');
  const icon = isTime ? 'time-outline' : 'calendar-outline';

  const open = () => {
    const base = value ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: base, mode, is24Hour: true, maximumDate, minimumDate,
        onChange: (e, d) => { if (e.type === 'set' && d) onChange(d); },
      });
    } else {
      setShowIOS(s => !s);
    }
  };

  return (
    <View style={style}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable style={s.field} onPress={open}>
        <Ionicons name={icon} size={18} color={C.accent} />
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>{value ? format(value) : ph}</Text>
        {value && onClear ? (
          <Pressable onPress={onClear} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable>
        ) : (
          <Ionicons name={showIOS ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
        )}
      </Pressable>

      {Platform.OS === 'ios' && showIOS && (
        <View style={s.iosWrap}>
          <DateTimePicker
            value={value ?? new Date()} mode={mode} display={isTime ? 'spinner' : 'inline'}
            is24Hour maximumDate={maximumDate} minimumDate={minimumDate} themeVariant="dark"
            onChange={(_e, d) => { if (d) onChange(d); }}
            style={{ alignSelf: 'stretch' }}
          />
          <Pressable style={s.done} onPress={() => setShowIOS(false)}>
            <Text style={s.doneTxt}>Fertig</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label:      { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  field:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 14 },
  value:      { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },
  placeholder:{ color: C.muted, fontWeight: '500' },
  iosWrap:    { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginTop: 8, padding: 6 },
  done:       { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  doneTxt:    { fontSize: 15, color: C.accent, fontWeight: '800' },
});
