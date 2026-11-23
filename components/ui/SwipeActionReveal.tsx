import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

export type SwipeActionSide = 'left' | 'right';

// Die Wisch-Aktionen liegen dauerhaft HINTER der Karte. Weil ihre Ecken anders
// gerundet sind als die der Karte, schauen sie im Ruhezustand als farbiger Bogen
// an den Kartenecken hervor (z. B. das Rot von «Löschen»). Sie sind deshalb nur
// sichtbar, solange die Karte tatsächlich in ihre Richtung gezogen ist
// (links: translation > 0, rechts: translation < 0).
export function swipeActionOpacity(translation: number, side: SwipeActionSide): number {
  'worklet';
  const revealed = side === 'left' ? translation : -translation;
  return revealed > 0.5 ? 1 : 0;
}

/** Blendet Wisch-Aktionen aus, solange die Karte nicht in ihre Richtung gezogen ist. */
export function SwipeActionReveal({
  translation,
  side,
  children,
}: {
  translation: SharedValue<number>;
  side: SwipeActionSide;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({ opacity: swipeActionOpacity(translation.value, side) }));
  return <Animated.View style={[s.reveal, style]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  reveal: { alignSelf: 'stretch', flexDirection: 'row' },
});
