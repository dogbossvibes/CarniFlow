import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

/** Einstieg Training → Fährten → Gruppentraining. */
export function GroupEntry() {
  const router = useRouter();
  const { t } = useT();
  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={() => router.push('/groups' as never)}
      style={{ minHeight: 64, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Ionicons name="people-outline" size={22} color={C.accent} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: C.accent, fontSize: 17, fontWeight: '700' }}>{t('groups.title')}</Text>
        <Text style={{ color: C.trackTextSec, fontSize: 14, lineHeight: 21 }}>{t('groups.entrySubtitle')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
    </TouchableOpacity>
  );
}
