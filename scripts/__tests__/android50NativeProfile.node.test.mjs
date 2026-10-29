import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { evaluateNativeBaseBuild, resolveProductionBuildProfile } from '../update-production.mjs';

const nativeSource = 'c4649ad59e92708db9ee51301812051aff92f33f';
const appJson = JSON.parse(execFileSync('git', ['show', `${nativeSource}:app.json`], { encoding: 'utf8' }));
const easJson = JSON.parse(execFileSync('git', ['show', `${nativeSource}:eas.json`], { encoding: 'utf8' }));
const build = { id: '13d80093-f910-4df2-8bb7-b97d3901222d', status: 'FINISHED', platform: 'android',
  runtimeVersion: '1.0.5-gnss-v1', appVersion: '1.0.5', appBuildVersion: '50', channel: 'production',
  buildProfile: 'android50-gnss', gitCommitHash: nativeSource };
const args = () => ({ build: { ...build }, buildId: build.id, platform: 'android', runtime: build.runtimeVersion,
  nativeConfig: { appJson: structuredClone(appJson), easJson: structuredClone(easJson) }, releaseAppVersion: '1.0.5' });

test('actual immutable native50 profile is a production store profile and correct first-OTA base', () => {
  assert.ok(resolveProductionBuildProfile(easJson, build.buildProfile, 'android'));
  assert.deepEqual(evaluateNativeBaseBuild(args()), []);
});
for (const [name, mutate] of [
  ['missing native source', a => { a.nativeConfig = undefined; }],
  ['wrong native runtime', a => { a.nativeConfig.appJson.expo.android.runtimeVersion = 'foreign'; }],
  ['wrong source version', a => { a.nativeConfig.appJson.expo.version = '1.0.4'; }],
  ['wrong release version', a => { a.releaseAppVersion = '1.0.4'; }],
  ['build in progress', a => { a.build.status = 'IN_PROGRESS'; }],
  ['wrong build id', a => { a.build.id = 'foreign'; }],
  ['wrong build platform', a => { a.build.platform = 'ios'; }],
  ['wrong build runtime', a => { a.build.runtimeVersion = '1.0.5-greeting-v1'; }],
  ['wrong channel', a => { a.build.channel = 'preview'; }],
  ['unknown profile', a => { a.build.buildProfile = 'missing'; }],
  ['profile cycle', a => { a.nativeConfig.easJson.build['android50-gnss'].extends = 'android50-gnss'; }],
  ['profile not production-derived', a => { delete a.nativeConfig.easJson.build['android50-gnss'].extends; }],
  ['staging profile environment', a => { a.nativeConfig.easJson.build['android50-gnss'].environment = 'staging'; }],
  ['preview profile channel', a => { a.nativeConfig.easJson.build['android50-gnss'].channel = 'preview'; }],
  ['internal profile distribution', a => { a.nativeConfig.easJson.build['android50-gnss'].distribution = 'internal'; }],
  ['development client', a => { a.nativeConfig.easJson.build['android50-gnss'].developmentClient = true; }],
  ['custom Gradle command', a => { a.nativeConfig.easJson.build['android50-gnss'].android.gradleCommand = ':app:assembleDebug'; }],
  ['invalid source commit', a => { a.build.gitCommitHash = 'unknown'; }],
]) test(`rejects ${name}`, () => {
  const a = args(); mutate(a); assert.ok(evaluateNativeBaseBuild(a).length > 0);
});
