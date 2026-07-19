// Tests für den internen Tester-Modus (jest-expo, `npm test`).
// Getestet wird die reine Berechtigungslogik (effectiveEntitlements) — genau
// die Funktion, die getMyCapabilities als letzten Schritt anwendet.
import {
  applyInternalTesterEntitlements,
  internalTesterStatusFromProfile,
  type EffectiveEntitlements,
} from '@/features/subscription/internalTester';
import { planLevelOf } from '@/types/capabilities';

const FREE: EffectiveEntitlements = { pro_member: false, trainer_module: false };
const ACTIVE: EffectiveEntitlements = { pro_member: true, trainer_module: false };
const NOT_TESTER = internalTesterStatusFromProfile({ is_internal_tester: false });
const TESTER = internalTesterStatusFromProfile({ is_internal_tester: true, tester_level: 'developer' });

describe('internalTesterStatusFromProfile', () => {
  it('leitet den Status ausschließlich aus dem Profil ab', () => {
    expect(internalTesterStatusFromProfile(null)).toEqual({ isInternalTester: false, level: null });
    expect(internalTesterStatusFromProfile({})).toEqual({ isInternalTester: false, level: null });
    expect(internalTesterStatusFromProfile({ is_internal_tester: true, tester_level: 'qa' }))
      .toEqual({ isInternalTester: true, level: 'qa' });
  });
});

describe('effectiveEntitlements', () => {
  // 1 — Normaler Nutzer ohne Premium: bleibt frei.
  it('normaler Nutzer ohne Premium hat keinen Zugriff', () => {
    const eff = applyInternalTesterEntitlements(FREE, NOT_TESTER);
    expect(eff).toEqual({ pro_member: false, trainer_module: false });
    expect(planLevelOf(eff)).toBe('free');
  });

  // 2 — RevenueCat Active: Premium aktiv, kein Trainer.
  it('RevenueCat Active bleibt unverändert (kein Tester)', () => {
    const eff = applyInternalTesterEntitlements(ACTIVE, NOT_TESTER);
    expect(eff).toEqual({ pro_member: true, trainer_module: false });
    expect(planLevelOf(eff)).toBe('pro');
  });

  // 3 — Interner Tester ohne RevenueCat: voller Zugriff (Active + Founder + Trainer).
  it('interner Tester erhält Premium OHNE RevenueCat', () => {
    const eff = applyInternalTesterEntitlements(FREE, TESTER);
    expect(eff).toEqual({ pro_member: true, trainer_module: true });
    expect(planLevelOf(eff)).toBe('trainer');
  });

  // 4 — RevenueCat + Tester: keine Konflikte, voller Zugriff.
  it('RevenueCat Active + Tester ergibt konfliktfrei vollen Zugriff', () => {
    const eff = applyInternalTesterEntitlements(ACTIVE, TESTER);
    expect(eff).toEqual({ pro_member: true, trainer_module: true });
  });

  // 5 — Tester entfernt: Premium verschwindet (Basis gilt wieder).
  it('nach Tester-Entzug gelten wieder die echten Rechte (Premium weg)', () => {
    const removed = internalTesterStatusFromProfile({ is_internal_tester: false, tester_level: null });
    const eff = applyInternalTesterEntitlements(FREE, removed);
    expect(eff).toEqual({ pro_member: false, trainer_module: false });
    expect(planLevelOf(eff)).toBe('free');
  });

  // 6 — Restore Purchases ändert nur die RevenueCat-Basis, nie den Testerstatus.
  it('Restore verändert die RevenueCat-Basis, nicht den Testerstatus', () => {
    // Tester-Status kommt aus dem Profil und ist unabhängig von der Basis.
    const beforeRestore = applyInternalTesterEntitlements(FREE, TESTER);
    const afterRestore = applyInternalTesterEntitlements(ACTIVE, TESTER); // Restore fand ein Abo
    expect(beforeRestore).toEqual({ pro_member: true, trainer_module: true });
    expect(afterRestore).toEqual({ pro_member: true, trainer_module: true });
    // Der Testerstatus selbst bleibt, egal was Restore an der Basis ändert.
    expect(TESTER.isInternalTester).toBe(true);
  });

  // 7 — Feature-Gates konsumieren die effektiven Entitlements.
  it('Feature-Gates sehen die effektiven Rechte des Testers', () => {
    const eff = applyInternalTesterEntitlements(FREE, TESTER);
    // planLevelOf ist die Basis für isPro/isTrainerModule in useCapabilities.
    expect(eff.pro_member).toBe(true);
    expect(eff.trainer_module).toBe(true);
    expect(planLevelOf(eff)).toBe('trainer');
  });
});
