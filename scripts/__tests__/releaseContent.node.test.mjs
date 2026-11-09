import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { validateReleaseContent, runContentPreflight } from '../check-release-content.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE='a'.repeat(40), TARGET='b'.repeat(40), INVENTORY='c'.repeat(40), REVIEW='d'.repeat(40);
function fixture() {
  const blobs = new Map(), put=(ref,path,value)=>blobs.set(`${ref}:${path}`,Buffer.from(typeof value==='string'?value:JSON.stringify(value)));
  put(SOURCE,'app/training.tsx','compact training hub'); put(TARGET,'app/training.tsx','compact training hub');put(SOURCE,'docs/agent/tasks/T-existing.md','Existing task');
  const inventory={schemaVersion:1,scope:'ANYVO_SHARED_FEATURE_BASELINE',complete:true,revision:'approved-revision-1',preparedBy:'writer',approvedBy:'coordinator',protectedBaselines:[{id:'tracking-build58',sourceCommit:'6722b88fded3fb6936472996dd40d6f4dde453f2',paths:['features/tracking']}],packages:[{id:'training-hub',state:'released',sourceCommit:SOURCE,sourceFiles:['app/training.tsx'],platforms:['ios','android'],taskReport:{commit:SOURCE,path:'docs/agent/tasks/T-existing.md'}}]};
  const inventoryRef={commit:INVENTORY,path:'docs/agent/content-inventory.json',sha256:''};
  const refresh=()=>{put(INVENTORY,inventoryRef.path,inventory);inventoryRef.sha256=digest(blobs.get(`${INVENTORY}:${inventoryRef.path}`));}; refresh();
  const manifest={schemaVersion:1,candidateCommit:TARGET,platform:'ios',runtime:'new-sdk-runtime',producer:'writer',inventory:inventoryRef,packages:[{id:'training-hub',kind:'ancestry'}]};
  const input={inventoryRef,manifest,candidateCommit:TARGET,platform:'ios',runtime:'new-sdk-runtime',readBlob:(ref,path)=>{const value=blobs.get(`${ref}:${path}`);if(!value)throw Error('missing blob');return value;},readObjectId:()=> 'f'.repeat(40),isAncestor:()=>true};
  function review(kind,extra={}) {const value={schemaVersion:1,status:'APPROVED',kind,packageId:'training-hub',sourceCommit:SOURCE,candidateCommit:TARGET,platform:'ios',runtime:'new-sdk-runtime',producer:'writer',reviewer:'independent',files:[{sourcePath:'app/training.tsx',targetPath:'app/training.tsx',targetSha256:digest(blobs.get(`${TARGET}:app/training.tsx`))}],...extra};put(REVIEW,'review.json',value);manifest.packages=[{id:'training-hub',kind,review:{commit:REVIEW,path:'review.json',sha256:digest(blobs.get(`${REVIEW}:review.json`))}}];}
  return {input,inventory,manifest,blobs,put,refresh,review};
}
test('complete independent inventory + unchanged inherited source PASS for a new runtime',()=>{assert.equal(validateReleaseContent(fixture().input).status,'PASS');});
for(const value of [false,undefined,'UNKNOWN'])test(`incomplete/unknown inventory ${value} blocks`,()=>{const f=fixture();f.inventory.complete=value;f.refresh();assert.equal(validateReleaseContent(f.input).status,'BLOCKED');});
test('missing inventory blob and changed pinned hash block',()=>{const f=fixture();f.blobs.clear();assert.equal(validateReleaseContent(f.input).ok,false);const g=fixture();g.input.inventoryRef.sha256='0'.repeat(64);assert.equal(validateReleaseContent(g.input).ok,false);});
test('candidate cannot silently omit an intended package',()=>{const f=fixture();f.manifest.packages=[];assert.equal(validateReleaseContent(f.input).ok,false);});
test('source commit missing and ancestor with reverted contents both block',()=>{const f=fixture();f.input.isAncestor=()=>false;assert.equal(validateReleaseContent(f.input).ok,false);f.input.isAncestor=()=>true;f.put(TARGET,'app/training.tsx','old hub');assert.equal(validateReleaseContent(f.input).ok,false);});
test('reviewed source-to-target port passes without shared ancestry',()=>{const f=fixture();f.input.isAncestor=()=>false;f.put(TARGET,'app/training.tsx','adapted SDK port');f.review('port');assert.equal(validateReleaseContent(f.input).status,'PASS');});
for(const extra of [{candidateCommit:'e'.repeat(40)},{sourceCommit:'e'.repeat(40)},{runtime:'old-runtime'},{platform:'android'},{reviewer:' WRITER '},{files:[]}])test(`wrong or incomplete port review blocks ${JSON.stringify(extra)}`,()=>{const f=fixture();f.review('port',extra);assert.equal(validateReleaseContent(f.input).ok,false);});
test('port drift after review blocks',()=>{const f=fixture();f.review('port');f.put(TARGET,'app/training.tsx','changed after approval');assert.equal(validateReleaseContent(f.input).ok,false);});
test('explicit reviewed deferral remains visible rather than pretending full implementation',()=>{const f=fixture();f.review('deferred',{reason:'Separately approved platform exception',approvedBy:'owner'});const r=validateReleaseContent(f.input);assert.equal(r.status,'PASS_WITH_EXPLICIT_DEFERRALS');assert.equal(r.deferred.length,1);});
test('unexplained deferral blocks',()=>{const f=fixture();f.review('deferred');assert.equal(validateReleaseContent(f.input).ok,false);});
test('wrong candidate, platform, runtime, duplicate packages, missing report and self-approved inventory block',()=>{
 for(const mutate of [f=>{f.manifest.candidateCommit=SOURCE;},f=>{f.manifest.platform='android';},f=>{f.manifest.runtime='other';},f=>{f.manifest.packages.push({...f.manifest.packages[0]});},f=>{f.inventory.packages[0].taskReport.path='missing.md';f.refresh();},f=>{f.inventory.approvedBy=' writer ';f.refresh();}]){const f=fixture();mutate(f);assert.equal(validateReleaseContent(f.input).ok,false);}
});
const HUB='d67773bec61fcc4999496db1095daf5da07776d2', BUILD59='00376126dbcf537d8a96131a1e6aed548dba8a02';
let realObjectsAvailable=true;try{for(const ref of [HUB,BUILD59])execFileSync('git',['cat-file','-e',`${ref}^{commit}`],{stdio:'pipe'});}catch{realObjectsAvailable=false;}
test('actual ANYVO d67773be hub vs Build59 00376126 blocks (read-only local Git objects)',{skip:!realObjectsAvailable},()=>{
 const f=fixture(), report='docs/agent/tasks/TRAINING-HUB-DESIGN-2026-10-24.md';
 f.inventory.packages=[{id:'training-hub',state:'released',sourceCommit:HUB,sourceFiles:['app/(tabs)/training.tsx','components/ui/ApportierholzIcon.tsx'],platforms:['ios'],taskReport:{commit:HUB,path:report}}];f.refresh();f.input.candidateCommit=BUILD59;f.manifest.candidateCommit=BUILD59;
 const memory=f.input.readBlob;
 f.input.readBlob=(ref,path)=>[HUB,BUILD59].includes(ref)?execFileSync('git',['show',`${ref}:${path}`],{stdio:'pipe'}):memory(ref,path);
 f.input.readObjectId=(ref,path)=>execFileSync('git',['rev-parse','--verify',`${ref}:${path}`],{stdio:'pipe',encoding:'utf8'}).trim();
 f.input.isAncestor=(a,b)=>{try{execFileSync('git',['merge-base','--is-ancestor',a,b],{stdio:'pipe'});return true;}catch{return false;}};
 assert.notEqual(digest(f.input.readBlob(HUB,'app/(tabs)/training.tsx')),digest(f.input.readBlob(BUILD59,'app/(tabs)/training.tsx')));
 const result=validateReleaseContent(f.input);assert.equal(result.status,'BLOCKED');assert.match(result.problems.join(' '),/training-hub/);
});

