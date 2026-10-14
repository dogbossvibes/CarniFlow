import { assertSameTrackTransferReference, parseTrackTransferReference, TRANSFER_LIMITS } from '../reference';
import { projectTrackTransferSource, readTrackTransferSource, type SourceDependencies, type SourceReader } from '../source';
import type { LocalTrainingSession, LocalTrackPoint, LocalTrackMarker } from '@/features/sync/types/sync';

const start = Date.parse('2026-10-11T12:00:00.000Z');
const iso = (offset: number) => new Date(start + offset).toISOString();
const sessionId = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const session = { local_id: sessionId, remote_id: sessionId, user_id: 'owner', dog_id: 'source-dog',
    type: 'track', status: 'completed', deleted_at: null, started_at: iso(0), ended_at: iso(10000),
    updated_at: iso(10000), duration_seconds: 10, notes: 'PRIVATE NOTE',
    payload_json: JSON.stringify({ distanceMeters: 2.125, run: { score: 98, run_points: ['PRIVATE SEARCH'] },
      segments: null, layContinuity: { version: 1, breakBeforeTimestamps: [iso(5000)] } }) } as LocalTrainingSession;
  const points = [0, 5000, 10000].map((t, i) => ({ local_id: `point${i}`, session_local_id: sessionId,
    latitude: 47.123456789 + i / 1e6, longitude: 8.123456789, accuracy: 1.5, altitude: null,
    speed: null, heading: null, timestamp: iso(t), point_type: 'lay', payload_json: JSON.stringify({ measuredDistanceM: i }) })) as LocalTrackPoint[];
  const markers = [{ local_id: 'LOCAL-DB-ID', session_local_id: sessionId, marker_type: 'gegenstand', material: 'duebel',
    angle_kind: null, latitude: points[1].latitude, longitude: points[1].longitude, accuracy: null, distance_from_start: 1,
    created_at: iso(5000), note: 'PRIVATE MARKER', audio_remote_url: 'PRIVATE AUDIO',
    payload_json: JSON.stringify({ sourceMarkerId: 'original-marker-id', recordedAtMs: start + 5000 }) }] as LocalTrackMarker[];
  return { session, points, markers };
}
const reference = () => { const f = fixture(); return projectTrackTransferSource(f.session, f.points, f.markers); };

