import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useLayPlan } from '../useLayPlan';
let mockUser: string | null = 'a', mockEpoch = 0;
const mockScope = { current: { userId: 'a' as string | null, epoch: 0 } };
const mockList = jest.fn(); const mockRepo = { list: mockList };
jest.mock('../usePlannerScope', () => ({ usePlannerScope: () => ({ userId: mockUser, epoch: mockEpoch, scope: mockScope, repository: mockUser ? mockRepo : null }) }));
const row = { plan: { id: 'plan', name: 'Plan', points: [{ latitude: 47, longitude: 8, object: true }, { latitude: 47.001, longitude: 8, object: false }] }, revision: 1 };
let result: ReturnType<typeof useLayPlan>, tree: ReactTestRenderer;
function Harness({ dog = 'dog' }: { dog?: string }) { result = useLayPlan(dog); return null; }
beforeEach(() => { mockUser = 'a'; mockEpoch = 0; mockScope.current = { userId: 'a', epoch: 0 }; mockList.mockReset().mockResolvedValue([row]); act(() => { tree = Renderer.create(<Harness />); }); });
afterEach(() => act(() => tree.unmount()));
it('does not select automatically and uses only a loaded plan snapshot', async () => {
 expect(result.selected).toBeNull(); expect(mockList).not.toHaveBeenCalled();
 await act(async () => { await result.refresh(); }); expect(result.selected).toBeNull();
 act(() => result.select({ ...row })); expect(result.selected).toBeNull();
 act(() => result.select(result.rows[0])); expect(result.selected).toBe(row);
 act(() => result.select(null)); expect(result.selected).toBeNull();
});
it('hides selected geometry immediately on dog or account change', async () => {
 await act(async () => { await result.refresh(); }); act(() => result.select(result.rows[0]));
 act(() => tree.update(<Harness dog="other" />)); expect(result.selected).toBeNull(); expect(result.rows).toEqual([]);
 mockUser = 'b'; mockScope.current = { userId: 'b', epoch: 1 }; mockEpoch = 1;
 act(() => tree.update(<Harness />)); expect(result.selected).toBeNull();
});
it('discards a late list after a scope change', async () => {
 let resolve!: (rows: typeof row[]) => void; mockList.mockReturnValue(new Promise(r => { resolve = r; }));
 let pending!: Promise<void>; act(() => { pending = result.refresh(); });
 act(() => tree.update(<Harness dog="other" />));
 await act(async () => { resolve([row]); await pending; }); expect(result.rows).toEqual([]); expect(result.selected).toBeNull();
});
it('keeps an explicitly selected snapshot on refresh but exposes failed reads', async () => {
 await act(async () => { await result.refresh(); }); act(() => result.select(result.rows[0]));
 mockList.mockRejectedValue(new Error('offline')); await act(async () => { await result.refresh(); });
 expect(result.selected).toBe(row); expect(result.failed).toBe(true); expect(result.rows).toEqual([]);
});
it('blocks stale auth and clears after logout/login of same account', async () => {
 await act(async () => { await result.refresh(); });
 mockScope.current = { userId: null, epoch: 1 }; act(() => tree.update(<Harness />));
 act(() => result.select(row)); expect(result.selected).toBeNull();
 mockEpoch = 2; mockScope.current = { userId: 'a', epoch: 2 }; act(() => tree.update(<Harness />)); expect(result.rows).toEqual([]);
});
it('does not resurrect a selected plan after dog A to B to A', async () => {
 await act(async () => { await result.refresh(); }); act(() => result.select(result.rows[0]));
 act(() => tree.update(<Harness dog="other" />));
 act(() => tree.update(<Harness />));
 expect(result.selected).toBeNull(); expect(result.rows).toEqual([]);
});
it('discards the old pending read after dog A to B to A', async () => {
 let resolve!: (rows: typeof row[]) => void; mockList.mockReturnValue(new Promise(r => { resolve = r; }));
 let pending!: Promise<void>; act(() => { pending = result.refresh(); });
 act(() => tree.update(<Harness dog="other" />)); act(() => tree.update(<Harness />));
 await act(async () => { resolve([row]); await pending; });
 expect(result.rows).toEqual([]); expect(result.selected).toBeNull();
});
