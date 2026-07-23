import { Redirect } from 'expo-router';
import { CONNECT_ENABLED } from '@/features/connect/constants/featureFlag';

export default function Route() {
  if (!CONNECT_ENABLED) return <Redirect href="/(tabs)/home" />;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Lazy-Load: bei deaktiviertem Flag wird der Screen nie geladen
  const { ConnectEditProfileScreen } = require('@/features/connect/screens/ConnectEditProfileScreen');
  return <ConnectEditProfileScreen />;
}
