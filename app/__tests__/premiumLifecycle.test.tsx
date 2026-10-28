import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Alert,Platform} from 'react-native';
import PremiumScreen from '../premium';
const mockBuy=jest.fn(),mockActivate=jest.fn(),mockStore=jest.fn(),mockGetOld=jest.fn(),mockGetUser=jest.fn();
let mockUid='A',mockCurrent=true,mockLifetime=false,mockFullLifetime=false;
let mockSub:Record<string,unknown>;
jest.mock('@/lib/supabase',()=>({supabase:{auth:{getUser:()=>mockGetUser()}}}));
jest.mock('@/hooks/useSession',()=>({useSession:()=>({session:{user:{id:mockUid}}})}));
jest.mock('@/hooks/useAccess',()=>({useAccess:()=>({access:{isLifetime:mockLifetime||mockFullLifetime,planType:mockLifetime?'active_lifetime':null,hasActiveAccess:mockLifetime||mockFullLifetime,hasTrainerAccess:mockFullLifetime}})}));
jest.mock('@/hooks/useInternalTester',()=>({useInternalTester:()=>({isInternalTester:false})}));
jest.mock('@/lib/queryClient',()=>({queryClient:{invalidateQueries:jest.fn().mockResolvedValue(undefined)}}));
jest.mock('@/lib/haptics',()=>({haptic:{success:jest.fn(),warning:jest.fn(),error:jest.fn()}}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string,vars?:{plan?:string})=>vars?.plan?key+':'+vars.plan:key})}));
jest.mock('expo-router',()=>({useRouter:()=>({back:jest.fn()})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:()=>null}));
jest.mock('expo-linear-gradient',()=>({LinearGradient:({children}:{children:React.ReactNode})=>children}));
function mockPurchaseButton({children,...props}:{children:React.ReactNode}){return React.createElement('purchase-button',props,children)}
jest.mock('@/components/ui/AnimatedPressable',()=>({AnimatedPressable:mockPurchaseButton}));
jest.mock('@/lib/purchases',()=>({getPackages:async()=>['active','trainer'].map(plan=>({productId:plan==='active'?'anyvo_active_monthly_10':'anyvo_trainer_monthly_30.00',id:plan,priceString:'Store price',raw:{}})),purchasesReady:()=>true,ensurePurchasesConfigured:async()=>true,getCurrentStoreSubscription:()=>mockStore(),isPurchaseAccountCurrent:()=>mockCurrent,hasStorePackageForProduct:()=>true,getActiveStoreProductId:()=>mockGetOld(),buyPackage:(...args:unknown[])=>mockBuy(...args),restorePurchases:jest.fn(),restorePlanFromResult:jest.fn()}));
jest.mock('@/services/subscriptionService',()=>({getPlanSubscription:async()=>mockSub,getFounderSlots:async()=>({used:11,remaining:0}),activatePlan:(...args:unknown[])=>mockActivate(...args),claimFounderSlot:jest.fn(),cancelTrial:jest.fn()}));
let tree:ReturnType<typeof TestRenderer.create>,alertSpy:jest.SpyInstance;
const none=()=>({ok:true,plan:null,tier:null,expiration:null});
beforeEach(()=>{mockUid='A';mockCurrent=true;mockLifetime=false;mockFullLifetime=false;mockSub={plan:'active',status:'expired',current_period_ends_at:'2020-01-01',trial_ends_at:null,cancel_at_period_end:false};mockGetUser.mockReset().mockImplementation(async()=>({data:{user:{id:mockUid}}}));mockStore.mockReset().mockResolvedValue(none());mockBuy.mockReset().mockResolvedValue({ok:true,plan:'active',expiration:'2099-01-01'});mockActivate.mockReset().mockResolvedValue({error:null});mockGetOld.mockReset().mockResolvedValue(null);alertSpy=jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>{act(()=>tree?.unmount());alertSpy.mockRestore()});
async function mount(){await act(async()=>{tree=TestRenderer.create(<PremiumScreen/>)});}
function button(plan:string){return tree.root.findAll(n=>n.props.accessibilityLabel==='premium.choosePlan:'+plan)[0]}
for(const platform of ['ios','android'])test(`${platform}: expired ACTIVE renders and purchases the same product again`,async()=>{Object.defineProperty(Platform,'OS',{value:platform,configurable:true});await mount();expect(button('Active')).toBeDefined();await act(async()=>button('Active').props.onPress());expect(mockBuy).toHaveBeenCalledTimes(1);expect(mockBuy.mock.calls[0][1]).toEqual({userId:'A',oldProductIdentifier:null});expect(mockActivate).toHaveBeenCalledTimes(1)});
test('fresh active Store plan blocks repeat purchase despite old DB expiry',async()=>{mockStore.mockResolvedValue({ok:true,plan:'active'});await mount();expect(button('Active')).toBeUndefined();expect(mockBuy).not.toHaveBeenCalled()});
test('failed Store recheck cannot initiate payment',async()=>{await mount();mockStore.mockResolvedValue({ok:false,plan:null});await act(async()=>button('Active').props.onPress());expect(mockBuy).not.toHaveBeenCalled();expect(mockActivate).not.toHaveBeenCalled()});
test('Store becomes active before click: native purchase remains blocked',async()=>{await mount();mockStore.mockResolvedValue({ok:true,plan:'active'});await act(async()=>button('Active').props.onPress());expect(mockBuy).not.toHaveBeenCalled()});
test('account switch before purchase rejects stale screen',async()=>{await mount();mockGetUser.mockResolvedValue({data:{user:{id:'B'}}});await act(async()=>button('Active').props.onPress());expect(mockBuy).not.toHaveBeenCalled();expect(mockActivate).not.toHaveBeenCalled()});
test('full lifetime user sees no purchase actions',async()=>{mockFullLifetime=true;await mount();expect(button('Active')).toBeUndefined();expect(button('Trainer')).toBeUndefined()});
test('permanent ACTIVE can buy TRAINER on Android without inventing an old Store product',async()=>{Object.defineProperty(Platform,'OS',{value:'android',configurable:true});mockLifetime=true;mockSub={plan:null,status:null,current_period_ends_at:null,trial_ends_at:null};await mount();expect(button('Active')).toBeUndefined();await act(async()=>button('Trainer').props.onPress());expect(mockBuy).toHaveBeenCalledTimes(1);expect(mockBuy.mock.calls[0][1].oldProductIdentifier).toBeNull();expect(mockGetOld).not.toHaveBeenCalled()});

test('conflicting active DB period and empty SDK cannot create a parallel subscription',async()=>{mockSub={...mockSub,status:'active',current_period_ends_at:'2099-01-01'};await mount();await act(async()=>button('Trainer').props.onPress());expect(mockBuy).not.toHaveBeenCalled();expect(mockActivate).not.toHaveBeenCalled()});
test('offline paywall load remains controlled',async()=>{mockGetUser.mockRejectedValue(new Error('offline'));await mount();expect(mockBuy).not.toHaveBeenCalled();expect(mockStore).not.toHaveBeenCalled()});

test('success names the verified current plan when a Store change is deferred',async()=>{mockActivate.mockResolvedValue({error:null,plan:'trainer'});await mount();await act(async()=>button('Active').props.onPress());expect(alertSpy).toHaveBeenCalledWith('premium.activeTitle:Trainer','premium.unlocked',expect.any(Array))});
