import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { C } from '@/constants/colors';

// Betitelter Abschnitt für Datenschutz-Einstellungen + eine wiederverwendbare
// Schalter-Zeile. Rein präsentational; bestehende Tokens, keine neuen Farben.
export function ConnectPrivacySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.title}>{title}</Text>
      <View style={s.group}>{children}</View>
    </View>
  );
}

export function ConnectToggleRow({
  label, description, value, onValueChange, last,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {description ? <Text style={s.rowDesc}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.cardAlt, true: C.accentMid }}
        thumbColor={value ? C.accent : C.muted}
        ios_backgroundColor={C.cardAlt}
        accessibilityLabel={label}
      />
    </View>
  );
}

const s = StyleSheet.create({
  section:   { marginTop: 20 },
  title:     { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, paddingHorizontal: 4 },
  group:     { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel:  { fontSize: 14.5, color: C.white, fontWeight: '700' },
  rowDesc:   { fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 17 },
});
