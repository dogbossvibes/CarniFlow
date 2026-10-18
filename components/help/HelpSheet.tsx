import { C } from '@/constants/colors';
import {
  HELP_TOPIC_BODY_KEYS,
  HELP_TOPIC_SHORT_KEY,
  HELP_TOPIC_TITLE_KEY,
  HELP_TOPIC_RELATED,
  type HelpTopic,
  type HelpTopicId,
} from '@/features/help/helpRegistry';
import { helpLayout } from '@/features/help/helpLayout';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert, Linking, Modal, ScrollView, StyleSheet, Text,
  TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  collapsibleDetails = false,
  onTopic,
}: {
  visible: boolean;
  topic: HelpTopic | null;
  onClose: () => void;
  onMore?: () => void;
  primaryLabel?: string;
  showDetails?: boolean;
  collapsibleDetails?: boolean;
  onTopic?: (id: HelpTopicId) => void;
}) {
  const { t } = useT();
  const { height, width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { cardMaxHeight, stackedActions, scrollWholeCard } = helpLayout(height, width, fontScale, insets.top, insets.bottom);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [topic?.id, visible]);
  if (!topic) return null;
  const title = t(HELP_TOPIC_TITLE_KEY[topic.id]);
  const bodyKeys = HELP_TOPIC_BODY_KEYS[topic.id] ?? [];
  const primaryText = primaryLabel ?? t('help.understood');
  const detailsVisible = showDetails && (!collapsibleDetails || expanded);
  const externalLink = detailsVisible ? topic.externalLink : undefined;
  const related = HELP_TOPIC_RELATED[topic.id] ?? [];
  const openExternalLink = async () => {
    if (!externalLink) return;
    try {
      await Linking.openURL(externalLink.url);
    } catch {
      Alert.alert(t('common.error'), t(externalLink.errorKey));
    }
  };

  const bodyContent = (<>

              <Text style={s.text}>{t(HELP_TOPIC_SHORT_KEY[topic.id])}</Text>
              {showDetails && collapsibleDetails && (bodyKeys.length > 0 || topic.externalLink) ? <TouchableOpacity
                accessibilityRole="button" accessibilityState={{ expanded }}
                accessibilityLabel={t(expanded ? 'help.detailsHide' : 'help.detailsShow')}
                onPress={() => setExpanded(value => !value)} style={s.externalLink}>
                <Text style={s.externalLinkText}>{t(expanded ? 'help.detailsHide' : 'help.detailsShow')}</Text>
              </TouchableOpacity> : null}
              {detailsVisible && bodyKeys.map((key) => (
                <Text key={key} style={s.detail}>{t(key)}</Text>
              ))}
              {externalLink && (
                <TouchableOpacity
                  style={s.externalLink}
                  onPress={openExternalLink}
                  activeOpacity={0.8}
                  accessibilityRole="link"
                  accessibilityLabel={t(externalLink.labelKey)}
                >
                  <Text style={s.externalLinkText}>{t(externalLink.labelKey)}</Text>
                </TouchableOpacity>
              )}
              {showDetails && onTopic && related.length > 0 ? <View style={s.related}>
                <Text accessibilityRole="header" style={s.detail}>{t('help.relatedTopics')}</Text>
                {related.map(id => <TouchableOpacity key={id} accessibilityRole="button"
                  accessibilityLabel={t(HELP_TOPIC_TITLE_KEY[id])} onPress={() => onTopic(id)} style={s.relatedLink}>
                  <Text style={s.externalLinkText}>{t(HELP_TOPIC_TITLE_KEY[id])}</Text>
                </TouchableOpacity>)}
              </View> : null}

  </>);
  const cardContent = (<>
            <View style={s.kopf}>
              <View style={s.badge}>
                <Ionicons name="help-circle" size={18} color={C.accent} />
              </View>
              <Text style={s.title}>{title}</Text>
            </View>

            {scrollWholeCard ? <View style={s.wholeCardBody}>{bodyContent}</View> : <ScrollView key={`${topic.id}:${showDetails}:${visible}`} testID="help-sheet-body" style={s.body} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">{bodyContent}</ScrollView>}

            <View testID="help-sheet-actions" style={[s.actions, stackedActions && s.actionsStacked]}>
              {onMore && (
                <TouchableOpacity
                  style={[s.secondaryBtn, stackedActions && s.stackedBtn]}
                  onPress={onMore}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('help.more')}
                >
                  <Text style={s.secondaryText}>{t('help.more')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.primaryBtn, stackedActions && s.stackedBtn]}
                onPress={onClose}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={primaryText}
              >
                <Text style={s.primaryText}>{primaryText}</Text>
              </TouchableOpacity>
            </View>
  </>);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityLabel={t('help.close')}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>

      <View style={[s.wrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={s.safe}>
          <View testID="help-sheet-card" style={[s.card, { maxHeight: cardMaxHeight }]} accessibilityViewIsModal accessibilityLabel={t('help.titleA11y', { title })}>
            {scrollWholeCard ? <ScrollView key={`${topic.id}:${showDetails}:${visible}`} testID="help-sheet-body" style={s.wholeCardScroll} showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">{cardContent}</ScrollView> : cardContent}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  safe: { paddingHorizontal: 16, flexShrink: 1 },
  card: {
    backgroundColor: C.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    marginBottom: 8,
    flexShrink: 1,
  },
  kopf: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  badge: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 18, color: C.white, fontWeight: '900', letterSpacing: -0.3 },
  wholeCardScroll: { flexShrink: 1, minHeight: 0 },
  wholeCardBody: { marginBottom: 18 },
  body: { flexShrink: 1, minHeight: 0, marginBottom: 18 },
  text: { fontSize: 15, color: C.white, lineHeight: 23 },
  detail: { fontSize: 14, color: C.muted, lineHeight: 22, marginTop: 12 },
  related: { marginTop: 12 },
  relatedLink: { minHeight: 48, justifyContent: 'center', paddingVertical: 10 },
  externalLink: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, marginTop: 12 },
  externalLinkText: { fontSize: 14, color: C.accent, textDecorationLine: 'underline' },
  actions: { flexShrink: 0, flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  actionsStacked: { flexDirection: 'column' },
  stackedBtn: { flex: 0, width: '100%' },
  secondaryBtn: {
    flex: 1, minHeight: 48, paddingHorizontal: 10, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, color: C.white, fontWeight: '700' },
  primaryBtn: {
    flex: 1, minHeight: 48, paddingHorizontal: 10, paddingVertical: 14, borderRadius: 14,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
