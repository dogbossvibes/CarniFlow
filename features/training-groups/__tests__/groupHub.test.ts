import { secondsUntilMidnight } from '../groupHub';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: null }) }));
jest.mock('@/features/tracking-exchange/live/LiveShareProvider', () => ({ useGroupLiveShare: () => ({ client: {} }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));

describe('Gruppentraining bis Mitternacht', () => {
  it('läuft bis 23:59', () => { expect(secondsUntilMidnight(new Date(2026, 10, 14, 9, 0, 0))).toBe((14 * 60 + 59) * 60); });
  it('mindestens 2 Stunden', () => { expect(secondsUntilMidnight(new Date(2026, 10, 14, 23, 30, 0))).toBe(7200); });
});
