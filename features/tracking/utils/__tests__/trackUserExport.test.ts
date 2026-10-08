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

it('exports stored reference and search boundaries without connecting gaps or reporting a stale score', () => {
  const snapshot = buildTrackUserExport({ ...source,
    points: [source.points[0], { ...source.points[1], timestamp: '2026-10-08T12:01:00Z' }],
    runs: [{ ...source.runs[0], run_points: [source.runs[0].run_points[0], { ...source.runs[0].run_points[1], breakBefore: true }] }],
    track_data: { ...source.track_data, layContinuity: { version: 1, breakBeforeTimestamps: ['2026-10-08T14:01:00+02:00'] } },
  }, now, true);
  expect(snapshot.reference.map(p => p.length)).toEqual([1, 1]);
  expect(snapshot.search.map(p => p.length)).toEqual([1, 1]);
  expect(snapshot.summary).toMatchObject({ analysisScore: null, referenceM: 120, searchM: 123, durationS: 65, total: 2 });
  expect(snapshot.notes).toBe(source.notes);
  expect(snapshot.continuity).toEqual({ version: 1, hasGaps: true, searchHasGaps: true, referenceHasGaps: true });
  const gpx = trackExportGpx(snapshot);
  expect(gpx.match(/<trkseg>/g)).toHaveLength(4);
  expect(gpx).toContain('<anyvo:continuity version="1" hasGaps="true"');
  expect(JSON.stringify(snapshot)).not.toContain('private-');
});
it('keeps sparse legacy tracks intact without inferring a gap from elapsed time', () => {
  const snapshot = buildTrackUserExport({ ...source, runs: [{ ...source.runs[0], run_points: [{ lat: 47, lng: 8, t: 0 }, { lat: 48, lng: 9, t: 1000 }] }] }, now);
  expect(snapshot.search.map(p => p.length)).toEqual([2]);
  expect(snapshot).not.toHaveProperty('continuity');
  expect(snapshot.summary.analysisScore).toBe(91);
  expect(trackExportGpx(snapshot)).not.toContain('xmlns:anyvo');
});
it('preserves explicit unknown connectivity as separate positions when boundary locations are missing', () => {
  const snapshot = buildTrackUserExport({ ...source, track_data: { run: { analytics: { trackScore: 64 }, continuity: { version: 1, hasGaps: true } } } }, now);
  expect(snapshot.reference.map(p => p.length)).toEqual([1, 1]);
  expect(snapshot.search.map(p => p.length)).toEqual([1, 1]);
  expect(snapshot.summary.analysisScore).toBeNull();
});
it('tolerates malformed persisted timestamps and does not interpret string flags as boundaries', () => {
  const snapshot = buildTrackUserExport({ points: [{ ...source.points[0], timestamp: {}, breakBefore: 'true' }, source.points[1]], track_data: { layContinuity: { version: 1, breakBeforeTimestamps: [] } } }, now);
  expect(snapshot.reference.map(p => p.length)).toEqual([2]);
  expect(snapshot).not.toHaveProperty('continuity');
});
it('ignores continuity metadata belonging to a different run', () => {
  const snapshot = buildTrackUserExport({ ...source, runs: [{ ...source.runs[0], id: 'older' }], track_data: { run: { run_id: 'newer', continuity: { version: 1, hasGaps: true } } } }, now);
  expect(snapshot.search.map(p => p.length)).toEqual([2]);
  expect(snapshot).not.toHaveProperty('continuity');
});
