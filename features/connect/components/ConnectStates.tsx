import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Wiederverwendbare CONNECT-Zustände (kein Endlos-Loader). Bestehende Tokens/Icons.

export function ConnectEmptyState({ icon = 'sparkles-outline', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <View style={s.wrap} accessibilityRole="text">
      <View style={s.iconWrap}><Ionicons name={icon} size={26} color={C.subtle} /></View>
      <Text style={s.title}>{title}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ConnectErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.wrap}>
      <View style={s.iconWrap}><Ionicons name="cloud-offline-outline" size={26} color={C.muted} /></View>
      <Text style={s.title}>Etwas ist schiefgelaufen</Text>
      <Text style={s.hint}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity style={s.btn} onPress={onRetry} activeOpacity={0.85} accessibilityRole="button">
          <Text style={s.btnTxt}>Erneut versuchen</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ConnectLoading() {
  return <View style={s.wrap}><ActivityIndicator color={C.accent} /></View>;
}

const s = StyleSheet.create({
  wrap:    { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  iconWrap:{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:   { fontSize: 15, color: C.white, fontWeight: '800', textAlign: 'center' },
  hint:    { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 19 },
  btn:     { marginTop: 8, backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 11 },
  btnTxt:  { fontSize: 14, color: C.accentText, fontWeight: '800' },
});
