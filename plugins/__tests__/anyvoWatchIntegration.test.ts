import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const xcode = require('xcode');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withAnyvoWatchApp');

function project() {
  const p = xcode.project('synthetic.pbxproj');
  p.hash = { project: { archiveVersion: 1, objectVersion: 54, classes: {}, rootObject: 'ROOT', objects: {
    PBXProject: { ROOT: { isa: 'PBXProject', mainGroup: 'MAIN', targets: [{ value: 'APP', comment: 'ANYVO' }], attributes: {}, knownRegions: ['en', 'Base'] } },
    PBXNativeTarget: { APP: { isa: 'PBXNativeTarget', name: 'ANYVO', productType: '"com.apple.product-type.application"', buildConfigurationList: 'APPCONFIG', buildPhases: [], dependencies: [] } },
    XCConfigurationList: { APPCONFIG: { isa: 'XCConfigurationList', buildConfigurations: [{ value: 'DEBUG' }, { value: 'RELEASE' }] } },
    XCBuildConfiguration: { DEBUG: { isa: 'XCBuildConfiguration', name: 'Debug', buildSettings: { DEVELOPMENT_TEAM: 'TESTTEAM', PRODUCT_BUNDLE_IDENTIFIER: 'com.anyvo.app' } }, RELEASE: { isa: 'XCBuildConfiguration', name: 'Release', buildSettings: { DEVELOPMENT_TEAM: 'TESTTEAM', PRODUCT_BUNDLE_IDENTIFIER: 'com.anyvo.app' } } },
    PBXGroup: { MAIN: { isa: 'PBXGroup', children: [{ value: 'PRODUCTS', comment: 'Products' }], sourceTree: '"<group>"' }, PRODUCTS: { isa: 'PBXGroup', name: 'Products', children: [], sourceTree: '"<group>"' } },
    PBXBuildFile: {}, PBXFileReference: {}, PBXTargetDependency: {}, PBXContainerItemProxy: {},
  } } };
  return p;
}
const options = { bundleIdentifier: 'com.anyvo.app', version: '1.0.5', buildNumber: '54' };