it('retains measured geometry, original marker identity/time and the actual continuity boundary without sending search/private metadata', () => {
  const f = fixture(), before = JSON.stringify(f), ref = projectTrackTransferSource(f.session, f.points, f.markers);
  expect(ref.points.map(p => p.breakBefore)).toEqual([false, true, false]);
  expect(ref.points[1]).toMatchObject({ lat: f.points[1].latitude, t: start + 5000, measuredDistanceM: 1 });
  expect(ref.markers[0]).toMatchObject({ id: 'original-marker-id', t: start + 5000, material: 'duebel' });
  for (const secret of ['PRIVATE', 'source-dog', 'LOCAL-DB-ID', 'owner', 'score', 'audio']) expect(JSON.stringify(ref)).not.toContain(secret);
  expect(JSON.stringify(f)).toBe(before);
});
it('accepts arbitrary server object key order only when every field matches', () => {
  const ref = reference();
  const reversed = JSON.parse(JSON.stringify(ref), (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).reverse()) : value);
  expect(assertSameTrackTransferReference(ref, reversed)).toEqual(ref);
});
it.each(['lat', 't', 'measuredDistanceM'] as const)('rejects a changed %s even with matching counts', key => {
  const ref = reference(), altered = reference();
  altered.points[1][key] = altered.points[1][key]! + 0.001;
  expect(() => assertSameTrackTransferReference(ref, altered)).toThrow();
});
it('rejects server-added fields, including hidden notes nested in markers', () => {
  const ref = reference();
  expect(() => parseTrackTransferReference({ ...ref, notes: 'hidden' })).toThrow('REFERENCE_INVALID');
  expect(() => parseTrackTransferReference({ ...ref, markers: [{ ...ref.markers[0], note: 'hidden' }] })).toThrow('REFERENCE_INVALID');
});
it.each([NaN, Infinity, '47', 91])('rejects invalid latitude %s', value => {
  const ref = reference(); expect(() => parseTrackTransferReference({ ...ref, points: [{ ...ref.points[0], lat: value }, ...ref.points.slice(1)] })).toThrow();
});
it('rejects duplicate source marker IDs', () => {
  const ref = reference(); expect(() => parseTrackTransferReference({ ...ref, markers: [ref.markers[0], ref.markers[0]] })).toThrow();
});
it('rejects reordered points and points outside the laying interval', () => {
  const ref = reference(); expect(() => parseTrackTransferReference({ ...ref, points: [...ref.points].reverse() })).toThrow();
  expect(() => parseTrackTransferReference({ ...ref, points: [{ ...ref.points[0], t: start - 1 }, ...ref.points.slice(1)] })).toThrow();
});
it('keeps null marker locations unknown but rejects one-sided coordinates', () => {
  const ref = reference();
  expect(parseTrackTransferReference({ ...ref, markers: [{ ...ref.markers[0], lat: null, lng: null }] }).markers[0].lat).toBeNull();
  expect(() => parseTrackTransferReference({ ...ref, markers: [{ ...ref.markers[0], lat: null }] })).toThrow();
});
it('does not silently truncate an oversized reference', () => {
  const ref = reference(); expect(() => parseTrackTransferReference({ ...ref, points: Array(TRANSFER_LIMITS.points + 1).fill(ref.points[0]) })).toThrow('REFERENCE_TOO_LARGE');
});
it.each([null, '{}', '{"sourceMarkerId":"old"}', '{"recordedAtMs":1}'])('rejects missing original marker provenance %s without substituting created_at', metadata => {
  const f = fixture(); f.markers[0].payload_json = metadata;
  expect(() => projectTrackTransferSource(f.session, f.points, f.markers)).toThrow('SOURCE_INCOMPLETE');
});
it('rejects disagreement between marker original time and persisted time', () => {
  const f = fixture(); f.markers[0].created_at = iso(5001);
  expect(() => projectTrackTransferSource(f.session, f.points, f.markers)).toThrow('SOURCE_INCOMPLETE');
});
it('does not infer gaps in sparse legacy geometry', () => {
  const f = fixture(); f.session.payload_json = '{}';
  expect(projectTrackTransferSource(f.session, f.points, f.markers).points.every(p => !p.breakBefore)).toBe(true);
});
it('rejects an unlocatable or ambiguous stored boundary', () => {
  const f = fixture(); f.points[2].timestamp = iso(5000);
  expect(() => projectTrackTransferSource(f.session, f.points, f.markers)).toThrow('SOURCE_INCOMPLETE');
  f.points[2].timestamp = iso(10000); f.points[1].timestamp = iso(5001);
  expect(() => projectTrackTransferSource(f.session, f.points, f.markers)).toThrow('SOURCE_INCOMPLETE');
});
it.each(['search', 'raw'])('does not project %s points as laid points', type => {
  const f = fixture(); f.points[0].point_type = type;
  expect(() => projectTrackTransferSource(f.session, f.points, f.markers)).toThrow('SOURCE_INCOMPLETE');
});
it.each(['cancelled', 'active'])('does not share unfinished/cancelled status %s', status => {
  const f = fixture(); f.session.status = status;
  expect(() => projectTrackTransferSource(f.session, f.points, f.markers)).toThrow('SOURCE_UNAVAILABLE');
});
it('rejects reshares of received references without a new sharing permission', () => {
  const f = fixture(); f.session.payload_json = '{"trackTransferReceipt":{}}';
  expect(() => projectTrackTransferSource(f.session, f.points, f.markers)).toThrow('SOURCE_UNAVAILABLE');
});

function harness() {
  const f = fixture(); let epoch = 0;
  const queries: string[] = [];
  const db: SourceReader = {
    async getFirstAsync<T>(sql: string) { queries.push(sql); return f.session as T; },
    async getAllAsync<T>(sql: string) { queries.push(sql); return (sql.includes('local_track_points') ? f.points : f.markers) as T[]; },
  };
  const deps: SourceDependencies = { currentScope: () => ({ userId: 'owner', epoch }), sourceIsRecording: () => false,
    snapshot: jest.fn(read => read(db)) };
  return { f, db, deps, queries, changeAccountAwayAndBack: () => { epoch += 2; } };
}
it('reads only owned parent and lay/marker rows inside one snapshot callback', async () => {
  const h = harness(); const result = await readTrackTransferSource(h.deps, 'owner', sessionId);
  expect(result.sourceTrainingId).toBe(sessionId);
  expect(h.deps.snapshot).toHaveBeenCalledTimes(1);
  expect(h.queries).toHaveLength(3); expect(h.queries[0]).toContain('user_id=?');
  expect(h.queries[1]).toContain("point_type='lay'"); expect(h.queries[1]).toContain('limit ?');
});
it('rejects a wrong owner row even if an adapter erroneously returns it', async () => {
  const h = harness(); h.f.session.user_id = 'other';
  await expect(readTrackTransferSource(h.deps, 'owner', sessionId)).rejects.toThrow('SOURCE_UNAVAILABLE');
});
it('rejects unsynchronised parents and preserves the source', async () => {
  const h = harness(); h.f.session.remote_id = null;
  await expect(readTrackTransferSource(h.deps, 'owner', sessionId)).rejects.toThrow('SOURCE_NOT_SYNCED');
  expect(h.f.session.remote_id).toBeNull(); expect(h.queries).toHaveLength(1);
});
it('rejects A→B→A while reading', async () => {
  const h = harness(), original = h.db.getAllAsync;
  h.db.getAllAsync = async (...args) => { const result = await original(...args); h.changeAccountAwayAndBack(); return result as never; };
  await expect(readTrackTransferSource(h.deps, 'owner', sessionId)).rejects.toThrow('ACCOUNT_CHANGED');
});
it('checks account again after the snapshot finishes', async () => {
  const h = harness(); h.deps.snapshot = async read => { const result = await read(h.db); h.changeAccountAwayAndBack(); return result; };
  await expect(readTrackTransferSource(h.deps, 'owner', sessionId)).rejects.toThrow('ACCOUNT_CHANGED');
});
it('rejects an active recorder before reading any data', async () => {
  const h = harness(); h.deps.sourceIsRecording = () => true;
  await expect(readTrackTransferSource(h.deps, 'owner', sessionId)).rejects.toThrow('SOURCE_ACTIVE');
  expect(h.deps.snapshot).not.toHaveBeenCalled();
});

