import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { DistractionEntry } from '../DistractionEntry';
import { ParentPicker } from '../ParentPicker';
const mockPush = jest.fn(), mockHistory = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }), useFocusEffect: (fn: () => unknown) => { jest.requireActual('react').useEffect(fn,[fn]); } }));
jest.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}));
jest.mock('@/features/training-groups/registerResources', () => ({registerGroupResources: jest.fn()}));
jest.mock('@/hooks/useDogs', () => ({useDogs: () => ({dogs:[{id:'dog',name:'Yam'},{id:'dog2',name:'Quiron'}]})}));
jest.mock('@/features/tracking/services/trackHistoryService', () => ({getTrackHistory: (...a: unknown[]) => mockHistory(...a)}));
jest.mock('@/features/tracking/components/TrackSketch', () => ({TrackSketch: () => null}));
let tree: ReturnType<typeof Renderer.create>;
afterEach(() => {act(() => tree?.unmount());jest.clearAllMocks();});
it.each([undefined, 'main'])('entry routes to selection or explicit parent %s', async parentId => {
 await act(async () => {tree=Renderer.create(<DistractionEntry parentId={parentId} dogId="dog"/>);});
 act(() => tree.root.findAll(n=>n.props.accessibilityRole==='button')[0].props.onPress());
 expect(mockPush).toHaveBeenCalledWith({pathname:'/track/verleitungen',params:parentId?{id:'main'}:{dogId:'dog'}});
});
it('shows completed main tracks for selected dog and opens the exact stored id', async () => {
 mockHistory.mockResolvedValue([{id:'s',dog_id:'dog',status:'completed',session_date:'2026-10-14',distance_meters:223},{id:'other',dog_id:'dog2',status:'completed'},{id:'active',dog_id:'dog',status:'active'}]);
 const data={userId:'owner',parents:{listCached:async()=>[]}} as never;
 await act(async () => {tree=Renderer.create(<ParentPicker data={data} dogId="dog"/>);});
 const buttons=tree.root.findAll(n=>n.props.accessibilityRole==='button' && String(n.props.accessibilityLabel).startsWith('openMain:'));
 expect(buttons.length).toBeGreaterThan(0); expect(buttons.every(n=>n.props.accessibilityLabel.includes('Yam'))).toBe(true);
 act(()=>buttons[0].props.onPress());expect(mockPush).toHaveBeenCalledWith({pathname:'/track/verleitungen',params:{id:'s'}});
 expect(mockHistory).toHaveBeenCalledWith('owner');
});
