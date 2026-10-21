const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject } = require('expo/config-plugins');
const plist = require('@expo/plist').default;

const TARGET = 'AnyvoWatch';
const SOURCES = [
  'plugins/ios/watch/AnyvoWatchApp.swift',
  'plugins/ios/watch/WatchSessionModel.swift',
  'plugins/ios/watch/WatchSessionView.swift',
  'modules/anyvo-wearable-control/ios/Core/WatchSessionContract.swift',
  'modules/anyvo-wearable-control/ios/Core/WatchCommandState.swift',
];
const entries = section => Object.entries(section ?? {}).filter(([key]) => !key.endsWith('_comment'));
const unquote = value => String(value ?? '').replace(/^"|"$/g, '');

function configurationObjects(project, target) {
  const objects = project.hash.project.objects;
  const list = objects.XCConfigurationList[target.buildConfigurationList];
  if (!list) throw new Error('Watch target has no configuration list');
  return list.buildConfigurations.map(item => objects.XCBuildConfiguration[item.value]);
}

function addFile(project, groupKey, targetKey, fileName, phaseType, fileType) {
  const objects = project.hash.project.objects;
  const group = objects.PBXGroup[groupKey];
  const target = objects.PBXNativeTarget[targetKey];
  const phaseKey = target.buildPhases.find(item => objects[phaseType]?.[item.value])?.value;
  if (!phaseKey) throw new Error(`Missing watch ${phaseType}`);
  const phase = objects[phaseType][phaseKey];
  let ref = group.children.find(item => unquote(objects.PBXFileReference[item.value]?.path) === fileName)?.value;
  if (!ref) {
    ref = project.generateUuid();
    objects.PBXFileReference[ref] = { isa: 'PBXFileReference', lastKnownFileType: fileType,
      path: `"${fileName}"`, sourceTree: '"<group>"' };
    objects.PBXFileReference[`${ref}_comment`] = fileName;
    group.children.push({ value: ref, comment: fileName });
  }
  if (!phase.files.some(item => objects.PBXBuildFile[item.value]?.fileRef === ref)) {
    const key = project.generateUuid();
    objects.PBXBuildFile[key] = { isa: 'PBXBuildFile', fileRef: ref, fileRef_comment: fileName };
    objects.PBXBuildFile[`${key}_comment`] = fileName;
    phase.files.push({ value: key, comment: fileName });
  }
}

function configureProject(project, { bundleIdentifier, version, buildNumber }) {
  if (!/^[A-Za-z0-9.-]+$/.test(bundleIdentifier ?? "") ||
      !/^\d+(?:\.\d+){0,2}$/.test(version ?? "") || !/^\d+(?:\.\d+){0,2}$/.test(buildNumber ?? "")) {
    throw new Error("Valid companion identity, version and build number required");
  }
  const objects = project.hash.project.objects;
  const app = project.getFirstTarget();
  if (unquote(app.firstTarget.productType) !== 'com.apple.product-type.application' ||
      configurationObjects(project, app.firstTarget).some(item => unquote(item.buildSettings.SDKROOT) === 'watchos' || item.buildSettings.WATCHOS_DEPLOYMENT_TARGET)) {
    throw new Error('Expected iOS application as the first target');
  }
  const existing = entries(objects.PBXNativeTarget).filter(([, target]) => unquote(target.name) === TARGET);
  if (existing.length > 1) throw new Error('Duplicate ANYVO watch targets; review generated project');
  let targetKey = existing[0]?.[0];
  if (!targetKey) targetKey = project.addTarget(TARGET, 'application', TARGET, `${bundleIdentifier}.watchkitapp`).uuid;
  const target = objects.PBXNativeTarget[targetKey];
  if (unquote(target.productType) !== 'com.apple.product-type.application') throw new Error('Watch target must be a modern single app target');
  for (const type of ['PBXSourcesBuildPhase', 'PBXResourcesBuildPhase', 'PBXFrameworksBuildPhase']) {
    if (!target.buildPhases.some(item => objects[type]?.[item.value])) {
      project.addBuildPhase([], type, type.replace('PBX', '').replace('BuildPhase', ''), targetKey);
    }
  }
  const team = configurationObjects(project, app.firstTarget).map(item => item.buildSettings.DEVELOPMENT_TEAM).find(Boolean);
  for (const config of configurationObjects(project, target)) {
    const oldBundle = unquote(config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER);
    if (oldBundle && oldBundle !== `${bundleIdentifier}.watchkitapp`) throw new Error('Watch bundle identity mismatch');
    Object.assign(config.buildSettings, {
      SDKROOT: 'watchos', SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
      WATCHOS_DEPLOYMENT_TARGET: '9.0', TARGETED_DEVICE_FAMILY: '4',
      PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}.watchkitapp"`,
      INFOPLIST_FILE: `"${TARGET}/${TARGET}-Info.plist"`,
      GENERATE_INFOPLIST_FILE: 'NO', PRODUCT_NAME: `"${TARGET}"`,
      MARKETING_VERSION: `"${version}"`, CURRENT_PROJECT_VERSION: `"${buildNumber}"`,
      SWIFT_VERSION: '5.0', CLANG_ENABLE_MODULES: 'YES',
      CODE_SIGN_STYLE: 'Automatic', SKIP_INSTALL: 'YES',
      ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks"',
      ...(team ? { DEVELOPMENT_TEAM: team } : {}),
    });
    if (config.name === 'Debug') config.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = '"$(inherited) DEBUG"';
    // watchOS has its own deployment and no iPhone device family.
    delete config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET;
  }
  let groupKey = entries(objects.PBXGroup).find(([, group]) => unquote(group.path) === TARGET)?.[0];
  if (!groupKey) {
    const group = project.addPbxGroup([], TARGET, TARGET);
    groupKey = group.uuid;
    const root = project.getFirstProject().firstProject.mainGroup;
    objects.PBXGroup[root].children.push({ value: groupKey, comment: TARGET });
  }
  for (const source of SOURCES) addFile(project, groupKey, targetKey, path.basename(source), 'PBXSourcesBuildPhase', 'sourcecode.swift');
  addFile(project, groupKey, targetKey, 'Assets.xcassets', 'PBXResourcesBuildPhase', 'folder.assetcatalog');
  addFile(project, groupKey, targetKey, 'Localizable.xcstrings', 'PBXResourcesBuildPhase', 'text.json.xcstrings');

  const embeds = app.firstTarget.buildPhases.filter(item => unquote(objects.PBXCopyFilesBuildPhase?.[item.value]?.name) === 'Embed Watch Content');
  if (embeds.length > 1) throw new Error('Duplicate watch embed phases');
  const embed = embeds.length ? objects.PBXCopyFilesBuildPhase[embeds[0].value]
    : project.addBuildPhase([], 'PBXCopyFilesBuildPhase', 'Embed Watch Content', app.uuid, 'watch2_app', '"$(CONTENTS_FOLDER_PATH)/Watch"').buildPhase;
  embed.dstSubfolderSpec = 16;
  embed.dstPath = '"$(CONTENTS_FOLDER_PATH)/Watch"';
  if (!embed.files.some(item => objects.PBXBuildFile[item.value]?.fileRef === target.productReference)) {
    const key = project.generateUuid();
    objects.PBXBuildFile[key] = { isa: 'PBXBuildFile', fileRef: target.productReference,
      fileRef_comment: `${TARGET}.app`, settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] } };
    objects.PBXBuildFile[`${key}_comment`] = `${TARGET}.app in Embed Watch Content`;
    embed.files.push({ value: key, comment: `${TARGET}.app in Embed Watch Content` });
  }
  // addTarget creates this dependency only on first creation. Verify it also on later prebuilds.
  if (!app.firstTarget.dependencies.some(item => objects.PBXTargetDependency?.[item.value]?.target === targetKey)) {
    project.addTargetDependency(app.uuid, [targetKey]);
  }
  return targetKey;
}

