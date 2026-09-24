import { readFileSync } from 'fs';
import { NEWBIE_QUOTA, quotaAllowsNew, quotaLimit } from '@/features/subscription/plans';

// ANYVO Customer Release Phase 2: NEWBIE bekommt 1 Fährte/Kalendermonat statt 0.
// Vorher sperrten app/track/index.tsx, legen.tsx, liegen.tsx und run.tsx den
// gesamten Fährten-Flow hart per isPro-Redirect/-Render-Gate — unabhängig von
// jeder Quota. Diese Suite belegt statisch, dass dieses Hard-Gate entfernt
// wurde und die serverautoritative Quota (claimNewbieQuota in legen.tsx
// begin()) als einziger Gate-Mechanismus übrig bleibt.
const GATE_ENTRY_POINTS = [
  'app/track/index.tsx',
  'app/track/legen.tsx',
  'app/track/liegen.tsx',
  'app/track/run.tsx',
] as const;

// legen.tsx behält useCapabilities() legitim für den Quota-Claim (isPro-Check in
// begin()) — nur die drei reinen Zugangs-Gates dürfen den Hook gar nicht mehr nutzen.
const NO_CAPABILITY_HOOK_AT_ALL = ['app/track/index.tsx', 'app/track/liegen.tsx', 'app/track/run.tsx'] as const;

describe('NEWBIE-Fährten-Zugang: kein Pro-only-Hardgate mehr', () => {
  it('keiner der vier Fährten-Screens redirected/blockiert mehr pauschal auf isPro', () => {
    for (const file of GATE_ENTRY_POINTS) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toMatch(/!capLoading\s*&&\s*!isPro/);
    }
  });

  it('index.tsx/liegen.tsx/run.tsx referenzieren useCapabilities gar nicht mehr', () => {
    for (const file of NO_CAPABILITY_HOOK_AT_ALL) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/useCapabilities/);
    }
  });

  it('legen.tsx: die serverautoritative Monats-Quota bleibt als einziges Gate erhalten', () => {
    const legen = readFileSync('app/track/legen.tsx', 'utf8');
    expect(legen).toContain("const { isPro } = useCapabilities();");
    expect(legen).toContain("if (!isPro) {");
    expect(legen).toContain("claimNewbieQuota('track', trackClaimRef.current)");
    expect(legen).toContain("handleQuotaBlock(block, 'track', t, () => router.push('/premium' as never));");
  });

  it('liegen.tsx / run.tsx: Fortsetzen einer bereits erlaubten Fährte bleibt ungegatet (kein zweiter Quota-Claim)', () => {
    const liegen = readFileSync('app/track/liegen.tsx', 'utf8');
    const run = readFileSync('app/track/run.tsx', 'utf8');
    expect(liegen).not.toMatch(/claimNewbieQuota/);
    expect(run).not.toMatch(/claimNewbieQuota/);
  });
});

describe('NEWBIE-Fährten-Quota (Client-Spiegel, features/subscription/plans.ts)', () => {
  it('NEWBIE_QUOTA.track = 1', () => {
    expect(NEWBIE_QUOTA.track).toBe(1);
  });
  it('1. Fährte im Monat erlaubt, 2. blockiert; Premium unbegrenzt', () => {
    expect(quotaLimit(false, 'track')).toBe(1);
    expect(quotaAllowsNew(false, 'track', 0)).toBe(true);
    expect(quotaAllowsNew(false, 'track', 1)).toBe(false);
    expect(quotaAllowsNew(true, 'track', 1)).toBe(true);
  });
});

describe('Plan-UI: NEWBIE-Karte wirbt mit 1 Fährte/Monat statt „keine Fährte"', () => {
  const premium = readFileSync('app/premium.tsx', 'utf8');
  it('premium.tsx nutzt featureOneTrackMonth, nicht mehr featureNoTrack', () => {
    expect(premium).not.toMatch(/featureNoTrack/);
    expect(premium).toMatch(/featureOneTrackMonth/);
  });
});
