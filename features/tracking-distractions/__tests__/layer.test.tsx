import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DistractionLines } from '../DistractionLayer';
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