test('explicit development mode never grants release readiness and rejects extra flags',()=>{
  assert.deepEqual(runContentPreflight(['--development-checks-only']), {ok:true,releaseEligible:false,status:'DEVELOPMENT_CHECKS_ONLY'});
  assert.equal(runContentPreflight(['--development-checks-only','--commit',TARGET]).ok,false);
});
test('real preflight without manifest stops before Jest/typecheck or other commands',()=>{
  const dir=mkdtempSync(join(tmpdir(),'anyvo-content-preflight-'));
  try {
    const touched=join(dir,'expensive-check-ran');
    writeFileSync(join(dir,'npx'),'#!/bin/sh\ntouch "'+touched+'"\nexit 0\n',{mode:0o755});
    const script=fileURLToPath(new URL('../preflight.mjs',import.meta.url));
    for(const args of [[],['--manifest','missing.json']]) {
      const p=spawnSync(process.execPath,[script,...args],{cwd:dir,env:{...process.env,PATH:dir},encoding:'utf8'});
      assert.equal(p.status,1);assert.match(p.stderr,/BLOCKED/);assert.equal(existsSync(touched),false);
      assert.doesNotMatch(p.stdout,/TypeScript|Tests \(jest\)|bestanden/);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('Build58 protected tracking survives unrelated training UI ports',()=>{
 const f=fixture();f.put(TARGET,'app/training.tsx','new training UI');f.review('port');
 assert.equal(validateReleaseContent(f.input).status,'PASS');
});
test('changed or downgraded protected tracking blocks even with an approved UI port',()=>{
 const f=fixture();f.review('port');f.input.readObjectId=(ref)=>ref===TARGET?'e'.repeat(40):'f'.repeat(40);
 assert.equal(validateReleaseContent(f.input).status,'BLOCKED');
});
test('missing protected baseline is never accepted as completeness PASS',()=>{
 const f=fixture();delete f.inventory.protectedBaselines;f.refresh();assert.equal(validateReleaseContent(f.input).ok,false);
});
