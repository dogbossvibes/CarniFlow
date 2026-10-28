import { resolvePurchasePlan } from '../purchaseState';
import { canSwitchPlanInApp } from '../plans';
const now=Date.parse('2026-10-28T12:00:00Z');
const sub={plan:'active' as const,status:'active',trial_ends_at:null,current_period_ends_at:'2026-10-27T12:00:00Z'};
for(const platform of ['ios','android']){
 test(`${platform}: expired ACTIVE can be purchased again`,()=>{const plan=resolvePurchasePlan(sub,{ok:true,plan:null},now);expect(plan).toBeNull();expect(canSwitchPlanInApp(plan,'active',{platform})).toBe(true)});
 test(`${platform}: expired TRAINER can restart as ACTIVE`,()=>{const plan=resolvePurchasePlan({...sub,plan:'trainer',status:'expired'},{ok:true,plan:null},now);expect(canSwitchPlanInApp(plan,'active',{platform})).toBe(true)});
 test(`${platform}: valid existing ACTIVE cannot be bought twice`,()=>{const plan=resolvePurchasePlan(sub,{ok:true,plan:'active'},now);expect(canSwitchPlanInApp(plan,'active',{platform})).toBe(false)});
}
test('current Store period takes precedence over an outdated DB expiry',()=>expect(resolvePurchasePlan(sub,{ok:true,plan:'trainer'},now)).toBe('trainer'));
test('cancelled subscription retains its valid period',()=>expect(resolvePurchasePlan({...sub,status:'cancelled',current_period_ends_at:'2026-11-27T12:00:00Z'},null,now)).toBe('active'));
test('empty SDK response cannot override a still-valid paid DB period',()=>expect(resolvePurchasePlan({...sub,current_period_ends_at:'2026-11-27T12:00:00Z'},{ok:true,plan:null},now)).toBe('active'));
test('unknown expiry and failed Store read keep existing paid purchase protection',()=>expect(resolvePurchasePlan({...sub,current_period_ends_at:null},{ok:false,plan:null},now)).toBe('active'));
test('lapsed trial is not a current purchase',()=>expect(resolvePurchasePlan({...sub,status:'trialing',trial_ends_at:'2026-10-26T00:00:00Z'},null,now)).toBeNull());
test('newbie stays free without pretending to be a paid Store product',()=>expect(resolvePurchasePlan({...sub,plan:'newbie'},null,now)).toBe('newbie'));
