import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

export interface ActiveTrialSheetProps {
  visible:  boolean;
  days:     number;
  priceString: string | null;   // Store-Preis (Quelle der Wahrheit); null → generischer Hinweis
  period:   string;             // 'month' | 'week' | 'year' | 'day'
  starting: boolean;
  onStart:  () => void;
  onLater:  () => void;
}

// Trial-Angebot „Bereit für mehr?". Preis/Periode kommen aus dem Store (nie hart
// codiert); fehlt der Store-Preis, wird ein generischer Hinweis gezeigt.
export function ActiveTrialSheet({ visible, days, priceString, period, starting, onStart, onLater }: ActiveTrialSheetProps) {
  const { t } = useT();
  const periodLabel = t(`activeTrial.period.${period}` as never) || t('activeTrial.period.month');
  const priceNote = priceString
    ? t('activeTrial.priceNote', { days, price: priceString, period: periodLabel })
    : t('activeTrial.priceNoteNoPrice', { days });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onLater}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.iconWrap}>
            <Ionicons name="sparkles" size={26} color={C.accent} />
          </View>
          <Text style={s.title}>{t('activeTrial.title')}</Text>
          <Text style={s.body}>{t('activeTrial.body1')}</Text>
          <Text style={s.body}>{t('activeTrial.body2', { days })}</Text>

          <View style={s.priceRow}>
            <Ionicons name="pricetag-outline" size={14} color={C.muted} />
            <Text style={s.priceNote}>{priceNote}</Text>
          </View>

          <TouchableOpacity
            style={[s.cta, starting && s.ctaDisabled]}
            onPress={onStart}
            disabled={starting}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('activeTrial.cta', { days })}
          >
            {starting
              ? <ActivityIndicator color={C.accentText} />
              : <Text style={s.ctaTxt}>{t('activeTrial.cta', { days })}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.later} onPress={onLater} disabled={starting} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={t('activeTrial.later')}>
            <Text style={s.laterTxt}>{t('activeTrial.later')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:     { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 34, gap: 8, borderTopWidth: 1, borderColor: C.border },
  iconWrap:  { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title:     { fontSize: 20, fontWeight: '900', color: C.white, letterSpacing: -0.3 },
  body:      { fontSize: 14, color: C.muted, lineHeight: 20 },
  priceRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 },
  priceNote: { fontSize: 13, color: C.muted, fontWeight: '600', flex: 1 },
  cta:       { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  ctaDisabled:{ opacity: 0.7 },
  ctaTxt:    { fontSize: 15, fontWeight: '800', color: C.accentText },
  later:     { paddingVertical: 12, alignItems: 'center' },
  laterTxt:  { fontSize: 14, fontWeight: '700', color: C.muted },
});
