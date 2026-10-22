import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadGreetingSound, setGreetingSound, useGreetingSound } from '../useGreetingSound';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let current: ReturnType<typeof useGreetingSound>;
function Probe({ owner }: { owner: string }) { current = useGreetingSound(owner); return null; }
test('account switch and a late A read cannot show another accounts enabled sound', async () => {
 let finish!: (value: string) => void;
 jest.spyOn(AsyncStorage,'getItem').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(null);
 let node!: ReactTestRenderer;
 await act(async () => { node=TestRenderer.create(<Probe owner="race-A" />); });
 expect(current.ready).toBe(false);
 await act(async () => { node.update(<Probe owner="race-B" />); });
 expect(current.enabled).toBe(false);
 await act(async () => { finish('true'); }); expect(current.enabled).toBe(false);
 act(() => node.unmount()); jest.restoreAllMocks();
});
test('serial rapid writes use exact account keys and a failure reverts to persisted value', async () => {
 await loadGreetingSound('writes-A'); await loadGreetingSound('writes-B');
 const spy = jest.spyOn(AsyncStorage,'setItem').mockRejectedValueOnce(new Error('disk')).mockRejectedValueOnce(new Error('disk'));
 const results = await Promise.all([setGreetingSound('writes-A',true), setGreetingSound('writes-A',false)]);
 expect(results).toEqual([false,false]); expect(spy.mock.calls.map(args=>args[0])).toEqual(['anyvo:greeting-sound:v1:writes-A','anyvo:greeting-sound:v1:writes-A']);
 let node!:ReactTestRenderer; await act(async()=>{node=TestRenderer.create(<Probe owner="writes-A" />);});
 expect(current.enabled).toBe(false); act(()=>node.unmount()); jest.restoreAllMocks();
});
