import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import './i18n';
export function PlannerEntry() {
 const router = useRouter(), { t } = useTranslation('trackPlanner');
 return <Pressable accessibilityRole="button" onPress={() => router.push('/track/planer' as never)} style={{ minHeight: 56, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.card }}>
  <Ionicons name="map-outline" color={C.accent} size={24} /><Text style={{ flex: 1, color: C.accent, fontSize: 17, fontWeight: '700' }}>{t('entry')}</Text><Ionicons name="chevron-forward" color={C.accent} size={18} />
 </Pressable>;
}
