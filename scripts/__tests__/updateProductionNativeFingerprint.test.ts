import { createHarness, destroyHarness, type Harness } from './otaReleaseHarness';
import { spawnSync } from 'child_process';
const BUILD='442f7bc3-14f8-4ec0-9cf3-138a3dd6f79d', HASH='8'.repeat(40), RUNTIME='1.0.6-map49-v1';
function call(fn: string, value: unknown) {
 const code=`import * as m from './scripts/update-production.mjs'; process.stdout.write(JSON.stringify(m[${JSON.stringify(fn)}](${JSON.stringify(value)})));`;
 const r=spawnSync('node',['--input-type=module','-e',code],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return JSON.parse(r.stdout);
}
const input=()=>({build:{id:BUILD,status:'FINISHED',platform:'ios',runtimeVersion:RUNTIME,appVersion:'1.0.4',buildProfile:'ios49-map-repair',channel:'production',gitCommitHash:'a'.repeat(40),fingerprintHash:HASH},buildId:BUILD,platform:'ios',runtime:RUNTIME,releaseAppVersion:'1.0.6',nativeConfig:{appJson:{expo:{version:'1.0.4',ios:{version:'1.0.5',runtimeVersion:'1.0.5-map49-v1'}}},easJson:{build:{production:{channel:'production',environment:'production',distribution:'store'},'ios49-map-repair':{extends:'production'}}}},nativeFingerprint:{hash:HASH,buildId:BUILD,platform:'ios',runtime:RUNTIME,releaseAppVersion:'1.0.6',buildProfile:'ios49-map-repair'}});
it('accepts the exact fresh native fingerprint despite historical metadata/config override',()=>expect(call('evaluateNativeBaseBuild',input())).toEqual([]));
it.each([{hash:'9'.repeat(40)},{hash:''},{buildId:'wrong'},{platform:'android'},{runtime:'wrong'},{releaseAppVersion:'wrong'},{buildProfile:'wrong'}])('rejects a mismatched fingerprint binding %j',patch=>{const i=input();expect(call('evaluateNativeBaseBuild',{...i,nativeFingerprint:{...i.nativeFingerprint,...patch}}).length).toBeGreaterThan(0);});
it('fails closed without fingerprint proof',()=>expect(call('evaluateNativeBaseBuild',{...input(),nativeFingerprint:null}).length).toBeGreaterThan(0));
it.each([{status:'ERRORED'},{platform:'android'},{channel:'preview'},{runtimeVersion:'wrong'},{id:'wrong'},{gitCommitHash:null},{fingerprintHash:null}])('retains independent build metadata guards %j',patch=>{const i=input();expect(call('evaluateNativeBaseBuild',{...i,build:{...i.build,...patch}}).length).toBeGreaterThan(0);});
it('does not accept an unsafe source profile with a matching hash',()=>{const i=input();i.nativeConfig.easJson.build.production.environment='preview';expect(call('evaluateNativeBaseBuild',i).length).toBeGreaterThan(0);});
it('retains the fingerprint hash from fresh EAS metadata',()=>expect(call('parseNativeBuild',{id:BUILD,fingerprint:{hash:HASH}}).fingerprintHash).toBe(HASH));

describe('fingerprint proof through the real fail-closed initial-runtime CLI',()=>{
 let h: Harness;
 afterEach(()=>{if(h)destroyHarness(h);});
 function setup(extra: object={}){
  h=createHarness({appJson:{expo:{version:'1.0.4',ios:{version:'1.0.6',runtimeVersion:RUNTIME}}},easJson:input().nativeConfig.easJson});
  h.setState({groups:[],fingerprintHash:HASH,builds:{[BUILD]:{...input().build,gitCommitHash:h.base,fingerprint:{hash:HASH}}},...extra});
 }
 const args=['--platform','ios','--runtime',RUNTIME,'--initial-runtime-release','--initial-runtime-build-id',BUILD,'--message','fixture only'];
 it('uses the exact platform/profile and permits only a dry-run with equal native contract',()=>{
  setup();const r=h.run([...args,'--dry-run']);expect(r.code).toBe(0);expect(r.out).toContain('Native Fingerprint');expect(h.calls()).toContainEqual(['fingerprint:generate','--platform','ios','--build-profile','ios49-map-repair','--json','--non-interactive']);expect(h.calls().some(a=>a[0]==='update')).toBe(false);
 });
 it.each([{fingerprintHash:'9'.repeat(40)},{fingerprintFail:true}])('refuses missing/mismatched fresh generation %j',extra=>{
  setup(extra);expect(h.run([...args,'--dry-run']).code).not.toBe(0);expect(h.calls().some(a=>a[0]==='update')).toBe(false);
 });
 it('recomputes immediately before publish and refuses a changed contract',()=>{
  setup({fingerprintRace:true});const r=h.run([...args,'--confirm']);expect(r.code).not.toBe(0);expect(h.calls().filter(a=>a[0]==='fingerprint:generate').length).toBeGreaterThanOrEqual(2);expect(h.calls().some(a=>a[0]==='update')).toBe(false);
 });
});
