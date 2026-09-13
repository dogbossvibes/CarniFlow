import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useDiagnosticsAccess } from '@/hooks/useDiagnosticsAccess';

// Route-Gate für interne Diagnose-Screens (/dev/*). Dieselbe Authority wie der
// Profil-Eintrag (useDiagnosticsAccess → profiles.is_internal_tester, serverseitig
// per Trigger geschützt). Ein Deep-Link reicht damit nicht:
//   • Berechtigung offen (Profil lädt)  → nichts rendern, nicht umleiten
//   • keine Berechtigung                → nichts rendern, zurück ins Profil
//   • Berechtigung                      → Inhalt
// Fail closed: Fehler/kein Profil/kein Flag = keine Berechtigung.
export function DiagnosticsRouteGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { allowed, loading } = useDiagnosticsAccess();
  useEffect(() => {
    if (!loading && !allowed) router.replace('/(tabs)/profile' as never);
  }, [loading, allowed, router]);
  if (!allowed) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return <>{children}</>;
}
