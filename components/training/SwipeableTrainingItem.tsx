import { useCallback, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

export type SwipeActionSide = 'left' | 'right';

// Die Lösch-Aktion liegt dauerhaft HINTER der Karte. Weil ihre Ecken anders
// gerundet sind als die der Karte, schaute sie im Ruhezustand als roter Bogen
// an den Kartenecken hervor. Sie ist deshalb nur sichtbar, solange die Karte
// tatsächlich in ihre Richtung gezogen ist (links: translation > 0,
// rechts: translation < 0).
export function swipeActionOpacity(translation: number, side: SwipeActionSide): number {
  'worklet';
  const revealed = side === 'left' ? translation : -translation;
  return revealed > 0.5 ? 1 : 0;
}

function SwipeActionReveal({
  translation,
  side,
  children,
}: {
  translation: SharedValue<number>;
  side: SwipeActionSide;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({ opacity: swipeActionOpacity(translation.value, side) }));
  return <Animated.View style={[s.reveal, style]}>{children}</Animated.View>;
}

// Wiederverwendbarer Swipe-zum-Löschen-Wrapper für Trainingslisten.
// Swipe nach links ODER rechts zeigt eine rote „Löschen"-Aktion; nach
// Bestätigung wird onDelete(trainingId) ausgelöst. Funktioniert iOS + Android
// (react-native-gesture-handler / Reanimated). Das eigentliche Karten-Design
// bleibt unverändert — es wird einfach als `children` durchgereicht.
export function SwipeableTrainingItem({
  trainingId,
  onDelete,
  children,
  enabled = true,
  bottomGap = 12,
  confirmTitle,
  confirmMessage,
}: {
  trainingId: string;
  onDelete: (id: string) => void;
  children: React.ReactNode;
  enabled?: boolean;
  // Unterer Abstand der roten Aktion, damit sie bündig zur Karte sitzt
  // (UnitListCard: 12; Listen mit gap-Spacing: 0).
  bottomGap?: number;
  // Bestätigungstext anpassbar (z. B. „Fährte" statt „Training").
  confirmTitle?: string;
  confirmMessage?: string;
}) {
  const { t } = useT();
  const ref = useRef<SwipeableMethods>(null);
  const title = confirmTitle ?? t('training.deleteTitle');
  const message = confirmMessage ?? t('training.deleteConfirm');

  const confirm = useCallback(() => {
    Alert.alert(
      title,
      message,
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => ref.current?.close() },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => { ref.current?.close(); onDelete(trainingId); },
        },
      ],
    );
  }, [trainingId, onDelete, title, message, t]);

  // Rote Lösch-Aktion (gleich für links & rechts).
  const renderAction = useCallback((side: SwipeActionSide, translation: SharedValue<number>) => (
    <SwipeActionReveal translation={translation} side={side}>
      <Pressable
        style={[s.action, { marginBottom: bottomGap }]}
        onPress={confirm}
        accessibilityRole="button"
        accessibilityLabel={t('training.deleteA11y')}
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={s.actionTxt}>{t('training.delete')}</Text>
      </Pressable>
    </SwipeActionReveal>
  ), [confirm, bottomGap, t]);
  const renderLeft = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => renderAction('left', translation),
    [renderAction],
  );
  const renderRight = useCallback(
    (_progress: SharedValue<number>, translation: SharedValue<number>) => renderAction('right', translation),
    [renderAction],
  );

  if (!enabled) return <View>{children}</View>;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeft}
      renderRightActions={renderRight}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const s = StyleSheet.create({
  // Zeile, damit die Aktion (alignSelf: 'stretch') weiterhin die volle Kartenhöhe füllt.
  reveal: { alignSelf: 'stretch', flexDirection: 'row' },
  action: {
    width: 96,
    borderRadius: 20,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'stretch',
  },
  actionTxt: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
});
