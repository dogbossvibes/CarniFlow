import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess, hasDiagnosticsAccess, DIAGNOSTICS_ACCESS_TTL_MS } from '../diagnosticsAccessState';
import { getQaPreferences, loadQaPreferences, setQaPreference, pinQaTrackingModes } from '@/features/tracking/utils/qaPreferences';
import { markWarmupStarted, markWarmupStopped } from '@/features/tracking/utils/trackingWarmupState';
import { applyInternalTesterEntitlements } from '@/features/subscription/internalTester';

jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn(async () => {}) } }));
const read = AsyncStorage.getItem as jest.Mock;
const write = AsyncStorage.setItem as jest.Mock;
const defaults = { source: 'precision', engine: 'current', diagnostics: false };
const grant = (id = 'owner') => { setDiagnosticsSession(id); resolveDiagnosticsAccess(id, getDiagnosticsAccessSnapshot().generation, true); };
beforeEach(() => { jest.useFakeTimers(); setDiagnosticsSession(null); read.mockReset().mockResolvedValue(null); write.mockClear(); });
afterEach(() => { markWarmupStopped(); revokeDiagnosticsAccess(); jest.useRealTimers(); });
it('never hydrates legacy global preferences before server authorization', async () => {
  read.mockResolvedValue(JSON.stringify({ source: 'legacy', engine: 'build40', diagnostics: true }));
  await loadQaPreferences(); setQaPreference('diagnostics', true);
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(getQaPreferences()).toEqual(defaults);
});
it('hydrates and writes only the authorized account namespace', async () => {
  grant(); read.mockResolvedValue(JSON.stringify({ source: 'legacy', diagnostics: true }));
  await loadQaPreferences(); expect(read).toHaveBeenCalledWith('anyvo.qa.preferences.v2.owner');
  expect(getQaPreferences()).toEqual({ source: 'legacy', engine: 'current', diagnostics: true });
  setQaPreference('engine', 'build40'); await Promise.resolve(); await Promise.resolve();
  expect(write).toHaveBeenCalledWith('anyvo.qa.preferences.v2.owner', expect.stringContaining('build40'));
});
it('discards a delayed preference load from an earlier account', async () => {
  grant(); let finish!: (v: string) => void; read.mockReturnValueOnce(new Promise(r => { finish = r; }));
  const pending = loadQaPreferences(); await Promise.resolve(); setDiagnosticsSession('other'); finish(JSON.stringify({ diagnostics: true, engine: 'build40' }));
  await pending; expect(getQaPreferences()).toEqual(defaults);
});
it('revokes observation immediately while keeping the running engine until stop', async () => {
  grant(); await loadQaPreferences(); setQaPreference('engine', 'build40'); setQaPreference('source', 'legacy'); setQaPreference('diagnostics', true);
  const release = pinQaTrackingModes();
  try {
    setQaPreference('engine', 'current'); expect(getQaPreferences().engine).toBe('build40');
    revokeDiagnosticsAccess(); expect(getQaPreferences()).toEqual({ engine: 'build40', source: 'legacy', diagnostics: false });
    expect(pinQaTrackingModes).toThrow();
  } finally { release(); }
  expect(getQaPreferences()).toEqual(defaults);
});
it('does not leak a pinned QA engine into another account', async () => {
  grant(); await loadQaPreferences(); setQaPreference('engine', 'build40'); const release = pinQaTrackingModes();
  try { grant('other'); await loadQaPreferences(); expect(pinQaTrackingModes).toThrow(); } finally { release(); }
  expect(getQaPreferences()).toEqual(defaults);
});
it('retains a background lay engine after the foreground source stops', async () => {
  grant(); await loadQaPreferences(); setQaPreference('engine', 'build40'); const release = pinQaTrackingModes();
  markWarmupStarted('build40', 'precision'); release(); revokeDiagnosticsAccess();
  expect(getQaPreferences().engine).toBe('build40'); markWarmupStopped(); expect(getQaPreferences()).toEqual(defaults);
});
it('expires an offline grant without enabling any persisted QA settings', async () => {
  grant(); await loadQaPreferences(); setQaPreference('diagnostics', true);
  jest.advanceTimersByTime(DIAGNOSTICS_ACCESS_TTL_MS); expect(hasDiagnosticsAccess()).toBe(false); expect(getQaPreferences().diagnostics).toBe(false);
});
it('does not change existing tester entitlements', () => {
  expect(applyInternalTesterEntitlements({ pro_member: false, trainer_module: false }, { isInternalTester: true, level: 'trainer' })).toEqual({ pro_member: true, trainer_module: true });
  expect(hasDiagnosticsAccess()).toBe(false);
});
