import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { useT } from '@/i18n';

// Nur sichtbar, wenn offline. Dezenter Premium-Hinweis.
export function OfflineBanner() {
  const isOnline = useSyncStore(s => s.isOnline);
  const { t } = useT();
  if (isOnline) return null;
  return (
    <View style={s.banner}>
      <Ionicons name="cloud-offline-outline" size={16} color={C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{t('sync.offlineTitle')}</Text>
        <Text style={s.sub}>{t('sync.offlineSub')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  title:  { fontSize: 13, color: C.white, fontWeight: '700' },
  sub:    { fontSize: 11.5, color: C.muted, marginTop: 1 },
});
