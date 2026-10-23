import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import Screen from '../GroupTrainingScreen';
import type { GroupTrainingPanelProps } from '../groupTrainingViewModel';
let mockPanel: GroupTrainingPanelProps;
let mockDogs = [{ id: 'dog-a', name: 'A', owner_id: 'A' }];
const mockStart = jest.fn(async () => true), mockStop = jest.fn(async () => {});
const mockChooseGroup = jest.fn(), mockChooseSession = jest.fn();
const mockAct = jest.fn(async () => true);
const mockData = { groups: [{ groupId: 'g', title: 'G', ownerUserId: 'A', status: 'active', members: [
  { userId: 'A', membershipId: 'ma', displayName: 'A' }, { userId: 'B', membershipId: 'mb', displayName: 'B' },
]}], invitations: [], groupId: 'g', sessionId: 's', busy: false, error: null,
serverNowMs: 1_000_000, verifiedAt: 0, sessions: [{ sessionId: 's', groupId: 'g', ownerUserId: 'A', title: 'S', status: 'active', expiresAtMs: 9_000_000 }],
session: { sessionId: 's', groupId: 'g', participants: [{ userId: 'A', dogId: 'dog-a', displayName: 'A' }, { userId: 'B', dogId: 'dog-b', displayName: 'B' }] } };
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'share-new' }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'A' } } }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs, refresh: jest.fn() }) }));
jest.mock('@/features/training-groups/useConnectedInviteTargets', () => ({ useConnectedInviteTargets: () => [] }));
jest.mock('../releaseGate', () => ({ isLiveShareReleaseReady: () => true }));
jest.mock('../LiveShareProvider', () => ({ useGroupLiveShare: () => ({ state: { phase: 'idle' }, client: {},
 recipientNames: [], startNamed: mockStart, stop: mockStop, retryPending: jest.fn() }) }));
jest.mock('../useTrainingGroups', () => ({ useTrainingGroups: () => ({ data: mockData, act: mockAct, refresh: jest.fn(), chooseGroup: mockChooseGroup, chooseSession: mockChooseSession }) }));
jest.mock('../useGroupLivePositions', () => ({ useGroupLivePositions: () => ({ positions: [] }) }));
jest.mock('../components/GroupPositionsMap', () => ({ GroupPositionsMap: () => null }));
jest.mock('../components/GroupTrainingPanel', () => ({ GroupTrainingPanel: (props: GroupTrainingPanelProps) => { mockPanel = props; return null; } }));
let tree: ReactTestRenderer;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockDogs = [{ id: 'dog-a', name: 'A', owner_id: 'A' }]; act(() => { tree = Renderer.create(<Screen />); }); });
afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });
const request = { sessionId: 's', recipientUserIds: ['B'], durationMinutes: 15 as const };
it('starts only explicitly for the joined own dog and selected current participant', () => {
 expect(mockStart).not.toHaveBeenCalled();
 act(() => mockPanel.onStartShare(request));
 expect(mockStart).toHaveBeenCalledWith({ userId: 'A', sessionId: 's', dogId: 'dog-a', shareId: 'share-new', recipientIds: ['B'], durationMs: 900000 }, ['B']);
});
it('rejects a callback carrying an old session', () => {
 act(() => mockPanel.onStartShare({ ...request, sessionId: 'old' })); expect(mockStart).not.toHaveBeenCalled();
});
it('cannot share for a dog no longer in the own-dog list', () => {
 mockDogs = []; act(() => tree.update(<Screen />)); act(() => mockPanel.onStartShare(request)); expect(mockStart).not.toHaveBeenCalled();
});
it.each(['A', 'not-a-participant'])('rejects recipient %s before requesting location', recipient => {
 act(() => mockPanel.onStartShare({ ...request, recipientUserIds: [recipient] })); expect(mockStart).not.toHaveBeenCalled();
});

it('stops sending locally before changing group or session selection', () => {
 act(() => mockPanel.onSelectGroup('other-group'));
 expect(mockStop.mock.invocationCallOrder[0]).toBeLessThan(mockChooseGroup.mock.invocationCallOrder[0]);
 act(() => mockPanel.onSelectSession('other-session'));
 expect(mockStop.mock.invocationCallOrder[1]).toBeLessThan(mockChooseSession.mock.invocationCallOrder[0]);
});
