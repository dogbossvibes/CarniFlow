import { Alert } from 'react-native';
// Real camera hook and rendered map controls must share the same follow state.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TrackingMap } from '../TrackingMap';
import { RNMaps } from '@/components/tracking/TrackMap';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockMapApi = { animateToRegion: jest.fn(), fitToCoordinates: jest.fn(), animateCamera: jest.fn(), setCamera: jest.fn(), getCamera: jest.fn(async () => ({})) };
// Map-Dummies IN der Factory (wird beim ersten Import ausgeführt); Zugriff im Test über RNMaps.
jest.mock('@/components/tracking/TrackMap', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const R = require('react');
  const { View: V } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const MapView = R.forwardRef((p: any, ref: any) => {
    R.useImperativeHandle(ref, () => mockMapApi);
    R.useEffect(() => { p.onMapReady?.(); }, []);
    return R.createElement(V, { testID: 'map' }, p.children);
  });
  const Polyline = (_p: any) => null;
  const Marker = (p: any) => R.createElement(V, { testID: 'marker' }, p.children);
  return { MAPS_AVAILABLE: true, RNMaps: { default: MapView, Polyline, Marker, PROVIDER_DEFAULT: 'default' } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));

const line = [{lat:47,lng:8},{lat:47.001,lng:8}];
let tree: ReturnType<typeof TestRenderer.create>;
function Harness(){const [follow,setFollow]=React.useState(true);return <TrackingMap layPoints={line} currentPosition={line[1]} courseDeg={90} speedMps={1} smartFollow follow={follow} onToggleFollow={()=>setFollow(v=>!v)} onUserPan={()=>setFollow(false)}/>;}
const press=(label:string)=>act(()=>tree.root.findAll(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===label)[0].props.onPress());
afterEach(()=>{act(()=>tree?.unmount());jest.clearAllMocks();});
it('follow toggle, gesture pause and heading button agree with the actual camera',()=>{
 act(()=>{tree=TestRenderer.create(<Harness/>);});expect(mockMapApi.animateCamera).toHaveBeenCalled();
 press('track.mapFollow.disableLabel');const count=mockMapApi.animateCamera.mock.calls.length;
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='track.mapFollow.enableLabel').length).toBeGreaterThan(0);
 press('track.mapMode.heading');expect(mockMapApi.animateCamera.mock.calls.length).toBeGreaterThan(count);
 act(()=>tree.root.findByType(RNMaps!.default).props.onPanDrag());const paused=mockMapApi.animateCamera.mock.calls.length;
 press('track.mapMode.resumeFollow');expect(mockMapApi.animateCamera.mock.calls.length).toBeGreaterThan(paused);
});
it('north and free controls agree with visible follow status',()=>{
 act(()=>{tree=TestRenderer.create(<Harness/>);});press('track.mapMode.north');expect(mockMapApi.animateCamera.mock.calls.at(-1)![0].heading).toBe(0);
 press('track.mapMode.free');expect(tree.root.findAll(n=>n.props.accessibilityLabel==='track.mapFollow.enableLabel').length).toBeGreaterThan(0);
 press('track.mapFollow.enableLabel');expect(tree.root.findAll(n=>n.props.accessibilityLabel==='track.mapFollow.disableLabel').length).toBeGreaterThan(0);
 expect(tree.root.findAll(n=>n.props.testID==='track-camera-mode').length).toBeGreaterThan(0);
});

it('switches all map layers without remounting the map or moving the camera', () => {
 const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
 act(() => { tree = TestRenderer.create(<Harness/>); });
 const originalMap = tree.root.findByType(RNMaps!.default);
 const cameraCalls = mockMapApi.animateCamera.mock.calls.length;
 for (const [current, next, index] of [['Hybrid', 'standard', 0], ['Standard', 'satellite', 1], ['Satellit', 'hybrid', 2]] as const) {
  press(`Kartenart: ${current}. Ändern`);
  const buttons = alert.mock.calls.at(-1)![2]!;
  act(() => { buttons[index].onPress?.(); });
  expect(tree.root.findByType(RNMaps!.default)).toBe(originalMap);
  expect(originalMap.props.mapType).toBe(next);
  expect(originalMap.props.showsScale).toBe(false);
 }
 expect(mockMapApi.animateCamera.mock.calls.length).toBe(cameraCalls);
 alert.mockRestore();
});
