/**
 * Search-Recovery-State — Typen/Sanitizer (rein) + Store-Persistenz über den
 * bestehenden PendingTrack (AsyncStorage-Mock), inkl. Reset/Cleanup-Szenarien.
 */
import { freshSearchRunState, sanitizeSearchRunState, searchObjectKey } from '@/features/tracking/store/searchRunState';
import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { loadPending, type PendingTrack } from '@/features/tracking/store/trackPersist';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const pt = (lat: number, lng: number, t: number): TrackPointSample => ({ lat, lng, t, accuracy: 5 });
const flush = () => new Promise(r => setTimeout(r, 0));

describe('sanitizeSearchRunState — legacy-sicher (17.)', () => {
  it('undefined/null/garbage → FRESH (dokumentierte Legacy-Degradation, kein Crash)', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) {
      expect(sanitizeSearchRunState(raw)).toEqual(freshSearchRunState());
    }
  });
  it('vollständiger State wird 1:1 übernommen', () => {
    const full = {
      maxCursorM: 40.5, devSumM: 12.3, devCount: 7,
      foundObjectIds: ['gegenstand-1', 'gegenstand-2'], autoDwellObjectIds: [], dismissedAutoDwellIds: [],
      voiceFiredIds: ['angle-1-rechts'], hapticFiredIds: ['angle-1-rechts', 'gegenstand-1'],
      endFired: true, segmentAnnouncements: { seg1: { announcedApproach: true, announcedStart: true, announcedEnd: false } },
      breaks: [{ at: { latitude: 47, longitude: 8 }, t: 12, startedAtSec: 9.5, recoveredAfterM: 30, recoveredAtSec: 20, durationSec: 10.5 }],
      offTrackState: 'warning',
    };
    expect(sanitizeSearchRunState(full)).toEqual(full);
  });
  it('kaputte Teilfelder → sichere Defaults, gültige Felder bleiben', () => {
    const r = sanitizeSearchRunState({
      maxCursorM: -5, devSumM: 'x', devCount: 2.7, foundObjectIds: ['a', 3, null], voiceFiredIds: 'nope',
      endFired: 'true', segmentAnnouncements: { s: { announcedStart: true }, bad: 1 },
      breaks: [{ at: { latitude: 1 } }, { at: { latitude: 1, longitude: 2 } }, 'x'], offTrackState: 'lost',
    });
    expect(r.maxCursorM).toBe(0);
    expect(r.devSumM).toBe(0);
    expect(r.devCount).toBe(2);
    expect(r.foundObjectIds).toEqual(['a']);
    expect(r.voiceFiredIds).toEqual([]);
    expect(r.endFired).toBe(false);
    expect(r.segmentAnnouncements).toEqual({ s: { announcedApproach: false, announcedStart: true, announcedEnd: false } });
    expect(r.breaks).toEqual([{ at: { latitude: 1, longitude: 2 }, t: 0, startedAtSec: 0 }]);
    expect(r.offTrackState).toBe('on_track');
  });
  it('searchObjectKey: Marker-ID vor Index', () => {
    expect(searchObjectKey({ id: 'gegenstand-77' }, 3)).toBe('gegenstand-77');
    expect(searchObjectKey({}, 3)).toBe('idx:3');
  });
});