function configureMetadata(config) {
  const identifier = config.ios?.bundleIdentifier;
  if (!identifier || !/^[A-Za-z0-9.-]+$/.test(identifier)) throw new Error('Valid companion bundle identifier required');
  config.extra ??= {}; config.extra.eas ??= {}; config.extra.eas.build ??= {};
  config.extra.eas.build.experimental ??= {}; config.extra.eas.build.experimental.ios ??= {};
  const ios = config.extra.eas.build.experimental.ios;
  const current = ios.appExtensions ?? [];
  const own = current.filter(item => item.targetName === TARGET);
  if (own.some(item => item.bundleIdentifier !== `${identifier}.watchkitapp`)) throw new Error('Watch EAS signing identity mismatch');
  ios.appExtensions = [...current.filter(item => item.targetName !== TARGET),
    { targetName: TARGET, bundleIdentifier: `${identifier}.watchkitapp`, entitlements: {} }];
  return config;
}

module.exports = config => withXcodeProject(configureMetadata(config), cfg => {
  if (cfg.modRequest.introspect) return cfg;
  const { projectRoot, platformProjectRoot } = cfg.modRequest;
  configureProject(cfg.modResults, { bundleIdentifier: cfg.ios.bundleIdentifier,
    version: cfg.version, buildNumber: cfg.ios.buildNumber });
  const dest = path.join(platformProjectRoot, TARGET);
  fs.mkdirSync(dest, { recursive: true });
  for (const source of [...SOURCES, 'plugins/ios/watch/Localizable.xcstrings']) {
    fs.copyFileSync(path.join(projectRoot, source), path.join(dest, path.basename(source)));
  }
  const icons = path.join(dest, 'Assets.xcassets', 'AppIcon.appiconset');
  fs.mkdirSync(icons, { recursive: true });
  fs.copyFileSync(path.join(projectRoot, cfg.ios.icon ?? cfg.icon), path.join(icons, 'AppIcon.png'));
  fs.writeFileSync(path.join(dest, 'Assets.xcassets', 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }));
  fs.writeFileSync(path.join(icons, 'Contents.json'), JSON.stringify({ images: [{ filename: 'AppIcon.png', idiom: 'universal', platform: 'watchos', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }));
  fs.writeFileSync(path.join(dest, `${TARGET}-Info.plist`), plist.build({
    CFBundleDisplayName: 'ANYVO', CFBundleName: '$(PRODUCT_NAME)',
    CFBundleExecutable: '$(EXECUTABLE_NAME)', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0', CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: '$(MARKETING_VERSION)', CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
    WKApplication: true, WKCompanionAppBundleIdentifier: cfg.ios.bundleIdentifier,
    WKRunsIndependentlyOfCompanionApp: false, ITSAppUsesNonExemptEncryption: false,
  }));
  return cfg;
});
module.exports.configureProject = configureProject;
module.exports.configureMetadata = configureMetadata;
module.exports.SOURCES = SOURCES;
module.exports.TARGET = TARGET;
