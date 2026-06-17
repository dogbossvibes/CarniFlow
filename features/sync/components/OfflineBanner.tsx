import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSyncStore } from '@/features/sync/store/syncStore';

// Nur sichtbar, wenn offline. Dezenter Premium-Hinweis.
export function OfflineBanner() {
  const isOnline = useSyncStore(s => s.isOnline);
  if (isOnline) return null;
  return (
    <View style={s.banner}>
      <Ionicons name="cloud-offline-outline" size={16} color={C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Offline-Modus aktiv</Text>
        <Text style={s.sub}>Deine Daten werden lokal gespeichert und später synchronisiert.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  title:  { fontSize: 13, color: C.white, fontWeight: '700' },
  sub:    { fontSize: 11.5, color: C.muted, marginTop: 1 },
});
