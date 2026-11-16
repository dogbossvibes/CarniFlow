import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';

const ROWS: { label: TranslationKey; who: TranslationKey | 'location'; muted?: boolean }[] = [
  { label: 'groups.wsName', who: 'groups.wsAll' },
  { label: 'groups.wsArea', who: 'groups.wsAll' },
  { label: 'groups.wsCourse', who: 'groups.wsCourseWho' },
  { label: 'groups.wsLocation', who: 'location' },
  { label: 'groups.wsSearch', who: 'groups.wsOnlyYou', muted: true },
  { label: 'groups.wsPrivate', who: 'groups.wsNever', muted: true },
];

/** «Wer sieht was» im Gruppentraining (Stufe 3). Standort teilen ist hier direkt schaltbar. */
export function WhoSeesWhatSheet({ visible, onClose, sharing, canShare, onShare }: {
  visible: boolean; onClose(): void; sharing: boolean; canShare: boolean; onShare(on: boolean): void;
}) {
  const { t } = useT();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('groups.understood')} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} />
        <Text accessibilityRole="header" style={s.title}>{t('groups.whoSeesWhat')}</Text>
        <View style={s.card}>
          {ROWS.map((row, index) => {
            const location = row.who === 'location';
            const who = location ? t(sharing ? 'groups.wsOn' : 'groups.wsOff') : t(row.who as TranslationKey);
            const muted = location ? !sharing : row.muted;
            return (
              <View key={row.label} style={[s.row, index > 0 && s.divider]}>
                <Text style={s.label}>{t(row.label)}</Text>
                <Text style={[s.who, muted && s.whoMuted]}>{who}</Text>
              </View>
            );
          })}
        </View>
        {canShare ? (
          <View style={[s.card, s.shareRow]}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{t('groups.shareLocation')}</Text>
              <Text style={s.hint}>{t('groups.wsShareHint')}</Text>
            </View>
            <Switch value={sharing} onValueChange={onShare} accessibilityLabel={t('groups.shareLocation')}
              trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }} />
          </View>
        ) : null}
        <Text style={s.hint}>{t('groups.wsEvalHint')}</Text>
        <Text style={s.hint}>{t('groups.wsLeave')}</Text>
        <AnyvoButton label={t('groups.understood')} onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: C.trackBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12, borderTopWidth: 1, borderColor: C.trackBorder },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.trackBorder },
  title: { color: C.trackText, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  card: { backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: C.trackBorder },
  label: { flex: 1, color: C.trackText, fontSize: 14, fontWeight: '600' },
  who: { color: C.trackPrimary, fontSize: 13, textAlign: 'right', maxWidth: '45%' },
  whoMuted: { color: C.trackTextSec },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  hint: { color: C.trackTextSec, fontSize: 12, lineHeight: 17 },
});
