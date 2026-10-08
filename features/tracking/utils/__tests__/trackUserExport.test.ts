import { buildTrackUserExport, trackExportGpx } from '../trackUserExport';
const now = '2026-10-08T12:00:00.000Z';
const source = {
  id: 'private-session', owner_id: 'private-owner', dog: { name: 'Milo & Zoë 🐕' }, session_date: '2026-10-07',
  notes: 'Private <note> & "quote"', secret: 'SECRET', distance_meters: 120, articles_found: 1, articles_total: 2,
  points: [{ latitude: 47, longitude: 8, point_type: 'lay', timestamp: now }, { latitude: 47.001, longitude: 8.002, point_type: 'lay' }],
  markers: [{ id: 'private-marker', marker_type: 'gegenstand', material: 'holz', latitude: 47, longitude: 8, audio_url: 'SECRET' }],
  runs: [{ started_at: now, run_points: [{ lat: 47, lng: 8, t: 0 }, { lat: 47.001, lng: 8.002, t: 2.5 }], distance_meters: 123, duration_seconds: 65 }],
  track_data: { run: { replay_points: [{ lat: 1, lng: 2 }], analytics: { trackScore: 91, analysisConfidenceBand: 'good' } } },
};
it('allowlists user data, excludes private identifiers/URLs and notes by default, leaves input untouched', () => {
  const before = JSON.stringify(source);
  const snapshot = buildTrackUserExport(source, now);
  expect(snapshot.search[0][1]).toEqual({ lat: 47.001, lng: 8.002, time: '2026-10-08T12:00:02.500Z' });
  expect(snapshot.search.flat()).not.toContainEqual({ lat: 1, lng: 2 });
  const json = JSON.stringify(snapshot);
  for (const privateValue of ['private-', 'SECRET', 'Private <note>']) expect(json).not.toContain(privateValue);
  expect(snapshot.summary).toMatchObject({ analysisScore: 91, found: 1, total: 2 });
  expect(JSON.stringify(source)).toBe(before);
});
it('preserves opt-in notes and Unicode in JSON/GPX, escaping XML text', () => {
  const snapshot = buildTrackUserExport(source, now, true);
  expect(snapshot.notes).toBe(source.notes);
  const gpx = trackExportGpx(snapshot);
  expect(gpx).toContain('Milo &amp; Zoë 🐕');
  expect(gpx).toContain('Private &lt;note&gt; &amp; &quot;quote&quot;');
  expect(gpx.indexOf('<wpt')).toBeLessThan(gpx.indexOf('<trk>'));
  expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  expect(trackExportGpx(buildTrackUserExport(source, now))).not.toContain('<desc>');
});
it('splits at invalid points without bridging corrupt geometry or adding search points to lay', () => {
  const snapshot = buildTrackUserExport({ points: [source.points[0], { latitude: NaN, longitude: 8 }, source.points[1], { ...source.points[1], point_type: 'search' }, source.points[0]], runs: [{ run_points: [{ lat: 47, lng: 8 }, { lat: 95, lng: 8 }, { lat: 47.1, lng: 8 }] }] }, now);
  expect(snapshot.reference.map(p => p.length)).toEqual([1, 1, 1]);
  expect(snapshot.search.map(p => p.length)).toEqual([1, 1]);
  expect(trackExportGpx(snapshot).match(/<trkseg>/g)).toHaveLength(5);
});
it('does not invent timestamps, distances or found states for old/incomplete tracks', () => {
  const snapshot = buildTrackUserExport({ runs: [{ run_points: [{ lat: 47, lng: 8, t: 3 }] }] }, now);
  expect(snapshot.search[0][0].time).toBeUndefined();
  expect(snapshot.summary.found).toBeNull();
  expect(snapshot.summary.searchM).toBeNull();
  expect(snapshot.summary.analysisScore).toBeNull();
});
it('keeps object numbering when a marker has no valid position; dowels do not consume an object number', () => {
  const snapshot = buildTrackUserExport({ markers: [{ marker_type: 'gegenstand' }, { ...source.markers[0], material: 'duebel' }, source.markers[0]] }, now);
  expect(snapshot.markers.map(m => m.label)).toEqual(['gegenstand', 'G2']);
});
it('handles missing data and rejects oversized geometry without silently truncating', () => {
  expect(buildTrackUserExport(null, now).reference).toEqual([]);
  expect(() => buildTrackUserExport({ points: Array(100001).fill(source.points[0]) }, now)).toThrow('export-too-large');
  expect(() => buildTrackUserExport({}, 'bad')).toThrow('invalid-export-date');
});
it('strips XML-forbidden code points but retains complete Unicode characters', () => {
  const gpx = trackExportGpx(buildTrackUserExport({ dog: { name: 'A\u0000\ud800🐕' } }, now));
  expect(gpx).toContain('<name>A🐕</name>');
});

it('does not associate analytics or found totals from another run with the exported geometry',()=>{
  const snapshot=buildTrackUserExport({...source,runs:[{...source.runs[0],id:'older'}],track_data:{run:{run_id:'newer',analytics:{trackScore:99}}}},now);
  expect(snapshot.summary.analysisScore).toBeNull();
  expect(snapshot.summary.found).toBeNull();
});
