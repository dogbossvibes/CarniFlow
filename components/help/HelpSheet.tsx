import { C } from '@/constants/colors';
import {
  HELP_TOPIC_BODY_KEYS,
  HELP_TOPIC_SHORT_KEY,
  HELP_TOPIC_TITLE_KEY,
  type HelpTopic,
} from '@/features/help/helpRegistry';
import { useT } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal, ScrollView, StyleSheet, Text,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Kompakte Hilfe-/Coachmark-Karte im ANYVO-Dark-Design. Overlay (Modal) —
// blockiert keine laufenden Flows (GPS/Recording laufen im Screen weiter).
// Genutzt von Coachmarks und „?"-Buttons; datengetrieben aus der Help-Registry.
export function HelpSheet({
  visible,
  topic,
  onClose,
  onMore,
  primaryLabel,
  showDetails = false,
}: {
  visible: boolean;
  topic: HelpTopic | null;
  onClose: () => void;
  onMore?: () => void;
  primaryLabel?: string;
  showDetails?: boolean;
}) {
  const { t } = useT();
  if (!topic) return null;
  const title = t(HELP_TOPIC_TITLE_KEY[topic.id]);
  const bodyKeys = HELP_TOPIC_BODY_KEYS[topic.id] ?? [];
  const primaryText = primaryLabel ?? t('help.understood');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityLabel={t('help.close')}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>

      <View style={s.wrap} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={s.safe}>
          <View style={s.card} accessibilityViewIsModal accessibilityLabel={t('help.titleA11y', { title })}>
            <View style={s.kopf}>
              <View style={s.badge}>
                <Ionicons name="help-circle" size={18} color={C.accent} />
              </View>
              <Text style={s.title}>{title}</Text>
            </View>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
              <Text style={s.text}>{t(HELP_TOPIC_SHORT_KEY[topic.id])}</Text>
              {showDetails && bodyKeys.map((key) => (
                <Text key={key} style={s.detail}>{t(key)}</Text>
              ))}
            </ScrollView>

            <View style={s.actions}>
              {onMore && (
                <TouchableOpacity
                  style={s.secondaryBtn}
                  onPress={onMore}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('help.more')}
                >
                  <Text style={s.secondaryText}>{t('help.more')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={onClose}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={primaryText}
              >
                <Text style={s.primaryText}>{primaryText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  safe: { paddingHorizontal: 16 },
  card: {
    backgroundColor: C.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    marginBottom: 8,
    maxHeight: '80%',
  },
  kopf: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  badge: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 18, color: C.white, fontWeight: '900', letterSpacing: -0.3 },
  body: { marginBottom: 18 },
  text: { fontSize: 15, color: 'rgba(255,255,255,0.82)', lineHeight: 23 },
  detail: { fontSize: 14, color: C.muted, lineHeight: 22, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  secondaryBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, color: C.white, fontWeight: '700' },
  primaryBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
