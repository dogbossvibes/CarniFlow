const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const iosVersion = require('@expo/config-plugins/build/ios/Version');
const androidVersion = require('@expo/config-plugins/build/android/Version');

function runPlugin(config) {
  let callback;
  const module = { exports: {} };
  const bundle = fs.readFileSync('node_modules/expo-live-activity/ios-files/LiveActivityWidgetBundle.swift', 'utf8');
  vm.runInNewContext(fs.readFileSync('plugins/withAnyvoRestingLiveActivity.js', 'utf8'), {
    module, require(name) {
      if (name === 'expo/config-plugins') return { withXcodeProject(c, action) { callback = action; return c; } };
      if (name === 'fs') return { existsSync: () => true, copyFileSync() {}, mkdirSync() {}, writeFileSync() {}, readFileSync: () => bundle };
      if (name === 'path') return path;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  let id = 0;
  const objects = {
    PBXNativeTarget: {
      W: { name: 'LiveActivity', buildConfigurationList: 'L', buildPhases: [{ value:'WS' }, { value:'WR' }] },
      A: { name: 'ANYVO', productType:'"com.apple.product-type.application"', buildPhases: [{ value:'AS' }, { value:'AR' }] },
    },
    PBXGroup: { WG: { name:'LiveActivity', children:[] }, AG: { name:'ANYVO', children:[] } },
    PBXSourcesBuildPhase: { WS:{files:[]}, AS:{files:[]} },
    PBXResourcesBuildPhase: { WR:{files:[]}, AR:{files:[]} },
    PBXFileReference:{}, PBXBuildFile:{}, PBXProject:{},
    XCConfigurationList:{ L:{buildConfigurations:[{value:'D'},{value:'R'}]} },
    XCBuildConfiguration:{ D:{buildSettings:{}}, R:{buildSettings:{}} },
  };
  module.exports(config);
  callback({ ...config, modResults: {hash:{project:{objects}}, generateUuid:() => `ID${++id}`}, modRequest:{projectRoot:'/mock',platformProjectRoot:'/mock/ios'} });
  return objects;
}
for (const [label, ios, expected] of [
  ['explicit iOS version', {version:'1.0.5',buildNumber:'56'}, '1.0.5'],
  ['legacy root fallback', {buildNumber:'49'}, '1.0.4'],
  ['empty iOS version fallback', {version:'',buildNumber:'49'}, '1.0.4'],
]) test(`actual Xcode plugin synchronizes extension and main app: ${label}`, () => {
  const config={version:'1.0.4',ios,android:{versionCode:40}};
  const before=JSON.stringify(config);
  const objects=runPlugin(config);
  assert.equal(iosVersion.getVersion(config),expected);
  for(const key of ['D','R']) {
    assert.equal(objects.XCBuildConfiguration[key].buildSettings.MARKETING_VERSION,`"${expected}"`);
    assert.equal(objects.XCBuildConfiguration[key].buildSettings.CURRENT_PROJECT_VERSION,`"${ios.buildNumber}"`);
  }
  assert.equal(androidVersion.getVersionName(config),'1.0.4');
  assert.equal(JSON.stringify(config),before);
});
