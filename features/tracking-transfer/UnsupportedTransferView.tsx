import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { useSession } from '@/hooks/useSession';
import { transferGapPoints, transferRecipientId } from './androidGapSafety';
import './i18n';
/** Read-only original geometry. No map projection, score, export or replay is invented. */
export function UnsupportedTransferView({ data, onBack }: { data: unknown; onBack(): void }) {
  const { t } = useTranslation('trackTransfer');
  const { session } = useSession();
  const own = !!session?.user.id && transferRecipientId(data) === session.user.id;
  const points = own ? transferGapPoints(data) : [];
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      <Text accessibilityRole="header" style={{ color: C.trackText, fontSize: 24, fontWeight: '700' }}>{t('gapTitle')}</Text>
      <Text accessibilityRole="alert" style={{ color: C.trackText, fontSize: 16, lineHeight: 24 }}>{t(own ? 'gapUnsupported' : 'account')}</Text>
      <View style={{ height: 240 }}>{own && <TrackSketch points={points} w={320} h={240} />}</View>
      {own && points.some(p => p.breakBefore) && <Text style={{ color: C.trackTextMut }}>{points.filter(p => p.breakBefore).length} {t('gaps')}</Text>}
      <Pressable accessibilityRole="button" onPress={onBack} style={{ minHeight: 48, padding: 16 }}>
        <Text style={{ color: C.accent, fontSize: 16 }}>{t('back')}</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}
