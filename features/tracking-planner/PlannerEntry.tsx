import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import './i18n';
export function PlannerEntry() {
 const router = useRouter(), { t } = useTranslation('trackPlanner');
 return <Pressable accessibilityRole="button" onPress={() => router.push('/track/planer' as never)} style={{ minHeight: 64, padding: 18, marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.card }}>
  <Text style={{ color: C.accent, fontSize: 17, fontWeight: '700' }}>{t('entry')} →</Text>
 </Pressable>;
}
