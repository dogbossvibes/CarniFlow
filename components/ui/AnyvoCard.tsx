import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { C } from '@/constants/colors';

// Premium-Card im ANYVO-Fährten-Design: dunkel, rounded 20, dezente Border.
export function AnyvoCard({ children, style, secondary }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; secondary?: boolean }) {
  return <View style={[s.card, secondary && s.secondary, style]}>{children}</View>;
}

const s = StyleSheet.create({
  card:      { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, padding: 16 },
  secondary: { backgroundColor: C.trackCardAlt },
});
