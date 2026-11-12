import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import './i18n';
export function TransferEntry({ sourceId }: { sourceId?: string }) {
  const router = useRouter(), { t } = useTranslation('trackTransfer');
  return <Pressable accessibilityRole="button" style={styles.button}
    onPress={() => router.push((sourceId ? `/track/transfer?sourceId=${encodeURIComponent(sourceId)}` : '/track/transfer') as never)}>
    <Text style={styles.title}>{t('title')}</Text><Text style={styles.caption}>{t('subtitle')}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 64, borderRadius: 18, padding: 16, marginBottom: 16, gap: 5,
  backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  title: { color: C.trackPrimary, fontSize: 16, fontWeight: '800' }, caption: { color: C.trackTextMut, fontSize: 13, lineHeight: 19 },
});
