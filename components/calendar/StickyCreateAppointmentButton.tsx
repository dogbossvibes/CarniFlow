import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';

const ACCENT = '#00F5D4';

export function StickyCreateAppointmentButton({ onPress, loading, label }: { onPress: () => void; loading?: boolean; label?: string }) {
  const { bottom } = useSafeAreaInsets();
  const { t } = useT();
  return (
    <View style={[s.wrap, { paddingBottom: Math.max(bottom, 12) }]}>
      <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityState={{ disabled: !!loading, busy: !!loading }} activeOpacity={0.9}>
        <Ionicons name="checkmark-circle" size={20} color="#001210" />
        <Text style={s.txt}>{loading ? t('common.saving') : label ?? t('calendar.createEvent')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(5,5,5,0.92)' },
  btn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 64, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 32, backgroundColor: ACCENT, shadowColor: ACCENT, shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  txt:  { fontSize: 17, color: '#001210', fontWeight: '900', flexShrink: 1, textAlign: 'center' },
});
