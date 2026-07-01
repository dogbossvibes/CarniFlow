import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

// Wiederverwendbares Datumsfeld: tippen öffnet den nativen Date-Picker
// (Android = Dialog, iOS = Inline-Kalender mit „Fertig"). Kein manuelles Tippen.
function fmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function DateField({
  value, onChange, label, placeholder = 'Datum wählen', maximumDate, minimumDate, onClear, style,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  label?: string;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onClear?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [showIOS, setShowIOS] = useState(false);

  const open = () => {
    const base = value ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: base, mode: 'date', maximumDate, minimumDate,
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
        <Ionicons name="calendar-outline" size={18} color={C.accent} />
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>{value ? fmt(value) : placeholder}</Text>
        {value && onClear ? (
          <Pressable onPress={onClear} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable>
        ) : (
          <Ionicons name={showIOS ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
        )}
      </Pressable>

      {Platform.OS === 'ios' && showIOS && (
        <View style={s.iosWrap}>
          <DateTimePicker
            value={value ?? new Date()} mode="date" display="inline"
            maximumDate={maximumDate} minimumDate={minimumDate} themeVariant="dark"
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
