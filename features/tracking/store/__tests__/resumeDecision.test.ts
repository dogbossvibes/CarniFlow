import {
  resolveAutoResume, primaryResumeTarget, isRecordingStatus, startDecision, reopenTarget,
  upsertEntry, hasActiveFaehrte,
  type ActiveFaehrte, type ActiveFaehrtenMap,
} from '@/features/tracking/store/activeFaehrtenModel';

function mk(dogId: string, status: ActiveFaehrte['status'], over: Partial<ActiveFaehrte> = {}): ActiveFaehrte {
  return {
    dogId, sessionId: `sess-${dogId}`, runId: null, status,
    startedAt: 1000, layStartedAt: null,
    searchStartedAt: status === 'searching' ? 2000 : null,
    distanceMeters: 100, winkelCount: 3, objektCount: 2, gpsAccuracy: 4, weather: null,
    updatedAt: 5000, ...over,
  };
}
const mapOf = (...list: ActiveFaehrte[]): ActiveFaehrtenMap =>
  Object.fromEntries(list.map(e => [e.dogId, e]));

describe('Auto-Resume / Doppel-Session — reine Entscheidungen', () => {
  it('recording session (searching) → Auto-Resume in die Live-Suche', () => {
    const { target, entry } = resolveAutoResume([mk('d1', 'searching')]);
    expect(entry?.status).toBe('searching');
    expect(target).toBe('/track/run?dogId=d1&id=sess-d1');
  });

  it('recording session (laying) → Auto-Resume ins Legen', () => {
    const { target } = resolveAutoResume([mk('d1', 'laying')]);
    expect(target).toBe('/track/legen?dogId=d1&id=sess-d1');
  });

  it('paused/wartend (resting/laid) → KEIN Auto-Resume, aber Ein-Tap-Resume verfügbar', () => {
    expect(resolveAutoResume([mk('d1', 'resting')]).target).toBeNull();
    expect(resolveAutoResume([mk('d1', 'laid')]).target).toBeNull();
    // Bar/Card bieten weiterhin Ein-Tap-Resume in die passende Ansicht:
    expect(primaryResumeTarget([mk('d1', 'resting')]).target).toBe('/track/liegen?dogId=d1&id=sess-d1');
  });

  it('keine Session → normale Übersicht (kein Ziel)', () => {
    expect(resolveAutoResume([]).target).toBeNull();
    expect(primaryResumeTarget([]).target).toBeNull();
  });

  it('aktive Session + „Fährte legen" → conflict (keine zweite Session)', () => {
    const map = mapOf(mk('d1', 'laying'));
    expect(startDecision(map, 'd1')).toBe('conflict');
    expect(startDecision({}, 'd1')).toBe('start');
    expect(startDecision(map, 'd2')).toBe('start');   // anderer Hund → eigene Fährte erlaubt
  });

  it('finalized (completed) → aus Registry entfernt → kein Resume, start erlaubt', () => {
    const finalized = upsertEntry(mapOf(mk('d1', 'searching')), 'd1', { status: 'completed' });
    expect(hasActiveFaehrte(finalized, 'd1')).toBe(false);
    expect(resolveAutoResume(Object.values(finalized)).target).toBeNull();
    expect(startDecision(finalized, 'd1')).toBe('start');
  });

  it('isRecordingStatus: nur laying/searching', () => {
    expect(isRecordingStatus('laying')).toBe(true);
    expect(isRecordingStatus('searching')).toBe(true);
    expect(isRecordingStatus('resting')).toBe(false);
    expect(isRecordingStatus('laid')).toBe(false);
    expect(isRecordingStatus('completed')).toBe(false);
    expect(isRecordingStatus('cancelled')).toBe(false);
    expect(isRecordingStatus(null)).toBe(false);
  });

  it('mehrere aktive → Auto-Resume nimmt die laufende zuerst (sortActive)', () => {
    const { entry } = resolveAutoResume([
      mk('d1', 'resting', { updatedAt: 9000 }),
      mk('d2', 'searching', { updatedAt: 1000 }),
      mk('d3', 'laying', { updatedAt: 2000 }),
    ]);
    // laying (recording) vor searching → d3 zuerst
    expect(entry?.dogId).toBe('d3');
  });

  it('reopenTarget: statusabhängige Zielroute (inkl. dogId zur Rehydration)', () => {
    expect(reopenTarget(mk('d1', 'searching'))).toBe('/track/run?dogId=d1&id=sess-d1');
    expect(reopenTarget(mk('d1', 'laying'))).toBe('/track/legen?dogId=d1&id=sess-d1');
    expect(reopenTarget(mk('d1', 'resting'))).toBe('/track/liegen?dogId=d1&id=sess-d1');
    expect(reopenTarget(mk('d1', 'laid'))).toBe('/track/liegen?dogId=d1&id=sess-d1');
  });
});
