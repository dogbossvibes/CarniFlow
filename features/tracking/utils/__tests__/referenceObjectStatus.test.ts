import { objectPassMarginM, statusAfterProgress, statusAtConfirmedEnd } from '../referenceObjectStatus';

it('marks a clearly passed earlier object missed without losing found and removed states', () => {
  expect(objectPassMarginM(4)).toBe(2);
  expect(objectPassMarginM(12)).toBe(4);
  expect(statusAfterProgress({ status: 'pending', referenceArcM: 10, handlerProgressM: 12,
    accuracyM: 4, isFinalObject: false })).toBe('pending');
  expect(statusAfterProgress({ status: 'pending', referenceArcM: 10, handlerProgressM: 13,
    accuracyM: 4, isFinalObject: false })).toBe('missed');
  for (const status of ['manual_found', 'auto_dwell_found', 'user_removed'] as const) {
    expect(statusAfterProgress({ status, referenceArcM: 10, handlerProgressM: 30,
      accuracyM: 4, isFinalObject: false })).toBe(status);
  }
});

it('holds the final object pending until end confirmation, then marks it missed', () => {
  const pending = statusAfterProgress({ status: 'pending', referenceArcM: 30, handlerProgressM: 50,
    accuracyM: 4, isFinalObject: true });
  expect(pending).toBe('pending');
  expect(statusAtConfirmedEnd(pending)).toBe('missed');
  expect(statusAtConfirmedEnd('auto_dwell_found')).toBe('auto_dwell_found');
  expect(statusAtConfirmedEnd('user_removed')).toBe('user_removed');
});
