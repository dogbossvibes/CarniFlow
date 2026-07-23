import type { ConnectProfile } from '@/features/connect/types/connect.types';

// CONNECT-Onboarding nur zeigen, wenn:
//   • Nutzer bei ANYVO angemeldet ist UND
//   • noch KEIN connect_profiles-Datensatz existiert.
// (Der Feature-Flag wird vom Aufrufer/der Navigation davor geprüft.)
export function shouldShowConnectOnboarding(input: {
  isLoggedIn: boolean;
  connectProfile: ConnectProfile | null | undefined;
}): boolean {
  return input.isLoggedIn === true && (input.connectProfile == null);
}
