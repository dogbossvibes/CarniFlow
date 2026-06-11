import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function AnyvoButton({
  label, onPress, variant = 'primary', icon, disabled, loading, style, big,
}: {
  label: string; onPress: () => void; variant?: Variant; icon?: IconName;
  disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; big?: boolean;
}) {
  const isPrimary = variant === 'primary';
  const txtColor =
    variant === 'primary' ? '#04110F' :
    variant === 'danger'  ? C.trackDanger :
    variant === 'secondary' ? C.trackText : C.trackTextSec;

  return (
    <TouchableOpacity
      style={[s.base, big && s.big, variant === 'secondary' && s.secondary, variant === 'danger' && s.danger,
        variant === 'ghost' && s.ghost, (disabled || loading) && { opacity: 0.45 }, style]}
      onPress={onPress} disabled={disabled || loading} activeOpacity={0.85}
    >
      {isPrimary && <LinearGradient colors={[C.trackPrimary, C.trackPrimaryDk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      {loading ? <ActivityIndicator color={txtColor} /> : (
        <View style={s.inner}>
          {icon && <Ionicons name={icon} size={big ? 20 : 17} color={txtColor} />}
          <Text style={[s.label, big && s.labelBig, { color: txtColor }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base:      { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  big:       { height: 60, borderRadius: 20 },
  secondary: { backgroundColor: C.trackCardAlt, borderWidth: 1, borderColor: C.trackBorder },
  danger:    { backgroundColor: 'rgba(255,77,77,0.12)', borderWidth: 1, borderColor: 'rgba(255,77,77,0.3)' },
  ghost:     { backgroundColor: 'transparent' },
  inner:     { flexDirection: 'row', alignItems: 'center', gap: 9 },
  label:     { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  labelBig:  { fontSize: 17, fontWeight: '900' },
});
