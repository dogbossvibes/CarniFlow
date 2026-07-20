import { useCapabilities } from '@/hooks/useCapabilities';
import { effectiveConnectEntitlements, type ConnectEntitlements } from '@/features/connect/services/connect-entitlements';

// Hook: liest die bestehenden Capabilities und liefert die effektiven
// CONNECT-Entitlements. Die Logik selbst ist rein (connect-entitlements.ts).
export function useConnectEntitlements(): ConnectEntitlements {
  const { isPro, isTrainerModule } = useCapabilities();
  return effectiveConnectEntitlements({ isPro, isTrainerModule });
}
