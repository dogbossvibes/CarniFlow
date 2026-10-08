import * as fs from 'fs';
import * as path from 'path';
import { ANGLE_SHORT } from '../angleClassify';
import { assertNoAbsoluteData } from '../qaTrackExport';
import { buildTrackDetailMap } from '../trackDetailMap';
import type { AngleKind } from '../../store/trackingStore';

const read = (id: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'field20261008', `${id}.json`), 'utf8'));
for (const id of ['qa-9ca60ac3', 'qa-80049c56']) {
  it(`${id}: recorded geometry and source identity remain separate from field ground truth`, () => {
    const data = read(id);
    expect(() => assertNoAbsoluteData(data)).not.toThrow();
    expect(data.counts.persistedPoints).toBe(data.points.length);
    expect(data.recordingEvidence.lay[0].identity.releaseGitCommit).toBe('28355badd869b1bf4f022c2c1c13a0c0b2636eca');
    const relative = (p: { x: number; y: number }) => ({ latitude: p.y / 111320, longitude: p.x / 111320 });
    const lay = data.points.map(relative);
    const replay = data.searchDiagnostics.geometry.replay.map((p: { x: number; y: number; tSec: number }) => ({ lat: p.y / 111320, lng: p.x / 111320, t: p.tSec }));
    const map = buildTrackDetailMap({ points: lay, runs: [{ run_points: [] }], track_data: { run: { replay_points: replay } } });
    expect(map.lay).toHaveLength(data.points.length);
    expect(map.run).toEqual(replay.map(({ lat, lng }: { lat: number; lng: number }) => ({ lat, lng })));
    expect(map.start).toEqual({ lat: lay[0].latitude, lng: lay[0].longitude });
    expect(map.end).toEqual({ lat: lay[lay.length - 1].latitude, lng: lay[lay.length - 1].longitude });
  });
}
it('does not advertise a numeric angle for the captured direction-only corner', () => {
  const data = read('qa-80049c56');
  const turn = data.turnFusion.find((t: { sharpness: string }) => t.sharpness === 'unresolved');
  expect(turn).toMatchObject({ kind: 'links', sharpness: 'unresolved', directionSource: 'motion_override_low_geometry' });
  expect(ANGLE_SHORT[turn.kind as AngleKind]).toBe('L');
  expect(ANGLE_SHORT[turn.kind as AngleKind]).not.toMatch(/\d/);
  // Neither the detection nor its recorded 5.2° weak geometry is retuned.
  expect(turn.interiorAngleDeg).toBe(5.2);
  expect(ANGLE_SHORT.spitz_links).toBe('SL');
  expect(ANGLE_SHORT.spitz_rechts).toBe('SR');
});
