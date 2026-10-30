import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSharedHealthDogs } from '@/hooks/useSharedHealthDogs';
import { useT } from '@/i18n';
import { C } from '@/constants/colors';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { SHARED_PERMISSION_LABELS, type SharedDog } from '@/features/dogs/sharing/model';
import { formatDate } from '@/i18n/format';

export function SharedDogAccess({ dog }: { dog: SharedDog }) {
  const { t } = useT();
  return <View style={styles.copy}>
    <Text style={styles.muted}>{dog.ownerName ? t('sharing.receivedFrom', { name: dog.ownerName }) : t('sharing.received')}</Text>
    <Text style={styles.accent}>{t('sharing.readOnly')}</Text>
    {dog.grants.map(grant => <View key={grant.grant_id} style={styles.copy}><Text style={styles.muted}>{grant.expires_at ? t('health.uxShareUntil', { date: formatDate(new Date(grant.expires_at)) }) : t('health.uxShareUnlimited')}</Text>{dog.grants.length > 1 ? <Text style={styles.muted}>{grant.permissions.map(p => t(SHARED_PERMISSION_LABELS[p])).join(' · ')}</Text> : null}</View>)}
  </View>;
}

export function SharedDogsInbox() {
  const { dogs, loading, error, reload } = useSharedHealthDogs();
  const { t } = useT();
  const router = useRouter();
  return <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.accent} />}>
    <Text style={styles.muted}>{t('sharing.inboxHelp')}</Text>
    {loading ? <ActivityIndicator color={C.accent} /> : error ? <AnyvoCard><Text style={styles.text}>{t('sharing.loadFailed')}</Text><AnyvoButton label={t('connect.retry')} onPress={reload} /></AnyvoCard> : !dogs.length ? <AnyvoCard><Text style={styles.title}>{t('sharing.emptyTitle')}</Text><Text style={styles.muted}>{t('sharing.emptyBody')}</Text></AnyvoCard> : dogs.map(dog => <TouchableOpacity key={dog.id} accessibilityRole="button" accessibilityLabel={`${dog.name}, ${t('sharing.readOnly')}`} onPress={() => router.push(`/shared-dog/${dog.id}` as never)} style={styles.card}>
      <View style={styles.row}><Ionicons name="paw-outline" size={26} color={C.accent} /><Text style={[styles.title, styles.flex]}>{dog.name}</Text><Ionicons name="chevron-forward" size={20} color={C.muted} /></View>
      <SharedDogAccess dog={dog} />
      <View style={styles.badges}>{dog.permissions.map(permission => <Text key={permission} style={styles.badge}>{t(SHARED_PERMISSION_LABELS[permission])}</Text>)}</View>
    </TouchableOpacity>)}
  </ScrollView>;
}
export const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 140, gap: 16 }, card: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, flex: { flex: 1 }, copy: { gap: 6 },
  title: { color: C.white, fontSize: 21, fontWeight: '800' }, text: { color: C.white, fontSize: 16, lineHeight: 24 }, muted: { color: C.muted, fontSize: 14, lineHeight: 21 },
  accent: { color: C.accent, fontSize: 14, fontWeight: '700' }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, badge: { color: C.white, backgroundColor: C.accentDim, padding: 8, borderRadius: 10, fontSize: 13 },
});
