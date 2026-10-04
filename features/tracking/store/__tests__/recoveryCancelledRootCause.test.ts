// „Recovery: cancelled" — Ursache und Diagnose (rein).
// Der Reason 'cancelled' entsteht AUSSCHLIESSLICH aus dem dauerhaften Nutzer-Abbruch-Marker
// (payload_json.trackLifecycleStatus = 'cancelled'). Neu: Quelle/Zeitpunkt werden mitgeliefert,
// damit erkennbar ist, WELCHER Abbruch-Dialog ihn gesetzt hat. Entscheidung selbst unverändert.
import {
  decideTrackRecovery, lifecycleDetail, resolveRestingCancelTarget, TRACK_LIFECYCLE_KEY,
  TRACK_LIFECYCLE_SOURCE_KEY, TRACK_LIFECYCLE_UPDATED_KEY, type LocalSessionSnapshot,
} from '@/features/tracking/store/trackRecovery';
import { recoveryReasonLine } from '@/features/tracking/components/TrackResumeCta';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({}));

const LAY_END = '2026-10-04T08:30:00.000Z';
const local = (payload: Record<string, unknown>): LocalSessionSnapshot => ({
  session: {
    local_id: 'sess-A', user_id: 'user-1', dog_id: 'dog-A', type: 'track', status: 'completed', ended_at: LAY_END,
    duration_seconds: 300, deleted_at: null, payload_json: JSON.stringify(payload),
  } as never,
  layPoints: [0, 1, 2].map(i => ({ latitude: 47 + i * 1e-4, longitude: 8, accuracy: 4, timestamp: LAY_END, point_type: 'lay' })) as never,
  markers: [], searchPointCount: 0,
});
const decide = (payload: Record<string, unknown>) =>
  decideTrackRecovery({ registry: {}, dogId: 'dog-A', sessionId: 'sess-A', pending: null, local: local(payload), now: Date.parse(LAY_END) + 1000 });

describe('Reason „cancelled" mit Diagnose', () => {
  it('Marker aus dem Liegezeit-Abbruch → cancelled + Quelle/Zeitpunkt', () => {
    const d = decide({ [TRACK_LIFECYCLE_KEY]: 'cancelled', [TRACK_LIFECYCLE_UPDATED_KEY]: '2026-10-04T09:00:00.000Z', [TRACK_LIFECYCLE_SOURCE_KEY]: 'resting_abort' });
    expect(d).toEqual({ ok: false, reason: 'cancelled', detail: { lifecycleSource: 'resting_abort', lifecycleAt: '2026-10-04T09:00:00.000Z' } });
    expect(recoveryReasonLine(d)).toBe('Recovery: cancelled · resting_abort · 2026-10-04T09:00:00.000Z');
  });
  it('Marker aus dem Konfliktdialog beim Legen → Quelle lay_conflict', () => {
    const d = decide({ [TRACK_LIFECYCLE_KEY]: 'cancelled', [TRACK_LIFECYCLE_UPDATED_KEY]: '2026-10-04T09:00:00.000Z', [TRACK_LIFECYCLE_SOURCE_KEY]: 'lay_conflict' });
    expect(recoveryReasonLine(d)).toBe('Recovery: cancelled · lay_conflict · 2026-10-04T09:00:00.000Z');
  });
  it('Altbestand (Marker vor diesem Fix, mit Zeit, ohne Quelle) → Quelle ausdrücklich unbekannt', () => {
    const d = decide({ [TRACK_LIFECYCLE_KEY]: 'cancelled', [TRACK_LIFECYCLE_UPDATED_KEY]: '2026-10-04T09:00:00.000Z' });
    expect(recoveryReasonLine(d)).toBe('Recovery: cancelled · source=unbekannt (Altbestand) · 2026-10-04T09:00:00.000Z');
  });
  it('Marker ganz ohne Metadaten → Entscheidung exakt wie bisher (kein detail)', () => {
    expect(decide({ [TRACK_LIFECYCLE_KEY]: 'cancelled' })).toEqual({ ok: false, reason: 'cancelled' });
  });
  it('ohne Marker ist dieselbe Fährte wiederherstellbar (Recovery B) — „cancelled" entsteht nur aus dem Marker', () => {
    const d = decide({ distanceMeters: 40 });
    expect(d).toMatchObject({ ok: true, source: 'session', mode: 'resting' });
  });
  it('lifecycleDetail ist robust gegen kaputtes JSON', () => {
    expect(lifecycleDetail({ payload_json: '{kaputt' })).toEqual({ lifecycleSource: null, lifecycleAt: null });
  });
});

describe('resolveRestingCancelTarget — Liegezeit-Abbruch trifft nur die Fährte DIESES Screens', () => {
  it('Route mit Session + Hund → genau diese; Store nur, wenn er dieselbe Session hält', () => {
    expect(resolveRestingCancelTarget({ routeSessionId: 's-A', routeDogId: 'dog-A', storeSessionId: 's-A', storeDogId: 'dog-A' }))
      .toEqual({ sessionId: 's-A', dogId: 'dog-A', cancelStore: true });
  });
  it('Deep-Link (nur Session-ID), Store hält die Fährte eines ANDEREN Hundes → Store unberührt, Hund offen (Service bestimmt ihn)', () => {
    expect(resolveRestingCancelTarget({ routeSessionId: 's-A', routeDogId: undefined, storeSessionId: 's-B', storeDogId: 'dog-B' }))
      .toEqual({ sessionId: 's-A', dogId: null, cancelStore: false });
  });
  it('Route nur mit Hund (Vorwärts-Flow) → Store-Session dieses Hundes', () => {
    expect(resolveRestingCancelTarget({ routeSessionId: undefined, routeDogId: 'dog-A', storeSessionId: 's-A', storeDogId: 'dog-A' }))
      .toEqual({ sessionId: 's-A', dogId: 'dog-A', cancelStore: true });
  });
});
