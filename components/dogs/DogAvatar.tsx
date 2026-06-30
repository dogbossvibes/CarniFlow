import { View } from 'react-native';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';
import { C } from '@/constants/colors';

// Hunde-Avatar mit Anyvo-Fallback: Foto, sonst Mint-getönte Silhouette (DogIcon).
export function DogAvatar({
  photoUrl, size = 60, radius,
}: {
  photoUrl: string | null;
  size?: number;
  radius?: number;
}) {
  const r = radius ?? Math.round(size * 0.28);
  if (photoUrl) {
    return <SignedImage url={photoUrl} style={{ width: size, height: size, borderRadius: r }} contentFit="cover" transition={200} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentDim }}>
      <DogIcon size={Math.round(size * 0.46)} color={C.trackPrimary} />
    </View>
  );
}
