// Interner Tester-Modus (nur interne Entwickler / ausgewählte Tester).
//
// Grundsätze (siehe INTERNAL_TESTER_SETUP.sql):
//   • Der Status kommt AUSSCHLIESSLICH aus Supabase (profiles.is_internal_tester).
//     Keine ENV, keine hartkodierte Mailadresse, keine Liste im Code, kein
//     lokaler Speicher. Ein DB-Trigger verhindert, dass normale Nutzer das Flag
//     selbst setzen (nur service_role darf es ändern).
//   • RevenueCat bleibt UNVERÄNDERT. Tester-Rechte werden nur innerhalb der
//     Berechtigungslogik als Union ergänzt:
//         effectiveEntitlements = RevenueCatEntitlements + InternalTesterEntitlements
//   • Ein interner Tester erhält Active + Founder Active + Trainer, also vollen
//     Zugriff (pro_member + trainer_module) ohne echten Kauf.
//
// Dieses Modul ist bewusst PUR (keine Imports, kein Supabase) und damit
// vollständig unit-testbar.

export type TesterLevel = 'developer' | 'qa' | 'trainer' | 'admin';

export interface InternalTesterStatus {
  isInternalTester: boolean;
  level: TesterLevel | null;
}

// Runtime-Berechtigungen (Spiegel von UserCapabilities, hier entkoppelt gehalten).
export interface EffectiveEntitlements {
  pro_member: boolean;
  trainer_module: boolean;
}

/**
 * Vereinigt echte Entitlements mit den Tester-Entitlements.
 * - Kein Tester → unverändert (echte RevenueCat/Abo-Rechte gelten).
 * - Tester      → voller Zugriff (pro_member + trainer_module), zusätzlich zu
 *   allem, was RevenueCat ohnehin liefert. RevenueCat wird nicht angefasst.
 */
export function applyInternalTesterEntitlements(
  base: EffectiveEntitlements,
  tester: InternalTesterStatus,
): EffectiveEntitlements {
  if (!tester.isInternalTester) return base;
  return {
    pro_member: true,
    trainer_module: true,
  };
}

/** Tester-Status defensiv aus einem (Teil-)Profil ableiten. */
export function internalTesterStatusFromProfile(
  profile: { is_internal_tester?: boolean | null; tester_level?: TesterLevel | null } | null | undefined,
): InternalTesterStatus {
  return {
    isInternalTester: profile?.is_internal_tester === true,
    level: profile?.tester_level ?? null,
  };
}