describe('Store — Search-Recovery-State im PendingTrack', () => {
  beforeEach(() => { useTrackingStore.getState().reset(); });
  afterEach(() => { useTrackingStore.getState().reset(); });

  it('1. neuer Search → FRESH (progress 0)', async () => {
    const st = useTrackingStore.getState();
    st.startSearchSession('run1', 1000);
    await flush();
    expect(useTrackingStore.getState().searchRunState).toEqual(freshSearchRunState());
    const p = await loadPending();
    expect(p!.searchRun).toEqual(freshSearchRunState());
    expect(p!.runId).toBe('run1');
  });

  it('2./3. Fortschritt bis 40 m wird persistiert; maxCursorM nie rückwärts', async () => {
    const st = useTrackingStore.getState();
    st.startSearchSession('run1', 1000);
    st.noteSearchRunProgress({ maxCursorM: 25, devSumM: 3, devCount: 2, breaks: [] });
    st.noteSearchRunProgress({ maxCursorM: 40, devSumM: 5, devCount: 4, breaks: [] });
    st.noteSearchRunProgress({ maxCursorM: 12, devSumM: 6, devCount: 5, breaks: [] });   // rückwärts → ignoriert
    expect(useTrackingStore.getState().searchRunState.maxCursorM).toBe(40);
    expect(useTrackingStore.getState().searchRunState.devCount).toBe(5);
    st.noteSearchObjectFound('gegenstand-1');   // persistNow → schreibt den Snapshot sofort
    await flush();
    const p = await loadPending();
    expect(p!.searchRun!.maxCursorM).toBe(40);
    expect(p!.searchRun!.foundObjectIds).toEqual(['gegenstand-1']);
  });

  it('3./5./7./8./10./13. Restore nach „App-Kill" liefert denselben Run-State', async () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(pt(47.1, 8.1, 500));
    st.startSearchSession('runX', 2000);
    st.noteSearchRunProgress({ maxCursorM: 30, devSumM: 4, devCount: 3, breaks: [{ at: { latitude: 47, longitude: 8 }, t: 10, startedAtSec: 6 }] });
    st.noteSearchVoiceFired('angle-10-rechts');
    st.noteSearchHapticFired('angle-10-rechts');
    st.noteSearchHapticFired('gegenstand-1');     // Haptik fired, Voice noch nicht (7.)
    st.noteSearchObjectFound('gegenstand-1');
    st.noteSearchObjectFound('gegenstand-1');     // idempotent
    st.setSearchSegmentAnnouncements({ seg1: { announcedApproach: true, announcedStart: true, announcedEnd: false } });
    st.noteSearchEndFired();
    st.noteSearchOffTrackState('off_track');
    await flush();
    const p = await loadPending();
    // Prozess-Neustart: Store leeren (ohne clearPending) und aus dem Puffer zurückspielen.
    useTrackingStore.getState().reset();
    useTrackingStore.getState().restoreSearchSession(p as PendingTrack);
    const rs = useTrackingStore.getState().searchRunState;
    expect(rs).toEqual({
      maxCursorM: 30, devSumM: 4, devCount: 3,
      foundObjectIds: ['gegenstand-1'], autoDwellObjectIds: [], dismissedAutoDwellIds: [],
      voiceFiredIds: ['angle-10-rechts'], hapticFiredIds: ['angle-10-rechts', 'gegenstand-1'],
      endFired: true, segmentAnnouncements: { seg1: { announcedApproach: true, announcedStart: true, announcedEnd: false } },
      breaks: [{ at: { latitude: 47, longitude: 8 }, t: 10, startedAtSec: 6 }], offTrackState: 'off_track',
    });
    expect(useTrackingStore.getState().searchRunId).toBe('runX');
  });

  it('14. neue runId derselben Fährte → alle Recovery-Zustände frisch', async () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(pt(47.1, 8.1, 500));
    st.startSearchSession('run1', 1000);
    st.noteSearchRunProgress({ maxCursorM: 55, devSumM: 1, devCount: 1, breaks: [] });
    st.noteSearchVoiceFired('a'); st.noteSearchHapticFired('a'); st.noteSearchObjectFound('o'); st.noteSearchEndFired();
    st.setSearchSegmentAnnouncements({ s: { announcedApproach: true, announcedStart: false, announcedEnd: false } });
    st.noteSearchOffTrackState('warning');
    st.startSearchSession('run2', 5000);
    await flush();
    expect(useTrackingStore.getState().searchRunState).toEqual(freshSearchRunState());
    const p = await loadPending();
    expect(p!.runId).toBe('run2');
    expect(p!.searchRun).toEqual(freshSearchRunState());
    expect(useTrackingStore.getState().trackPoints).toHaveLength(1);   // gelegte Fährte bleibt
  });

  it('15. discard (resetSearchPoints) → danach kein alter State', () => {
    const st = useTrackingStore.getState();
    st.startSearchSession('run1', 1000);
    st.noteSearchRunProgress({ maxCursorM: 20, devSumM: 0, devCount: 0, breaks: [] });
    st.noteSearchVoiceFired('a');
    st.resetSearchPoints();
    expect(useTrackingStore.getState().searchRunState).toEqual(freshSearchRunState());
    expect(useTrackingStore.getState().searchTrackPoints).toEqual([]);
  });

  it('16. completed/„Beenden" (reset) → Puffer geleert, kein Überlauf', async () => {
    const st = useTrackingStore.getState();
    st.startSearchSession('run1', 1000);
    st.noteSearchObjectFound('o');
    await flush();
    expect((await loadPending())!.searchRun!.foundObjectIds).toEqual(['o']);
    useTrackingStore.getState().setSessionStatus('completed');
    useTrackingStore.getState().reset();
    await flush();
    expect(await loadPending()).toBeNull();
    expect(useTrackingStore.getState().searchRunState).toEqual(freshSearchRunState());
  });

  it('17. Legacy-Pending ohne searchRun → restoreSearchSession liefert FRESH (kein Crash)', () => {
    const legacy = {
      sessionId: 's', trackPoints: [pt(47, 8, 1)], markers: [], runPoints: [], distanceMeters: 10, durationSeconds: 5,
      layFinishedAt: null, startAnchor: null, savedAt: 1, status: 'searching', runId: 'legacyRun', searchStartedAt: 100,
    } as PendingTrack;
    useTrackingStore.getState().restoreSearchSession(legacy);
    expect(useTrackingStore.getState().searchRunState).toEqual(freshSearchRunState());
    expect(useTrackingStore.getState().searchRunId).toBe('legacyRun');
  });
});
