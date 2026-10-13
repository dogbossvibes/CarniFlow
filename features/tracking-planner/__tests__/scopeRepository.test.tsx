import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { usePlannerScope } from '../usePlannerScope';
let mockUser='a';let mockAuth:(event:string,session:{user:{id:string}}|null)=>void;
const mockTx={getFirstAsync:jest.fn(),getAllAsync:jest.fn(),runAsync:jest.fn()};
jest.mock('@/hooks/useSession',()=>({useSession:()=>({session:{user:{id:mockUser}}})}));
jest.mock('@/lib/supabase',()=>({supabase:{auth:{onAuthStateChange:(fn:typeof mockAuth)=>{mockAuth=fn;return{data:{subscription:{unsubscribe:jest.fn()}}};}}}}));
jest.mock('@/lib/localDb/client',()=>({getLocalDb:jest.fn()}));
jest.mock('../repository',()=>{const real=jest.requireActual('../repository');return{...real,plannerRepository:(owner:string,scope:()=>unknown)=>real.createPlannerRepository(owner,{scope,transaction:(fn:any)=>fn(mockTx)})};});
let result:ReturnType<typeof usePlannerScope>,tree:ReactTestRenderer;
function Harness(){result=usePlannerScope();return null;}
const plan={id:'one',name:'Test',points:[{latitude:47,longitude:8,object:false},{latitude:47.001,longitude:8,object:true}]};
beforeEach(()=>{jest.clearAllMocks();mockUser='a';act(()=>{tree=Renderer.create(<Harness/>);});});afterEach(()=>act(()=>tree.unmount()));
function transition(user:string,renderFirst:boolean){
 if(renderFirst){mockUser=user;act(()=>tree.update(<Harness/>));act(()=>mockAuth('SIGNED_IN',{user:{id:user}}));}
 else {act(()=>mockAuth('SIGNED_IN',{user:{id:user}}));mockUser=user;act(()=>tree.update(<Harness/>));}
}
it.each([true,false])('rejects in-flight writes across ABA, render first=%s',async renderFirst=>{
 let resolve!:(x:unknown)=>void;mockTx.getFirstAsync.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=result.repository!.save(plan,0);const rejection=expect(pending).rejects.toThrow('ACCOUNT_CHANGED');
 transition('b',renderFirst);transition('a',renderFirst);resolve({n:0});await rejection;expect(mockTx.runAsync).not.toHaveBeenCalled();
});
it.each([true,false])('rejects in-flight reads across ABA, render first=%s',async renderFirst=>{
 let resolve!:(x:unknown)=>void;mockTx.getAllAsync.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=result.repository!.list();const rejection=expect(pending).rejects.toThrow('ACCOUNT_CHANGED');
 transition('b',renderFirst);transition('a',renderFirst);resolve([]);await rejection;
});
it('rejects a pending write over explicit sign-out and same-account sign-in',async()=>{
 let resolve!:(x:unknown)=>void;mockTx.getFirstAsync.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=result.repository!.save(plan,0);const rejection=expect(pending).rejects.toThrow('ACCOUNT_CHANGED');
 act(()=>{mockAuth('SIGNED_OUT',null);mockAuth('SIGNED_IN',{user:{id:'a'}});});resolve({n:0});await rejection;expect(mockTx.runAsync).not.toHaveBeenCalled();
});
