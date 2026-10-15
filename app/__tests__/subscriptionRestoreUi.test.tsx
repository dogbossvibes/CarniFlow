import Premium from '../premium';
import Membership from '../membership';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
jest.setTimeout(20000);
const mockBuy=jest.fn(),mockRestore=jest.fn(),mockActivate=jest.fn(),mockSuccess=jest.fn(),mockInvalidate=jest.fn();
let mockUid:string|null='A',mockCurrent=true;
let mockPackages:unknown[]=[];
jest.mock('@/lib/supabase',()=>({supabase:{auth:{getUser:async()=>({data:{user:mockUid?{id:mockUid}:null}})}}}));
jest.mock('@/lib/queryClient',()=>({queryClient:{invalidateQueries:(...a:unknown[])=>mockInvalidate(...a)}}));
jest.mock('@/lib/haptics',()=>({haptic:{success:()=>mockSuccess(),warning:jest.fn(),error:jest.fn()}}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string)=>key})}));
jest.mock('@/hooks/useSession',()=>({useSession:()=>({session:mockUid?{user:{id:mockUid}}:null})}));
jest.mock('@/hooks/useCapabilities',()=>({useCapabilities:()=>({hasLifetimeAccess:false,hasActiveLifetimeAccess:false,isTrainerModule:false})}));
jest.mock('@/hooks/useAccess',()=>({useAccess:()=>({access:{planType:'newbie',isLifetime:false}})}));
jest.mock('@/hooks/useInternalTester',()=>({useInternalTester:()=>({isInternalTester:false})}));
jest.mock('@/services/quotaService',()=>({newbieQuotaStatus:async()=>({used:0,limit:1})}));
jest.mock('@/services/subscriptionService',()=>({activatePlan:(...a:unknown[])=>mockActivate(...a),getFounderSlots:async()=>({used:0,remaining:11}),getPlanSubscription:async()=>({plan:'newbie'}),claimFounderSlot:jest.fn(),cancelTrial:jest.fn()}));
jest.mock('@/lib/purchases',()=>({restorePurchases:(...a:unknown[])=>mockRestore(...a),restorePlanFromResult:(r:{plan:string})=>r.plan,buyPackage:(...a:unknown[])=>mockBuy(...a),getPackages:async()=>mockPackages,getManagementURL:async()=>null,purchasesReady:()=>true,ensurePurchasesConfigured:async()=>true,isPurchaseAccountCurrent:()=>mockCurrent,hasStorePackageForProduct:(packs:{productId:string}[],pid:string)=>packs.some(p=>p.productId===pid)}));
jest.mock('expo-router',()=>({useRouter:()=>({back:jest.fn(),replace:jest.fn(),push:jest.fn(),canGoBack:()=>true}),useFocusEffect:()=>{}}));
jest.mock('expo-linear-gradient',()=>({LinearGradient:({children}:{children:React.ReactNode})=>children}));
jest.mock('expo-image',()=>({Image:()=>null}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0}),SafeAreaView:({children}:{children:React.ReactNode})=>children}));
jest.mock('@expo/vector-icons',()=>({Ionicons:()=>null}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- use the native press target in the hoisted mock factory.
jest.mock('@/components/ui/AnimatedPressable',()=>({AnimatedPressable:require('react-native').TouchableOpacity}));
type Node={props:Record<string,any>;parent:Node|null};
type Tree=ReturnType<typeof TestRenderer.create>&{update:(element:React.ReactElement)=>void;root:{findAll:(fn:(node:Node)=>boolean)=>Node[]}};
function button(tree:Tree,label:string):Node {
  let node:Node|null=tree.root.findAll(n=>n.props.children===label)[0] as unknown as Node;
  while(node&&!node.props.onPress)node=node.parent;
  if(!node)throw Error('Missing button '+label);return node;
}
beforeEach(()=>{mockUid='A';mockCurrent=true;mockPackages=[];mockBuy.mockReset().mockResolvedValue({ok:true,plan:'active',expiration:'2099-01-01'});mockRestore.mockReset().mockResolvedValue({ok:true,plan:'active',tier:'pro',expiration:'2099-01-01'});mockActivate.mockReset().mockResolvedValue({error:null,plan:'active'});mockSuccess.mockClear();mockInvalidate.mockClear();});
describe.each([['premium',Premium,'premium.restore'],['membership',Membership,'membership.restore']] as const)('%s actual Restore handler',(_name,Screen,label)=>{
  let tree:Tree;
  const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
  beforeEach(async()=>{alert.mockClear();await act(async()=>{tree=TestRenderer.create(<Screen/>) as Tree;});});
  afterEach(()=>{act(()=>tree.unmount());});
  test.each([{error:'SUBSCRIPTION_SYNC_PENDING',pending:true},{error:'SERVER_FAILURE'}])('activation %p never announces success and releases loading',async activation=>{
    mockActivate.mockResolvedValue(activation);await act(async()=>{await button(tree,label).props.onPress();});
    expect(mockRestore).toHaveBeenCalledWith('A');expect(alert.mock.calls.some(x=>x[0]==='premium.restored')).toBe(false);expect(mockSuccess).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('common.notice',activation.pending?'premium.syncPending':'premium.activationFailed');
    expect(button(tree,label).props.disabled).not.toBe(true);
  });
  test('native error even with a stale plan never reaches activatePlan',async()=>{
    mockRestore.mockResolvedValue({ok:false,plan:'active',error:'IAP_ACCOUNT_CHANGED'});await act(async()=>{await button(tree,label).props.onPress();});
    expect(mockActivate).not.toHaveBeenCalled();expect(alert).toHaveBeenCalledWith('common.notice','premium.accountChanged');
  });
  test('account switch before UI success suppresses restored alert',async()=>{
    mockActivate.mockImplementation(async()=>{mockCurrent=false;return{error:null};});await act(async()=>{await button(tree,label).props.onPress();});
    expect(alert.mock.calls.some(x=>x[0]==='premium.restored')).toBe(false);expect(mockSuccess).not.toHaveBeenCalled();
  });
  test('confirmed restore reports success once',async()=>{
    await act(async()=>{await button(tree,label).props.onPress();});expect(mockActivate).toHaveBeenCalledWith(expect.objectContaining({userId:'A',plan:'active'}));expect(alert.mock.calls.filter(x=>x[0]==='premium.restored')).toHaveLength(1);
  });
  test('signed-out account starts no Store restore',async()=>{
    mockUid=null;await act(async()=>{tree.update(<Screen/>);});await act(async()=>{await button(tree,label).props.onPress();});expect(mockRestore).not.toHaveBeenCalled();
  });
});

describe('premium actual paid purchase handler',()=>{
  let tree:Tree;const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
  beforeEach(async()=>{alert.mockClear();mockPackages=[{productId:'anyvo_active_monthly_10',tier:'pro',priceString:'CHF test',raw:{}}];await act(async()=>{tree=TestRenderer.create(<Premium/>) as Tree;});});
  afterEach(()=>act(()=>tree.unmount()));
  test('server pending after Store success shows pending and never unlocked',async()=>{
    mockActivate.mockResolvedValue({error:'SUBSCRIPTION_SYNC_PENDING',pending:true});await act(async()=>{await button(tree,'premium.choosePlan').props.onPress();});
    expect(mockBuy).toHaveBeenCalledWith(expect.anything(),{oldProductIdentifier:null,userId:'A'});
    expect(alert).toHaveBeenCalledWith('trainer.connectHintTitle','premium.syncPending');expect(alert.mock.calls.some(x=>x[1]==='premium.unlocked')).toBe(false);
  });
  test('account switch after server confirmation still prevents paid success',async()=>{
    mockActivate.mockImplementation(async()=>{mockCurrent=false;return{error:null};});await act(async()=>{await button(tree,'premium.choosePlan').props.onPress();});
    expect(alert).toHaveBeenCalledWith('common.notice','premium.accountChanged');expect(alert.mock.calls.some(x=>x[1]==='premium.unlocked')).toBe(false);
  });
});
