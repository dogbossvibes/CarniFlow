import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useDistractions } from '../useDistractions';
let mockUser: string | null='a';let mockAuth:(event:string,session:{user:{id:string}}|null)=>void;
const mockUnsubscribe=jest.fn();
jest.mock('@/hooks/useSession',()=>({useSession:()=>({session:mockUser?{user:{id:mockUser}}:null})}));
jest.mock('@/lib/supabase',()=>({supabase:{auth:{onAuthStateChange:(fn:typeof mockAuth)=>{mockAuth=fn;return{data:{subscription:{unsubscribe:mockUnsubscribe}}};}}}}));
jest.mock('../repository',()=>({distractionRepository:(owner:string,scope:()=>unknown)=>({owner,scope})}));
jest.mock('../parentRepository',()=>({parentRepository:(owner:string,scope:()=>unknown)=>({owner,scope})}));
jest.mock('expo-router',()=>({useFocusEffect:()=>{}}));
let result:ReturnType<typeof useDistractions>,tree:ReactTestRenderer;
function Harness(){result=useDistractions(undefined);return null;}
beforeEach(()=>{mockUser='a';act(()=>{tree=Renderer.create(<Harness/>);});});afterEach(()=>act(()=>tree.unmount()));
it('preserves drafts/repository epoch on repeated sign-in of the same session',()=>{
 const repository=result.repository;
 act(()=>mockAuth('SIGNED_IN',{user:{id:'a'}}));
 expect(result.epoch).toBe(0);expect(result.repository).toBe(repository);expect(result.scope.current).toEqual({userId:'a',epoch:0});
});
it('immediately invalidates actual logout/login including batched A-B-A',()=>{
 const old=result.repository;
 act(()=>{mockAuth('SIGNED_OUT',null);expect(result.scope.current.userId).toBeNull();mockAuth('SIGNED_IN',{user:{id:'b'}});mockAuth('SIGNED_IN',{user:{id:'a'}});});
 expect(result.epoch).toBe(3);expect(result.repository).not.toBe(old);expect(result.scope.current.userId).toBe('a');
});
it('does not restore old identity from stale React context while auth changes',()=>{
 act(()=>mockAuth('SIGNED_IN',{user:{id:'b'}}));expect(result.scope.current.userId).toBe('b');
 mockUser='b';act(()=>tree.update(<Harness/>));expect(result.userId).toBe('b');expect(result.scope.current.userId).toBe('b');
});
it('token refresh does not reset unsaved plans',()=>{
 act(()=>mockAuth('TOKEN_REFRESHED',{user:{id:'a'}}));expect(result.epoch).toBe(0);
});

it('invalidates render-before-callback A-B-A without resetting same-account refocus',()=>{
 const oldEpoch=result.epoch,oldRepository=result.repository;
 mockUser='b';act(()=>tree.update(<Harness/>));act(()=>mockAuth('SIGNED_IN',{user:{id:'b'}}));
 mockUser='a';act(()=>tree.update(<Harness/>));act(()=>mockAuth('SIGNED_IN',{user:{id:'a'}}));
 expect(result.epoch).toBeGreaterThan(oldEpoch);expect(result.repository).not.toBe(oldRepository);
 const epoch=result.epoch;act(()=>mockAuth('SIGNED_IN',{user:{id:'a'}}));expect(result.epoch).toBe(epoch);
});
