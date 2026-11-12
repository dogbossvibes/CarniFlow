import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useDiagnosticsAccess } from '@/hooks/useDiagnosticsAccess';

// Shared personal-capability gate. No tester-role or local-mode fallback.
export function DiagnosticsRouteGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { allowed, loading } = useDiagnosticsAccess();
  useEffect(() => {
    if (!loading && !allowed) router.replace('/(tabs)/profile' as never);
  }, [loading, allowed, router]);
  if (!allowed) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return <>{children}</>;
}
