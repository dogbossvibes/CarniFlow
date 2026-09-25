import { readFileSync } from 'fs';

// ANYVO Customer Release Phase 10 — fix "Meine Trainer" opening the
// subscription paywall for NEWBIE/ACTIVE. Root cause: app/trainer/_layout.tsx
// applied a blanket trainer_module redirect to the ENTIRE /trainer/* route
// group (including index.tsx, "Meine Trainer", which never gated itself).

describe('app/trainer/_layout.tsx: no blanket capability gate on the route group', () => {
  const content = readFileSync('app/trainer/_layout.tsx', 'utf8');
  it('no longer redirects based on isTrainerModule/useCapabilities — the group-wide paywall is gone', () => {
    expect(content).not.toMatch(/useCapabilities/);
    expect(content).not.toMatch(/isTrainerModule/);
    expect(content).not.toMatch(/Redirect/);
  });
  it('is a plain Stack wrapper', () => {
    expect(content).toMatch(/return \(\s*<Stack screenOptions=\{\{ headerShown: false, contentStyle: \{ backgroundColor: C\.bg \} \}\} \/>\s*\);/);
  });
});

describe('app/trainer/index.tsx ("Meine Trainer"): still ungated — free for every plan', () => {
  const content = readFileSync('app/trainer/index.tsx', 'utf8');
  it('no capability gate anywhere in this screen', () => {
    expect(content).not.toMatch(/\bisPro\b|pro_member|useCapabilities/);
  });
});

describe('Professional-only screens under app/trainer/*: each carries its OWN isTrainerModule gate now that the layout no longer gates them', () => {
  const cases: [string, string][] = [
    ['app/trainer/dashboard.tsx', 'trainer dashboard (pre-existing gate)'],
    ['app/trainer/plaene.tsx', "trainer's own plan list (pre-existing gate)"],
    ['app/trainer/edit.tsx', 'trainer profile create/edit (pre-existing gate, Phase 8)'],
    ['app/trainer/registrieren.tsx', 'legacy profiles.is_trainer self-registration (new gate, Phase 10)'],
    ['app/trainer/plan-neu.tsx', 'create a new plan (new gate, Phase 10)'],
  ];
  it.each(cases)('%s (%s) imports useCapabilities and checks isTrainerModule', (path) => {
    const content = readFileSync(path, 'utf8');
    expect(content).toMatch(/useCapabilities/);
    expect(content).toMatch(/isTrainerModule/);
  });
});

describe('app/trainer/plan/[id].tsx: intentionally dual-use, no capability gate', () => {
  const content = readFileSync('app/trainer/plan/[id].tsx', 'utf8');
  it('has no trainer_module gate — a client the plan is shared_with must keep reading it, access is enforced by training_plans RLS instead', () => {
    expect(content).not.toMatch(/useCapabilities|isTrainerModule/);
  });
});

describe('Every "Trainer verbinden" entry point still routes to the now-ungated /trainer (Meine Trainer), not a professional screen', () => {
  it('Profile → Meine Trainer → /trainer', () => {
    const content = readFileSync('app/(tabs)/profile.tsx', 'utf8');
    expect(content).toMatch(/onPress=\{\(\) => router\.push\('\/trainer'\)\}/);
  });
  it('Track Sharing CTA → /trainer', () => {
    const content = readFileSync('app/track/[id].tsx', 'utf8');
    expect(content).toMatch(/router\.push\('\/trainer' as never\)/);
  });
  it("clients.tsx (professional 'Meine Kunden') redirects non-trainers to /trainer — now a real landing, not a hidden second paywall", () => {
    const content = readFileSync('app/(tabs)/clients.tsx', 'utf8');
    expect(content).toMatch(/router\.replace\('\/trainer' as never\)/);
  });
});

describe('training_plans server-side entitlement (20260929080000) — second gap found while root-causing this bug', () => {
  const migration = readFileSync('supabase/migrations/20260929080000_training_plans_entitlement.sql', 'utf8');
  it('replaces the single unscoped "trainer manage plans" policy', () => {
    expect(migration).toMatch(/drop policy if exists "trainer manage plans" on public\.training_plans;/);
  });
  it('INSERT is gated on is_trainer_module (reuses the Phase 9 helper, no new function)', () => {
    expect(migration).toMatch(/create policy training_plans_trainer_insert[\s\S]*?with check \(trainer_id = auth\.uid\(\) and public\.is_trainer_module\(auth\.uid\(\)\)\)/);
  });
  it('SELECT/UPDATE/DELETE stay ownership-only — a lapsed trainer keeps managing plans they already created', () => {
    expect(migration).toMatch(/create policy training_plans_trainer_select[\s\S]*?using \(trainer_id = auth\.uid\(\)\)/);
    expect(migration).toMatch(/create policy training_plans_trainer_update[\s\S]*?using \(trainer_id = auth\.uid\(\)\)/);
    expect(migration).not.toMatch(/create policy training_plans_trainer_update[\s\S]{0,200}is_trainer_module/);
    expect(migration).toMatch(/create policy training_plans_trainer_delete[\s\S]*?using \(trainer_id = auth\.uid\(\)\)/);
  });
  it('"clients read shared plans" (client-side read of shared plans) has no DDL statement in this migration — untouched', () => {
    expect(migration).not.toMatch(/(drop|create|alter)\s+policy\s+"clients read shared plans"/);
  });
  it('no destructive statement: no data touched, no row deleted, no table/column dropped', () => {
    const code = migration.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bdelete\s+from\b|\bupdate\s+public\.training_plans\b|\btruncate\b|drop\s+table|drop\s+column/i);
  });
});

describe('Plan copy unchanged: NEWBIE/ACTIVE keep featureTrainerConnect, featureNoTrainer stays removed', () => {
  const content = readFileSync('app/premium.tsx', 'utf8');
  it('NEWBIE and ACTIVE cards still include premium.featureTrainerConnect', () => {
    const newbie = content.match(/\{ plan: 'newbie'[\s\S]*?\},/)?.[0] ?? '';
    const active = content.match(/\{ plan: 'active'[\s\S]*?\},/)?.[0] ?? '';
    expect(newbie).toMatch(/'premium\.featureTrainerConnect'/);
    expect(active).toMatch(/'premium\.featureTrainerConnect'/);
  });
  it('featureNoTrainer stays removed', () => {
    expect(content).not.toMatch(/featureNoTrainer/);
  });
});