it('projects the actual recorder manualAngleGeometry array into the bounded wire envelope', () => {
  const f = fixture();
  f.session.payload_json = JSON.stringify({ ...JSON.parse(f.session.payload_json!), manualAngleGeometry: [] });
  expect(projectTrackTransferSource(f.session, f.points, f.markers).manualAngleGeometry).toEqual({ markers: [], truncated: false });
  f.markers[0].angle_kind = 'bw'; f.markers[0].marker_type = 'winkel';
  const geometry = { manualMarkerType: 'bw', geometryDirection: 'unresolved', geometrySharpness: 'unresolved', geometryQuality: null,
    confidence: null, motionDirection: null, directionAgrees: null, classificationSource: null };
  f.session.payload_json = JSON.stringify({ ...JSON.parse(f.session.payload_json!), manualAngleGeometry: [geometry] });
  expect(projectTrackTransferSource(f.session, f.points, f.markers).manualAngleGeometry?.markers).toEqual([geometry]);
});
it('projects keyed geometry into V1 without leaking internal keys or dropping confidence',()=>{
 const f=fixture(),m=f.markers[0];m.marker_type='winkel';m.angle_kind='bw';m.material=null;
 const geometry={markerKey:`bw:${m.latitude!.toFixed(7)}:${m.longitude!.toFixed(7)}:${m.distance_from_start!.toFixed(1)}`,manualMarkerType:'bw',geometryDirection:'rechts',geometrySharpness:'sharp',geometrySource:'gps',geometryQuality:0.9,confidence:0.8,motionDirection:null,directionAgrees:null,classificationSource:'gps'};
 f.session.payload_json=JSON.stringify({...JSON.parse(f.session.payload_json!),manualAngleGeometry:[geometry]});
 const result=projectTrackTransferSource(f.session,f.points,f.markers);
 expect(result.version).toBe(1);expect(result.manualAngleGeometry!.markers[0]).toMatchObject({geometryDirection:'rechts',geometrySharpness:'sharp',confidence:0.8});
 expect(JSON.stringify(result)).not.toContain('markerKey');expect(JSON.stringify(result)).not.toContain('geometrySource');
});
it('does not send an Abriss direction through a V1 server that would lose it',()=>{
 const f=fixture(),m=f.markers[0];m.marker_type='winkel';m.angle_kind='abriss';m.material=null;
 m.payload_json=JSON.stringify({...JSON.parse(m.payload_json!),geometryDirection:'links',geometrySharpness:'unresolved',geometrySource:'manual'});
 expect(()=>projectTrackTransferSource(f.session,f.points,f.markers)).toThrow('DIRECTION_TRANSFER_UNAVAILABLE');
});

it.each(['coordinates','distance'] as const)('preserves legacy direction in V1 when %s are nullable', missing=>{
 const f=fixture(),m=f.markers[0];m.marker_type='winkel';m.angle_kind='bw';m.material=null;
 if(missing==='coordinates'){m.latitude=null;m.longitude=null;}else m.distance_from_start=null;
 const geometry={manualMarkerType:'bw',geometryDirection:'rechts',geometrySharpness:'sharp',geometryQuality:null,confidence:null,motionDirection:null,directionAgrees:null,classificationSource:'manual'};
 f.session.payload_json=JSON.stringify({...JSON.parse(f.session.payload_json!),manualAngleGeometry:[geometry]});
 expect(projectTrackTransferSource(f.session,f.points,f.markers).manualAngleGeometry?.markers[0]).toEqual(geometry);
});
