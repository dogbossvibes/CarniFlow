import { Image } from 'expo-image';

export function ApportIcon({ color = '#00FFCC', size = 24 }: { color?: string; size?: number }) {
  return (
    <Image
      source={require('@/assets/images/iconapport.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={color}
    />
  );
}
