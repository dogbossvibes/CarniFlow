import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useDogs } from '../useDogs';

let mockUser: string | null = 'u'; const mockGet = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) }));
jest.mock('@/services/dogs', () => ({ getDogs: (...a: unknown[]) => mockGet(...a) }));
let latest: ReturnType<typeof useDogs>;
function Probe() { latest = useDogs(); return null; }
it('clears account data immediately on logout and ignores a late request from the previous account', async () => {
  let finish!: (v: unknown) => void; let view!: any;
  mockGet.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { view = TestRenderer.create(<Probe />); });
  mockUser = null; await act(async () => { view.update(<Probe />); });
  await act(async () => { finish({ data: [{ id: 'd', owner_id: 'u', track_overlay_color_key: 'violet' }] }); });
  expect(latest.dogs).toEqual([]); expect(latest.loading).toBe(false);
  act(() => view.unmount());
});
