import { Image, ImageProps } from 'expo-image';
import { useSignedUrl } from '@/hooks/useSignedUrl';

// expo-image-Wrapper, der eine gespeicherte Storage-URL bei Bedarf signiert.
// Drop-in-Ersatz für <Image source={{ uri }} /> bei Storage-Bildern.
type Props = Omit<ImageProps, 'source'> & { url: string | null | undefined };

export function SignedImage({ url, ...props }: Props) {
  const uri = useSignedUrl(url);
  return <Image source={uri ? { uri } : undefined} {...props} />;
}
