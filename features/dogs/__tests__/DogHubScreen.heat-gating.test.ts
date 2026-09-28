// Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026) — Section: "Dog Hub
// — Hündinnen only". This gating logic already existed, UNCHANGED, in
// DogHubScreen.tsx before this feature (confirmed by source read during the
// audit, not modified here). DogHubScreen has a very large dependency
// surface (many child cards/hooks); rather than build a full render-mock
// suite for logic this patch never touches, this suite verifies the exact
// gating expressions directly from source — the same "structural shell"
// approach already established in this codebase for exactly this cost/
// benefit tradeoff (e.g. app/dog-health-record/__tests__/weight-entry.test
// .tsx's own Backpack-parity structural-shell suite).
import { readFileSync } from 'fs';

const content = readFileSync('features/dogs/DogHubScreen.tsx', 'utf8');

describe('DogHubScreen — Läufigkeit/Heat gating is female-only (verified from source)', () => {
  it('isFemale is derived from the actual stored gender value, not assumed', () => {
    expect(content).toMatch(/const isFemale = id\.gender === 'female';/);
  });

  it('the heat prediction itself is nulled out for a non-female dog — never computed/shown at all', () => {
    expect(content).toMatch(/const heatPred = isFemale \? \(heat\?\.prediction \?\? null\) : null;/);
  });

  it('the "heat" tab is filtered out of the tab bar entirely for a non-female dog — the tab does not exist, not merely hidden content', () => {
    expect(content).toMatch(/TABS\.filter\(tb => tb\.key !== 'heat' \|\| id\.gender === 'female'\)/);
  });

  it('DogHeatCard itself is only rendered when isFemale — conditionally mounted, not rendered-then-hidden', () => {
    const block = content.match(/\{isFemale && heat && \([\s\S]{0,400}?<DogHeatCard[\s\S]{0,400}?\/>[\s\S]{0,50}?\)/)?.[0] ?? '';
    expect(block).toContain('DogHeatCard');
  });

  it('gender gating is keyed on the DOG\'s own gender (id.gender) — not on which user account is viewing', () => {
    // The task explicitly requires this to hold for trainer/shared views too:
    // "Das Geschlecht des Hundes ist entscheidend, nicht das Benutzerkonto."
    // isFemale is computed once from `id` (the dog identity prop) and reused
    // everywhere below — there is no second, account-based gate anywhere in
    // this file that could override it.
    expect(content).not.toMatch(/isFemale\s*=\s*.*user/);
    expect(content).not.toMatch(/isFemale\s*=\s*.*session/);
  });
});
