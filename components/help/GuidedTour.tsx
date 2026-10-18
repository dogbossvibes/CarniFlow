import { C } from '@/constants/colors';
import { GUIDED_TOUR_KEY } from '@/features/help/helpRegistry';
import { helpLayout } from '@/features/help/helpLayout';
import { useT } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// A fresh, optional information tour. No route, training or customer-data writes.
export function GuidedTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return visible ? <TourContent onClose={onClose} /> : null;
}

function TourContent({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const { height, width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { cardMaxHeight, stackedActions, scrollWholeCard } = helpLayout(height, width, fontScale, insets.top, insets.bottom);
  const total = GUIDED_TOUR_KEY.length;
  const current = GUIDED_TOUR_KEY[step];
  const isLast = step === total - 1;
  const finish = () => { setStep(0); onClose(); };
  const next = () => isLast ? finish() : setStep(value => Math.min(value + 1, total - 1));
  const body = <>
    <Text accessibilityRole="header" style={s.title}>{t(current.titleKey)}</Text>
    <Text style={s.text}>{t(current.textKey)}</Text>
  </>;
  const content = <>
    <View style={s.kopf}>
      <Text style={s.counter}>{step + 1} / {total}</Text>
      <TouchableOpacity onPress={finish} style={s.close} accessibilityRole="button" accessibilityLabel={t('help.skip')}>
        <Text style={s.skip}>{t('help.skip')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={finish} style={s.close} accessibilityRole="button" accessibilityLabel={t('help.tourClose')}>
        <Ionicons name="close" size={22} color={C.muted} />
      </TouchableOpacity>
    </View>
    {scrollWholeCard ? body : <ScrollView testID="tour-body" style={s.scroll} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">{body}</ScrollView>}
    <View style={s.dots} accessible={false}>
      {GUIDED_TOUR_KEY.map((_, index) => <View key={index} style={[s.dot, index === step && s.dotActive]} />)}
    </View>
    <View testID="tour-actions" style={[s.actions, stackedActions && s.stacked]}>
      <TouchableOpacity style={[s.button, s.secondary, step === 0 && s.disabled]}
        onPress={() => setStep(value => Math.max(value - 1, 0))} disabled={step === 0}
        accessibilityRole="button" accessibilityState={{ disabled: step === 0 }} accessibilityLabel={t('common.back')}>
        <Text style={s.secondaryText}>{t('common.back')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.button, s.primary]} onPress={next} accessibilityRole="button"
        accessibilityLabel={t(isLast ? 'common.done' : 'common.next')}>
        <Text style={s.primaryText}>{t(isLast ? 'common.done' : 'common.next')}</Text>
      </TouchableOpacity>
    </View>
  </>;
  return <Modal visible transparent animationType="fade" onRequestClose={finish}>
    <View style={[s.backdrop, { paddingTop: insets.top + 8 }]}>
      <SafeAreaView edges={['bottom']} style={s.safe}>
        <View testID="tour-card" style={[s.card, { maxHeight: cardMaxHeight }]} accessibilityViewIsModal
          accessibilityLabel={t('help.tourA11y', { step: step + 1, total })}>
          {scrollWholeCard ? <ScrollView testID="tour-body" style={s.scroll} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  safe: { paddingHorizontal: 16, flexShrink: 1 },
  card: { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 22, marginBottom: 8, flexShrink: 1 },
  kopf: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  counter: { flex: 1, fontSize: 12, color: C.accent, fontWeight: '800' },
  close: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
  skip: { color: C.muted, fontSize: 14 },
  title: { fontSize: 22, color: C.white, fontWeight: '900', marginBottom: 10 },
  text: { fontSize: 15, color: C.white, lineHeight: 23, marginBottom: 20 },
  scroll: { flexShrink: 1, minHeight: 0 },
  dots: { flexDirection: 'row', gap: 6, marginVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.accent, width: 18 },
  actions: { flexDirection: 'row', gap: 10, flexShrink: 0 },
  stacked: { flexDirection: 'column' },
  button: { minHeight: 48, padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexBasis: 0 },
  secondary: { borderWidth: 1, borderColor: C.border },
  primary: { backgroundColor: C.accent },
  disabled: { opacity: 0.4 },
  secondaryText: { color: C.white, fontSize: 15, fontWeight: '700' },
  primaryText: { color: C.accentText, fontSize: 15, fontWeight: '800' },
});
