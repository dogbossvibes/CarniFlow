import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { hasTransferredGaps, transferGapPoints } from '../androidGapSafety';
import { UnsupportedTransferView } from '../UnsupportedTransferView';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { projectTrackSketch } from '@/features/tracking/utils/trackSketchGeometry';
import { createOwnCopyImportPlan } from '../ownImport';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import fixture from './fixtures/backend-cloud-v1.json';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
let mockUser = '33333333-3333-4000-8000-000000000002';
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('../i18n', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
function storedDetail(includeSearch = false) {
  const db = new DatabaseSync(':memory:');
  try {
    for (const m of MIGRATIONS) db.exec(m.sql);
    for (const q of createOwnCopyImportPlan(fixture.accept.receipt, fixture.accept.ownCopy).statements) db.prepare(q.sql).run(...q.params);
    if (includeSearch) db.prepare(`insert into local_track_points(local_id,session_local_id,point_type,latitude,longitude,timestamp,payload_json)
      values(?,?,?,?,?,?,?)`).run('own-search-point', fixture.accept.receipt.ownSessionId, 'search', 47, 8, new Date(3000).toISOString(), '{"breakBefore":true}');
    const session = db.prepare('select * from local_training_sessions').get();
    const points = db.prepare('select * from local_track_points order by timestamp').all();
    const markers = db.prepare('select * from local_track_markers').all();
    return buildLocalTrackDetail(session, points, markers);
  } finally { db.close(); }
}
it('preserves real backend gaps through SQLite/detail/overview and draws two disconnected points', () => {
  const detail = storedDetail(); expect(hasTransferredGaps(detail)).toBe(true);
  const map = buildTrackDetailMap(detail), projection = projectTrackSketch(map.lay, 320, 240);
  expect(map.lay.map(p => !!p.breakBefore)).toEqual([false, true]); expect(projection?.parts.map(p => p.length)).toEqual([1, 1]);
  let view!: ReturnType<typeof TestRenderer.create>;
  act(() => { view = TestRenderer.create(<UnsupportedTransferView data={detail} onBack={() => {}} />); });
  expect(view.root.findAll(n => n.props.children === 'gapUnsupported').length).toBeGreaterThan(0);
  expect(view.root.findAll(n => n.props.testID === 'recorded-track-line')).toHaveLength(0);
  act(() => view.unmount());
});
it('handles remote timestamp gap metadata, search gaps and original ordinary rows without mutating data', () => {
  const detail = { track_data: { trackTransferReceipt: fixture.accept.receipt, layContinuity: { breakBeforeTimestamps: [new Date(2000).toISOString()] } },
    points: [{ latitude: 1, longitude: 2, timestamp: new Date(1000).toISOString() }, { latitude: 2, longitude: 3, timestamp: new Date(2000).toISOString() }] };
  const before = JSON.stringify(detail); expect(transferGapPoints(detail)[1].breakBefore).toBe(true);
  expect(hasTransferredGaps(detail)).toBe(true); expect(JSON.stringify(detail)).toBe(before);
  expect(hasTransferredGaps({ ...detail, track_data: {} })).toBe(false);
  expect(hasTransferredGaps({ transferReceipt: fixture.accept.receipt, searchPoints: [{ breakBefore: true }] })).toBe(true);
  expect(buildTrackDetailMap({ points: detail.points }).lay).toEqual([
    { lat: 1, lng: 2, timestamp: new Date(1000).toISOString() },
    { lat: 2, lng: 3, timestamp: new Date(2000).toISOString() },
  ]);
});

it('never renders a previous account reference in the read-only fallback', () => {
  mockUser = 'other-user'; let view!: ReturnType<typeof TestRenderer.create>;
  act(() => { view = TestRenderer.create(<UnsupportedTransferView data={storedDetail()} onBack={() => {}} />); });
  expect(view.root.findAll(n => n.props.testID === 'track-sketch')).toHaveLength(0);
  expect(view.root.findAll(n => n.props.children === 'account').length).toBeGreaterThan(0);
  act(() => view.unmount()); mockUser = '33333333-3333-4000-8000-000000000002';
});

it('keeps SQLite search points out of the transferred original reference and overview', () => {
  const original = storedDetail(), mixed = storedDetail(true);
  expect(mixed.points).toHaveLength(original.points.length + 1);
  expect(transferGapPoints(mixed)).toEqual(transferGapPoints(original));
  expect(buildTrackDetailMap(mixed).lay).toEqual(buildTrackDetailMap(original).lay);
  const sketch = projectTrackSketch(transferGapPoints(mixed), 320, 240);
  expect(sketch?.parts.map(part => part.length)).toEqual([1, 1]);
  expect(transferGapPoints({ trackPoints: [{ lat: 1, lng: 2 }, { lat: 9, lng: 9, pointType: 'search' }] })).toEqual([{ lat: 1, lng: 2 }]);
});
