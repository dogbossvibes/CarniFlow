import { Redirect } from 'expo-router';
import { CONNECT_ENABLED } from '@/features/connect/constants/featureFlag';

// Route-Guard: Bei deaktiviertem Flag wird der CONNECT-Screen NICHT geladen
// (lazy require) — keine Repository-Abfrage, kein Fehler ohne CONNECT-Migration.
export default function Route() {
  if (!CONNECT_ENABLED) return <Redirect href="/(tabs)/home" />;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Lazy-Load: bei deaktiviertem Flag wird der Screen nie geladen
  const { ConnectOnboardingScreen } = require('@/features/connect/screens/ConnectOnboardingScreen');
  return <ConnectOnboardingScreen />;
}
