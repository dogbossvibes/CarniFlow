jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BASE_CAPABILITIES, PREMIUM_CAPABILITIES, TRAINER_CAPABILITIES, NEWBIE_QUOTA,
  NEWBIE_COMMAND_LIMIT, quotaLimit, quotaAllowsNew, hasCapability,
} from '@/features/subscription/plans';
import { addCommand, getCommands, deleteCommand } from '@/features/dogs/dogCommands';

// ANYVO Customer Release Phase 8 — real iPhone RC testing found NEWBIE/ACTIVE
// incorrectly paywalled out of Trainer Connect, Health Record/Sharing and
// Backpack, and a misrouted Track Sharing CTA that surfaced the professional
// "Kunden"/"Trainer-Profil anlegen" screen to normal clients. This suite
// proves the authoritative model from that phase: CONNECT WITH A TRAINER is
// separate from and never requires BE A TRAINER.

describe('NEWBIE — core model', () => {
  it('quotas: dog=1, training=2/month, track=1/month', () => {
    expect(NEWBIE_QUOTA).toEqual({ dog: 1, training: 2, track: 1 });
  });
  it('first monthly track allowed, next blocked until reset', () => {
    expect(quotaAllowsNew(false, 'track', 0)).toBe(true);
    expect(quotaAllowsNew(false, 'track', 1)).toBe(false);
  });
  it('Backpack is a BASE capability (allowed, not premium-gated)', () => {
    expect(BASE_CAPABILITIES).toContain('dogs.backpack');
    expect(PREMIUM_CAPABILITIES).not.toContain('dogs.backpack');
    expect(hasCapability({ plan: 'newbie', status: 'active' }, 'dogs.backpack')).toBe(true);
  });
  it('Commands is a BASE capability, capped at NEWBIE_COMMAND_LIMIT=5 (enforced in dogCommands.ts, not this capability system)', () => {
    expect(BASE_CAPABILITIES).toContain('dogs.commands');
    expect(PREMIUM_CAPABILITIES).not.toContain('dogs.commands');
    expect(hasCapability({ plan: 'newbie', status: 'active' }, 'dogs.commands')).toBe(true);
    expect(NEWBIE_COMMAND_LIMIT).toBe(5);
  });
  it('professional Trainer capabilities remain locked', () => {
    for (const c of TRAINER_CAPABILITIES) {
      expect(hasCapability({ plan: 'newbie', status: 'active' }, c)).toBe(false);
    }
  });
  it('Health Record/Sharing have no capability gate at all (base product behavior, unaffected by plan)', () => {
    // No 'dogs.health' capability exists by design (see plans.ts comment) —
    // Health screens must never reference isPro/useCapabilities at all.
    for (const file of ['app/dog-health-record/[id].tsx', 'app/dog-health-sharing/[id].tsx']) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toMatch(/\bisPro\b/);
    }
  });
});

describe('ACTIVE — core model', () => {
  const sub = { plan: 'active' as const, status: 'active' as const };
  it('unlimited dog/training/track', () => {
    expect(quotaLimit(true, 'dog')).toBe(Infinity);
    expect(quotaAllowsNew(true, 'training', 9999)).toBe(true);
    expect(quotaAllowsNew(true, 'track', 9999)).toBe(true);
  });
  it('Backpack and unlimited Commands allowed', () => {
    expect(hasCapability(sub, 'dogs.backpack')).toBe(true);
    expect(hasCapability(sub, 'dogs.commands')).toBe(true);
  });
  it('professional Trainer Hub is NOT automatically granted', () => {
    for (const c of TRAINER_CAPABILITIES) expect(hasCapability(sub, c)).toBe(false);
  });
});

describe('TRAINER — retains ACTIVE + professional capabilities', () => {
  const sub = { plan: 'trainer' as const, status: 'active' as const };
  it('all ACTIVE-equivalent base+premium capabilities retained', () => {
    for (const c of [...BASE_CAPABILITIES, ...PREMIUM_CAPABILITIES]) expect(hasCapability(sub, c)).toBe(true);
  });
  it('professional Trainer capabilities granted', () => {
    for (const c of TRAINER_CAPABILITIES) expect(hasCapability(sub, c)).toBe(true);
  });
});

