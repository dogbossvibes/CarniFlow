import { HelpSheet } from '@/components/help/HelpSheet';
import { C } from '@/constants/colors';
import { HELP_TOPICS, type HelpTopicId } from '@/features/help/helpRegistry';
import { useSession } from '@/hooks/useSession';
import { markHelpSeen, useHelpSeenState } from '@/stores/helpSeen';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

// „?"-Hilfe-Button + optionaler Auto-Coachmark. Datengetrieben über die
// Help-Registry, „gesehen"-Status pro Nutzer. Reines Overlay — blockiert keine
// laufenden Flows (GPS/Recording/Timer laufen weiter).
export function HelpButton({
  topicId,
  autoShow = false,
  tint = C.muted,
  size = 20,
  style,
  hideButton = false,
}: {
  topicId: HelpTopicId;
  autoShow?: boolean;
  tint?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  hideButton?: boolean;
}) {
  const router = useRouter();
  const { user } = useSession();
  const { seen, hydrated } = useHelpSeenState(user?.id);
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const autoDoneRef = useRef(false);

  const topic = HELP_TOPICS[topicId] ?? null;

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
    markHelpSeen(topicId);
  };

  const openManual = () => {
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
          accessibilityLabel={`Hilfe zu ${topic?.title ?? 'diesem Bereich'}`}
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
