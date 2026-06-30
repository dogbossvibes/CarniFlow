import { useCallback, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { C } from '@/constants/colors';

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
  confirmTitle = 'Training löschen?',
  confirmMessage = 'Möchtest du dieses Training wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
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
  const ref = useRef<SwipeableMethods>(null);

  const confirm = useCallback(() => {
    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        { text: 'Abbrechen', style: 'cancel', onPress: () => ref.current?.close() },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => { ref.current?.close(); onDelete(trainingId); },
        },
      ],
    );
  }, [trainingId, onDelete, confirmTitle, confirmMessage]);

  // Rote Lösch-Aktion (gleich für links & rechts).
  const renderAction = useCallback(() => (
    <Pressable
      style={[s.action, { marginBottom: bottomGap }]}
      onPress={confirm}
      accessibilityRole="button"
      accessibilityLabel="Training löschen"
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={s.actionTxt}>Löschen</Text>
    </Pressable>
  ), [confirm, bottomGap]);

  if (!enabled) return <View>{children}</View>;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderAction}
      renderRightActions={renderAction}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const s = StyleSheet.create({
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
