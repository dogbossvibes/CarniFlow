import { HelpSheet } from '@/components/help/HelpSheet';
import { C } from '@/constants/colors';
import { HELP_TOPICS, HELP_TOPIC_TITLE_KEY, type HelpTopicId } from '@/features/help/helpRegistry';
import { useT } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { markHelpSeen, useHelpSeenState } from '@/stores/helpSeen';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

// „?"-Hilfe-Button + optionaler Auto-Coachmark. Datengetrieben über die
// Help-Registry, „gesehen"-Status pro Nutzer. Reines Overlay — blockiert keine
// laufenden Flows (GPS/Recording/Timer laufen weiter).
type HelpButtonProps = {
  topicId: HelpTopicId;
  autoShow?: boolean;
  tint?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  hideButton?: boolean;
};
export function HelpButton(props: HelpButtonProps) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return <ScopedHelpButton key={String(userId) + ':' + props.topicId} {...props} userId={userId} />;
}
function ScopedHelpButton({ topicId, autoShow = false, tint = C.muted, size = 20, style, hideButton = false, userId }:
  HelpButtonProps & { userId: string | null }) {
  const router = useRouter();
  const { t } = useT();
  const { seen, hydrated } = useHelpSeenState(userId);
  const [activeTopicId, setActiveTopicId] = useState(topicId);
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const autoDoneRef = useRef(false);

  const topic = HELP_TOPICS[activeTopicId] ?? null;

  // Auto-Coachmark: einmalig beim ersten relevanten Auftreten (erst nach
  // Hydrierung, nur wenn noch nicht gesehen). Danach nie automatisch erneut.
  useEffect(() => {
    if (!autoShow || !hydrated || autoDoneRef.current) return;
    if (!seen.includes(topicId)) {
      autoDoneRef.current = true;
      setDetails(false);
      setOpen(true);
    }
  }, [autoShow, hydrated, seen, topicId]);

  const close = () => {
    setOpen(false);
    markHelpSeen(activeTopicId, userId);
  };

  const openManual = () => {
    Keyboard.dismiss();
    setActiveTopicId(topicId);
    setDetails(true);
    setOpen(true);
  };

  const goCenter = () => {
    close();
    router.push('/help-center' as never);
  };

  return (
    <>
      {!hideButton && (
        <TouchableOpacity
          style={[s.btn, style]}
          onPress={openManual}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('help.titleA11y', { title: t(HELP_TOPIC_TITLE_KEY[topicId]) })}
        >
          <View>
            <Ionicons name="help-circle-outline" size={size} color={tint} />
          </View>
        </TouchableOpacity>
      )}

      <HelpSheet
        visible={open}
        topic={topic}
        onClose={close}
        onMore={goCenter}
        showDetails={details}
        collapsibleDetails
        onTopic={id => { markHelpSeen(activeTopicId, userId); setActiveTopicId(id); }}
      />
    </>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
});
