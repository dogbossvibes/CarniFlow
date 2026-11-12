import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

export function ContactScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.iconButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={20} color={C.trackText} />
      </TouchableOpacity>
      <View style={s.headerText}>
        <Text style={s.headerTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={s.spacer} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  iconButton: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  headerTitle: { color: C.trackText, fontWeight: '900', fontSize: 16 },
  headerSub: { color: C.trackTextSec, fontSize: 12, marginTop: 2 },
  spacer: { width: 48, height: 48 },
});
