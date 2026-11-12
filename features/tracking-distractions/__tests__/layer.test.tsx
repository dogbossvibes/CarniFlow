import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DistractionLines } from '../DistractionLayer';
import { createDistractionSampler, parseDistractionTrack } from '../model';
import { fixture } from './fixture';
jest.mock('../useDistractions', () => ({ useDistractions: () => ({ rows: [] }), useDistractionVisibility: () => ({}) }));
it('draws independent dashed sections without bridging a gap or feeding main-track geometry', () => {
 const track = fixture(); track.points = [0, 1, 2, 3].map((n) => ({ lat: 47 + n * .001, lng: 8, t: 1000 + n * 1000, accuracy: 4, breakBefore: n === 2 }));
 const before = JSON.stringify(track); const Line = () => null, Marker = () => null;
 let r!: ReturnType<typeof TestRenderer.create>; act(() => { r = TestRenderer.create(<DistractionLines tracks={[track]} Polyline={Line} Marker={Marker} />); });
 const lines = r.root.findAll(n => n.props.lineDashPattern);
 expect(lines).toHaveLength(2); expect(lines.map(n => n.props.coordinates.length)).toEqual([2, 2]);
 expect(JSON.stringify(track)).toBe(before); act(() => r.unmount());
});

it('renders a live and reloaded line from admitted fractional native fixes', () => {
 const sampler = createDistractionSampler();
 const points = [sampler.accept({ lat: 47, lng: 8, accuracy: 3, t: 1000.25 }, 1001)!, sampler.accept({ lat: 47.00002, lng: 8, accuracy: 3, t: 2000.75 }, 2001)!];
 const draft = parseDistractionTrack({ ...fixture(), points });
 const Line = () => null, Marker = () => null; let r!: ReturnType<typeof TestRenderer.create>;
 act(() => { r = TestRenderer.create(<DistractionLines tracks={[draft]} Polyline={Line} Marker={Marker} />); });
 expect(r.root.findAll(n => n.props.lineDashPattern)).toHaveLength(1);
 expect(r.root.findAll(n => n.props.lineDashPattern)[0].props.coordinates).toEqual([{ latitude: 47, longitude: 8 }, { latitude: 47.00002, longitude: 8 }]);
 const saved = parseDistractionTrack(JSON.parse(JSON.stringify({ ...draft, finishedAtMs: 3000 })));
 act(() => { r.update(<DistractionLines tracks={[saved]} Polyline={Line} Marker={Marker} />); });
 expect(r.root.findAll(n => n.props.lineDashPattern)).toHaveLength(1); act(() => r.unmount());
});
