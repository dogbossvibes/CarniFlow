import { useProfile } from '@/hooks/useProfile';
import {
  internalTesterStatusFromProfile,
  type InternalTesterStatus,
  type TesterLevel,
} from '@/features/subscription/internalTester';

// ──────────────────────────────────────────────────────────────────────────
// Zugang zu internen Diagnose-Screens (Profil → „Entwickler & Diagnose" und
// Route-Gate für /dev/precision-location-test).
//
// EINE Authority, serverseitig: `profiles.is_internal_tester` / `tester_level`
// (INTERNAL_TESTER_SETUP.sql). Ein BEFORE-UPDATE-Trigger friert beide Felder für
// alle Rollen ausser service_role ein — ein normaler Nutzer kann sie über sein
// eigenes Profil-Update NICHT setzen. Gelesen wird nur die eigene Profilzeile
// (bestehender ['profile']-Cache), es gibt keine Liste im Bundle, keine E-Mail,
// keine UUID, kein DEV-Flag. `profiles.role` ist BEWUSST keine Grundlage
// (clientseitig änderbar / Trainer-Flows).
//
// Fail closed: Profil nicht geladen, Fehler, Flag fehlt → kein Zugang.
// ──────────────────────────────────────────────────────────────────────────

// Explizite Allowlist der internen Level (DB-Enum public.tester_level =
// developer | qa | trainer | admin, s. INTERNAL_TESTER_SETUP.sql / TesterLevel).
// 'trainer' (externe Trainer-Tester), null/undefined und unbekannte Werte
// bekommen KEINEN Diagnose-Zugang.
export const DIAGNOSTICS_TESTER_LEVELS: readonly TesterLevel[] = ['developer', 'qa', 'admin'];

/** Reine Regel: Flag gesetzt UND Level in der expliziten Allowlist. */
export function diagnosticsAccessFromTester(tester: InternalTesterStatus): boolean {
  return tester.isInternalTester === true
    && tester.level != null
    && (DIAGNOSTICS_TESTER_LEVELS as readonly string[]).includes(tester.level);
}

export function useDiagnosticsAccess(): { allowed: boolean; loading: boolean } {
  const { profile, loading } = useProfile();
  return { allowed: diagnosticsAccessFromTester(internalTesterStatusFromProfile(profile)), loading };
}
