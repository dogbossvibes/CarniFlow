import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ACCENT = '#00F5D4';

export function StickyCreateAppointmentButton({ onPress, loading, label = 'Termin erstellen' }: { onPress: () => void; loading?: boolean; label?: string }) {
  return (
    <View style={s.wrap}>
      <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={onPress} disabled={loading} activeOpacity={0.9}>
        <Ionicons name="checkmark-circle" size={20} color="#001210" />
        <Text style={s.txt}>{loading ? 'Speichert…' : label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(5,5,5,0.92)' },
  btn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 64, borderRadius: 32, backgroundColor: ACCENT, shadowColor: ACCENT, shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  txt:  { fontSize: 17, color: '#001210', fontWeight: '900' },
});
