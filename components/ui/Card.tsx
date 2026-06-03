import { StyleSheet, View, type ViewProps } from 'react-native';
import { C } from '@/constants/colors';

type Props = ViewProps & { padded?: boolean };

export function Card({ style, padded = true, children, ...props }: Props) {
  return (
    <View style={[s.card, padded && s.padded, style]} {...props}>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card:   { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  padded: { padding: 16 },
});