describe('ANYVO modern companion Watch target', () => {
  it('creates one separately compiled Watch app, embeds its exact product, and preserves iPhone settings', () => {
    const p = project();
    const before = JSON.stringify(p.hash.project.objects.XCBuildConfiguration);
    const key = plugin.configureProject(p, options);
    const o = p.hash.project.objects;
    const watch = o.PBXNativeTarget[key];
    expect(watch.productType).toBe('"com.apple.product-type.application"');
    expect(JSON.stringify({ DEBUG: o.XCBuildConfiguration.DEBUG, RELEASE: o.XCBuildConfiguration.RELEASE })).toBe(before);
    const list = o.XCConfigurationList[watch.buildConfigurationList];
    for (const item of list.buildConfigurations) {
      expect(o.XCBuildConfiguration[item.value].buildSettings).toMatchObject({ SDKROOT: 'watchos', WATCHOS_DEPLOYMENT_TARGET: '9.0', TARGETED_DEVICE_FAMILY: '4', CURRENT_PROJECT_VERSION: '"54"', PRODUCT_BUNDLE_IDENTIFIER: '"com.anyvo.app.watchkitapp"', DEVELOPMENT_TEAM: 'TESTTEAM' });
    }
    const embed = Object.values(o.PBXCopyFilesBuildPhase).find((phase: any) => phase?.name === '"Embed Watch Content"') as any;
    expect(embed.dstSubfolderSpec).toBe(16);
    expect(embed.dstPath).toBe('"$(CONTENTS_FOLDER_PATH)/Watch"');
    expect(embed.files).toHaveLength(1);
    expect(o.PBXBuildFile[embed.files[0].value].fileRef).toBe(watch.productReference);
    expect(o.PBXNativeTarget.APP.dependencies.map((item: any) => o.PBXTargetDependency[item.value].target)).toEqual([key]);
    expect(watch.dependencies).toEqual([]);
    const source = watch.buildPhases.map((item: any) => o.PBXSourcesBuildPhase[item.value]).find(Boolean);
    expect(source.files.map((item: any) => o.PBXFileReference[o.PBXBuildFile[item.value].fileRef].path).sort()).toEqual(plugin.SOURCES.map((file: string) => `"${path.basename(file)}"`).sort());
  });
  it('is byte-idempotent, synchronizes versions, and survives real PBX serialization/parsing', () => {
    const p = project();
    const key = plugin.configureProject(p, options);
    const first = p.writeSync();
    for (let i = 0; i < 3; i++) expect(plugin.configureProject(p, options)).toBe(key);
    expect(p.writeSync()).toBe(first);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anyvo-watch-pbx-test-'));
    try {
      const file = path.join(dir, 'project.pbxproj'); fs.writeFileSync(file, first);
      const parsed = xcode.project(file); parsed.parseSync();
      expect(plugin.configureProject(parsed, options)).toBe(key);
      expect(parsed.writeSync()).toBe(first);
      plugin.configureProject(parsed, { ...options, buildNumber: '55', version: '1.0.6' });
      const o = parsed.hash.project.objects;
      for (const item of o.XCConfigurationList[o.PBXNativeTarget[key].buildConfigurationList].buildConfigurations) {
        expect(o.XCBuildConfiguration[item.value].buildSettings).toMatchObject({ CURRENT_PROJECT_VERSION: '"55"', MARKETING_VERSION: '"1.0.6"' });
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('rejects missing release metadata and a Watch target masquerading as the companion', () => {
    expect(() => plugin.configureProject(project(), { ...options, buildNumber: undefined })).toThrow(/required/);
    const p = project(); p.hash.project.objects.XCBuildConfiguration.DEBUG.buildSettings.SDKROOT = 'watchos';
    expect(() => plugin.configureProject(p, options)).toThrow(/iOS application/);
  });
  it('rejects duplicate targets or a changed signing identity', () => {
    const p = project(); const key = plugin.configureProject(p, options);
    const o = p.hash.project.objects;
    o.PBXNativeTarget.DUPLICATE = { ...o.PBXNativeTarget[key] };
    expect(() => plugin.configureProject(p, options)).toThrow(/Duplicate/);
    delete o.PBXNativeTarget.DUPLICATE;
    const configuration = o.XCConfigurationList[o.PBXNativeTarget[key].buildConfigurationList].buildConfigurations[0].value;
    o.XCBuildConfiguration[configuration].buildSettings.PRODUCT_BUNDLE_IDENTIFIER = 'com.foreign.app';
    expect(() => plugin.configureProject(p, options)).toThrow(/identity/);
  });
  it('preserves unrelated EAS extension records and rejects watch identity drift', () => {
    const foreign = { targetName: 'LiveActivity', bundleIdentifier: 'com.anyvo.app.LiveActivity', entitlements: { custom: true } };
    const config: any = { ios: { bundleIdentifier: 'com.anyvo.app' }, extra: { eas: { build: { experimental: { ios: { appExtensions: [foreign] } } } } } };
    plugin.configureMetadata(config); plugin.configureMetadata(config);
    expect(config.extra.eas.build.experimental.ios.appExtensions).toEqual([foreign, { targetName: 'AnyvoWatch', bundleIdentifier: 'com.anyvo.app.watchkitapp', entitlements: {} }]);
    expect(() => plugin.configureMetadata({ ios: { bundleIdentifier: 'bad/id' } })).toThrow();
    config.extra.eas.build.experimental.ios.appExtensions[1].bundleIdentifier = 'com.foreign.app';
    expect(() => plugin.configureMetadata(config)).toThrow(/identity/);
  });
  it('runs after existing widget restoration and ships each source and translation', () => {
    const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
    const watch = config.plugins.indexOf('./plugins/withAnyvoWatchApp');
    expect(watch).toBeGreaterThan(-1);
    expect(watch).toBeLessThan(config.plugins.indexOf('./plugins/withAnyvoRestingLiveActivity'));
    for (const source of plugin.SOURCES) expect(fs.existsSync(source)).toBe(true);
    const catalog = JSON.parse(fs.readFileSync('plugins/ios/watch/Localizable.xcstrings', 'utf8'));
    for (const value of Object.values(catalog.strings) as any[]) {
      for (const lang of ['de', 'fr', 'it']) expect(value.localizations[lang].stringUnit.value.length).toBeGreaterThan(0);
    }
  });
});
