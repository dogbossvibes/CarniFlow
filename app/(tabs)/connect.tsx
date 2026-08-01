import { ConnectHomeScreen } from '@/features/connect/screens/ConnectHomeScreen';
import { Redirect } from 'expo-router';
import { CONNECT_ENABLED } from '@/features/connect/constants/featureFlag';

// Dünner Route-Einstieg für den CONNECT-Tab. Die eigentliche UI liegt in
// features/connect. Der Tab wird in app/(tabs)/_layout.tsx über den Feature-Flag
// ein-/ausgeblendet (href: null, wenn deaktiviert).
export default function ConnectTab() {
  if (!CONNECT_ENABLED && !__DEV__) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <ConnectHomeScreen />;
}
