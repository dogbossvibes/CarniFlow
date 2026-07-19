import { useProfile } from '@/hooks/useProfile';
import {
  internalTesterStatusFromProfile,
  type InternalTesterStatus,
} from '@/features/subscription/internalTester';

// Interner Tester-Status, abgeleitet aus dem (bereits gecachten) Profil.
// Wird das Flag in Supabase auf FALSE gesetzt, verschwindet der Status beim
// nächsten Profil-Load (Login / ['profile']-Invalidation) — es gibt keinen
// lokalen Cache und keine ENV. Quelle ist ausschließlich profiles.is_internal_tester.
export function useInternalTester(): InternalTesterStatus {
  const { profile } = useProfile();
  return internalTesterStatusFromProfile(profile);
}
