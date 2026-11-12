import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {SessionProvider} from '../session-context';
const mockInvoke=jest.fn(),mockInvalidate=jest.fn().mockResolvedValue(undefined);
let mockUid='A';
jest.mock('@react-native-async-storage/async-storage',()=>require('@react-native-async-storage/async-storage/jest/async-storage-mock')); // eslint-disable-line @typescript-eslint/no-require-imports -- Jest native persistence factory.
jest.mock('@react-native-community/netinfo',()=>({default:{addEventListener:()=>()=>{}}}));
jest.mock('@/lib/queryClient',()=>({queryClient:{invalidateQueries:(...a:unknown[])=>mockInvalidate(...a)}}));
jest.mock('@/services/localeSync',()=>({initLocaleSync:jest.fn(),stopLocaleSync:jest.fn()}));
jest.mock('expo-router',()=>({router:{replace:jest.fn()}}));
jest.mock('@/lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:mockUid}}},error:null}),getUser:async()=>({data:{user:{id:mockUid}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:jest.fn()}}})},functions:{invoke:(...a:unknown[])=>mockInvoke(...a)}}}));
let tree:ReturnType<typeof TestRenderer.create>,spy:jest.SpyInstance;
const original=Object.getOwnPropertyDescriptor(AppState,'currentState')!;
beforeEach(async()=>{await AsyncStorage.clear();Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});spy=jest.spyOn(AppState,'addEventListener').mockReturnValue({remove:jest.fn()});mockInvoke.mockReset().mockResolvedValue({data:{version:1,state:{verified:true,plan:'active',expiresAt:'2099-01-01T00:00:00Z'}},error:null});mockInvalidate.mockClear();await AsyncStorage.setItem('@anyvo/subscription-sync/v1/A',JSON.stringify({version:1,plan:'active',nonce:'previous-process',retryAt:0}))});
afterEach(()=>{act(()=>tree.unmount());spy.mockRestore();Object.defineProperty(AppState,'currentState',original)});
async function mount(){await act(async()=>{tree=TestRenderer.create(<SessionProvider>{null}</SessionProvider>);for(let n=0;n<45;n++)await Promise.resolve()})}
test('session bootstrap recovers a previous-process purchase intent through server proof',async()=>{mockUid='A';await mount();expect(mockInvoke).toHaveBeenCalledTimes(1);expect(mockInvoke).toHaveBeenCalledWith('subscription-sync',{body:{},signal:expect.any(AbortSignal)});expect(await AsyncStorage.getItem('@anyvo/subscription-sync/v1/A')).toBeNull();expect(mockInvalidate.mock.calls.map(x=>x[0].queryKey)).toEqual([['capabilities','A'],['profile','A'],['userAccess','A']])});
test('bootstrap of another account never replays the previous account purchase',async()=>{mockUid='B';await mount();expect(mockInvoke).not.toHaveBeenCalled();expect(await AsyncStorage.getItem('@anyvo/subscription-sync/v1/A')).not.toBeNull();expect(mockInvalidate).not.toHaveBeenCalled()});
