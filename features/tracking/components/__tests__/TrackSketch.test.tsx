import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Polyline, Rect } from 'react-native-svg';
import { TrackSketch } from '../TrackSketch';

it('does not turn angle/object counts into an invented GPS track', () => {
  let r: any;
  act(() => { r = TestRenderer.create(<TrackSketch legs={5} objects={3} />); });
  expect(r.root.findAllByType(Polyline)).toHaveLength(0);
  expect(r.root.findAllByType(Rect)).toHaveLength(1); // neutral placeholder, no fake objects
  act(() => r.unmount());
});
it('keeps a recorded gap open and uses the selected dog color for actual geometry', () => {
  let r: any;
  act(() => { r = TestRenderer.create(<TrackSketch accent="#AABBCC" points={[{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8 }, { lat: NaN, lng: 8 }, { lat: 47.003, lng: 8 }, { lat: 47.004, lng: 8 }]} />); });
  const lines = r.root.findAllByType(Polyline);
  expect(lines).toHaveLength(2); expect(lines.every((n: any) => n.props.stroke === '#AABBCC' && !n.props.points.includes('NaN'))).toBe(true);
  act(() => r.unmount());
});
