import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';

const SRC = require('@/assets/images/dogicon.png');

// Hunde-Silhouette als einfärbbares Icon — ersetzt das frühere Ionicons-Pfötchen.
// Gleiche Nutzung wie ein Icon: <DogIcon size={16} color={C.accent} />.
export function DogIcon({
  size = 24,
  color,
  style,
}: {
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SRC}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      tintColor={color}
    />
  );
}
