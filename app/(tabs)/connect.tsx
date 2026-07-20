import { ConnectHomeScreen } from '@/features/connect/screens/ConnectHomeScreen';

// Dünner Route-Einstieg für den CONNECT-Tab. Die eigentliche UI liegt in
// features/connect. Der Tab wird in app/(tabs)/_layout.tsx über den Feature-Flag
// ein-/ausgeblendet (href: null, wenn deaktiviert).
export default function ConnectTab() {
  return <ConnectHomeScreen />;
}