describe('Trainer Connect entry points — ungated for every plan, never paywalled', () => {
  it('app/trainer/index.tsx (client connect: search/code) has zero capability gate', () => {
    const content = readFileSync('app/trainer/index.tsx', 'utf8');
    expect(content).not.toMatch(/\bisPro\b|pro_member|trainer_module|useCapabilities/);
  });
  it('services/trainerService.ts connect functions (searchTrainers, findTrainerByCode, redeemTrainerCode) have no capability check', () => {
    const content = readFileSync('services/trainerService.ts', 'utf8');
    const searchFn = content.match(/export async function searchTrainers[\s\S]*?\n\}/)?.[0] ?? '';
    const codeFn = content.match(/export async function findTrainerByCode[\s\S]*?\n\}/)?.[0] ?? '';
    const redeemFn = content.match(/export async function redeemTrainerCode[\s\S]*?\n\}\n/)?.[0] ?? '';
    for (const fn of [searchFn, codeFn, redeemFn]) {
      expect(fn).not.toMatch(/isPro|pro_member|trainer_module/);
    }
  });
});

describe('Professional Trainer functionality — stays gated behind trainer_module specifically, never generic isPro', () => {
  it('app/trainer-hub.tsx gates on isTrainerModule, redirects to analytics (not premium)', () => {
    const content = readFileSync('app/trainer-hub.tsx', 'utf8');
    expect(content).toMatch(/!isTrainerModule/);
    expect(content).toMatch(/<Redirect href="\/\(tabs\)\/analytics" \/>/);
  });
  it('app/(tabs)/clients.tsx (professional client management, "Trainer-Profil anlegen") gates on isTrainerModule, redirects a non-trainer to /trainer (client connect), not to a paywall', () => {
    const content = readFileSync('app/(tabs)/clients.tsx', 'utf8');
    expect(content).toMatch(/isTrainerModule/);
    expect(content).not.toMatch(/\bisPro\b/);
    expect(content).toMatch(/router\.replace\('\/trainer' as never\)/);
  });
  it('app/trainer/edit.tsx (create a professional Trainer profile) gates NEW creation on isTrainerModule, redirects to /premium — but never blocks an existing trainer from editing their own profile', () => {
    const content = readFileSync('app/trainer/edit.tsx', 'utf8');
    expect(content).toMatch(/isTrainerModule/);
    expect(content).not.toMatch(/\bisPro\b/);
    expect(content).toMatch(/!isTrainerModule && !existing/);
    expect(content).toMatch(/router\.replace\('\/premium' as never\)/);
  });
  it('Track Sharing "Trainer verbinden" CTA routes to the client connect screen, never to professional client management', () => {
    const content = readFileSync('app/track/[id].tsx', 'utf8');
    expect(content).not.toMatch(/router\.push\('\/\(tabs\)\/clients' as never\)/);
    expect(content).toMatch(/router\.push\('\/trainer' as never\)/);
  });
});

describe('Commands quota enforcement (features/dogs/dogCommands.ts) — service-layer, not UI-only', () => {
  const dogId = 'phase8-test-dog';
  const cmd = (n: number) => ({
    name: `Cmd${n}`, category: 'sport' as const, area: null, verbalCue: `Cmd${n}`, handSignal: null,
    goal: null, description: null, steps: [], tips: [], commonMistakes: [], difficulty: 'easy' as const, isFavorite: false,
  });

  beforeEach(async () => { await AsyncStorage.clear(); });

  it('NEWBIE (limit=5): commands #1-5 allowed, #6 blocked; deleting one frees a slot', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await addCommand(dogId, cmd(i), { limit: 5 });
      expect(res.blocked).toBe(false);
      expect(res.data).not.toBeNull();
    }
    expect((await getCommands(dogId)).length).toBe(5);
    const sixth = await addCommand(dogId, cmd(6), { limit: 5 });
    expect(sixth.blocked).toBe(true);
    expect(sixth.data).toBeNull();
    expect((await getCommands(dogId)).length).toBe(5); // 6th never persisted

    // Free a slot by removing one, then the next add succeeds again.
    const list = await getCommands(dogId);
    await deleteCommand(dogId, list[0].id);
    const afterFree = await addCommand(dogId, cmd(7), { limit: 5 });
    expect(afterFree.blocked).toBe(false);
  });

  it('ACTIVE/TRAINER (no limit passed): unlimited commands', async () => {
    for (let i = 1; i <= 12; i++) {
      const res = await addCommand(dogId, cmd(i));
      expect(res.blocked).toBe(false);
    }
    expect((await getCommands(dogId)).length).toBe(12);
  });
});
