// T-213: manuell gemeldete Fährtenverluste überleben Recovery-State und Sanitizer.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { sanitizeSearchRunState } from '@/features/tracking/store/searchRunState';

beforeEach(() => { useTrackingStore.getState().reset(); });

it('noteSearchManualBreaks übernimmt die Abriss-Liste und lässt den übrigen Suchzustand unverändert', () => {
  const before = useTrackingStore.getState().searchRunState;
  const breaks = [{ at: { latitude: 47, longitude: 8 }, t: 10, startedAtSec: 10, manual: true }];
  useTrackingStore.getState().noteSearchManualBreaks(breaks);
  const after = useTrackingStore.getState().searchRunState;
  expect(after).toEqual({ ...before, breaks });
});

it('der Sanitizer behält «manual» und erfindet es bei alten Einträgen nicht', () => {
  const clean = sanitizeSearchRunState({ breaks: [
    { at: { latitude: 47, longitude: 8 }, t: 10, startedAtSec: 10, manual: true },
    { at: { latitude: 47, longitude: 8 }, t: 30, startedAtSec: 28, recoveredAtSec: 40, durationSec: 12 },
    { at: { latitude: 47, longitude: 8 }, t: 50, startedAtSec: 50, manual: 'ja' },
  ] });
  expect(clean.breaks[0].manual).toBe(true);
  expect('manual' in clean.breaks[1]).toBe(false);
  expect('manual' in clean.breaks[2]).toBe(false);
  expect(clean.breaks[1]).toMatchObject({ recoveredAtSec: 40, durationSec: 12 });
});

// T-222: per Taste «Abgekürzt» gemeldete Abkürzungen.
it('noteSearchShortcut hängt an und lässt den übrigen Suchzustand unverändert', () => {
  const before = useTrackingStore.getState().searchRunState;
  useTrackingStore.getState().noteSearchShortcut({ tSec: 12, progressM: 8 });
  useTrackingStore.getState().noteSearchShortcut({ tSec: 20, progressM: 14 });
  const after = useTrackingStore.getState().searchRunState;
  expect(after).toEqual({ ...before, shortcuts: [{ tSec: 12, progressM: 8 }, { tSec: 20, progressM: 14 }] });
});

it('der Sanitizer behält gültige Abkürzungen, verwirft kaputte und erfindet bei alten Puffern keine', () => {
  const clean = sanitizeSearchRunState({ shortcuts: [{ tSec: 12, progressM: 8 }, { tSec: 'x', progressM: 3 }, null, { tSec: -1, progressM: -2 }] });
  expect(clean.shortcuts).toEqual([{ tSec: 12, progressM: 8 }, { tSec: 0, progressM: 0 }]);
  expect('shortcuts' in sanitizeSearchRunState({ breaks: [] })).toBe(false);
  expect('shortcuts' in sanitizeSearchRunState({ shortcuts: 'kaputt' })).toBe(false);
});
