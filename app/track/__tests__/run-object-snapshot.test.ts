import fs from 'fs';
import path from 'path';

it('connects only normal recorder completion to optional original snapshot; keeps recovery independent', () => {
  const screen = fs.readFileSync(path.join(__dirname, '..', 'run.tsx'), 'utf8');
  expect(screen.match(/objectSnapshotInput:/g)).toHaveLength(1);
  expect(screen).toContain('objectSnapshotInput: { objects: snapData.laidObjects, statuses: res.objectStatuses, scoreBasis: res.objectScoreBasis }');
  expect(screen).toContain('await finalizeLocalTrackRun(sessId, buildRunResultPayload({');
});
