// ─────────────────────────────────────────────────────────────────────────
// ANYVO iOS-Erweiterungen im per Prebuild erzeugten Xcode-Projekt (reproduzierbar,
// Source of Truth liegt im Repo, nie nur im generierten ios/):
//
// Widget-Target `LiveActivity` (von expo-live-activity erzeugt):
//   • AnyvoRestingActivityAttributes.swift  (Liegezeit-V2-Schema — dieselbe Datei wie im App-Modul)
//   • AnyvoRestingActivityWidget.swift       (Liegezeit V2: Sperrbildschirm + Dynamic Island)
//   • AnyvoQuickStartWidget.swift            (Schnellstart-Widget, reine App-Navigation)
//   • Localizable.xcstrings                  (Widget-Texte de/en/fr/it)
//   • Registrierung beider Widgets im WidgetBundle (LiveActivityWidgetBundle.swift)
// App-Target (ANYVO):
//   • AnyvoAppIntents.swift                  (App Intents + App Shortcuts, feste Routen)
//   • AppShortcuts.xcstrings / Localizable.xcstrings (Siri-Phrasen + Intent-Texte)
//
// REIHENFOLGE: Xcode-Mods laufen in UMGEKEHRTER Plugin-Reihenfolge.
//   • withAnyvoRestingLiveActivity steht in app.json VOR "expo-live-activity" → läuft NACH dessen Mod.
//   • withAnyvoLiveActivityPrebuildGuard steht NACH "expo-live-activity" → läuft VOR dessen Mod.
// Prebuild-Guard: expo-live-activity@0.4.2 legt das Widget-Target bei jedem Prebuild ohne
// --clean ERNEUT an (doppelte Targets/Gruppen/.appex/Embed-Phasen). Existiert das Target
// schon, sichert der Guard den Objektstand vor dem Paket-Mod; danach wird er
// wiederhergestellt (das erneute Anlegen wird verworfen) und nur noch idempotent ergänzt.
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { withXcodeProject } = require('expo/config-plugins');

const WIDGET_TARGET = 'LiveActivity';
const APP_PRODUCT_TYPE = '"com.apple.product-type.application"';
const MODULE_DIR = path.join('modules', 'anyvo-resting-activity');
const IOS_SRC = path.join('plugins', 'ios');

/** Welche Repo-Datei in welches Target kommt (exportiert für Contract-Tests). */
const WIDGET_SOURCES = [
  path.join(MODULE_DIR, 'ios', 'AnyvoRestingActivityAttributes.swift'),
  path.join(MODULE_DIR, 'widget', 'AnyvoRestingActivityWidget.swift'),
  path.join(IOS_SRC, 'widget', 'AnyvoQuickStartWidget.swift'),
];
const WIDGET_RESOURCES = [path.join(IOS_SRC, 'widget', 'Localizable.xcstrings')];
const APP_SOURCES = [path.join(IOS_SRC, 'app', 'AnyvoAppIntents.swift')];
const APP_RESOURCES = [
  path.join(IOS_SRC, 'app', 'AppShortcuts.xcstrings'),
  path.join(IOS_SRC, 'app', 'Localizable.xcstrings'),
];
/** Sprachen der String-Kataloge (Entwicklungssprache en). */
const KNOWN_REGIONS = ['de', 'fr', 'it'];

const BUNDLE_FILE = 'LiveActivityWidgetBundle.swift';
const V1_WIDGET = 'LiveActivityWidget()';
const BUNDLE_WIDGETS = ['AnyvoRestingActivityWidget()', 'AnyvoQuickStartWidget()'];
const SNAPSHOT = Symbol.for('anyvo.liveActivityPrebuildSnapshot');

/** WidgetBundle um V2- und Schnellstart-Widget ergänzen (idempotent). Exportiert für Tests. */
function patchWidgetBundle(source) {
  if (!source.includes(V1_WIDGET)) {
    throw new Error(`[withAnyvoRestingLiveActivity] ${BUNDLE_FILE}: "${V1_WIDGET}" nicht gefunden — Bundle-Format von expo-live-activity hat sich geändert.`);
  }
  let out = source;
  let anchor = V1_WIDGET;
  for (const w of BUNDLE_WIDGETS) {
    if (!out.includes(w)) out = out.replace(anchor, `${anchor}\n    ${w}`);
    anchor = w;
  }
  return out;
}

const real = section => Object.entries(section ?? {}).filter(([k]) => !k.endsWith('_comment'));

function findTargetKeys(project, name) {
  return real(project.hash.project.objects.PBXNativeTarget).filter(([, t]) => t.name === name || t.name === `"${name}"`).map(([k]) => k);
}

function findAppTargetKey(project) {
  const hit = real(project.hash.project.objects.PBXNativeTarget).find(([, t]) => t.productType === APP_PRODUCT_TYPE);
  return hit ? hit[0] : null;
}

function findGroupKey(project, name) {
  return real(project.hash.project.objects.PBXGroup).find(([, g]) => g.path === name || g.name === name || g.path === `"${name}"`)?.[0] ?? null;
}

function findPhase(project, targetKey, isa) {
  const objects = project.hash.project.objects;
  const target = objects.PBXNativeTarget[targetKey];
  const phase = (target?.buildPhases ?? []).find(p => objects[isa]?.[p.value]);
  return phase ? objects[isa][phase.value] : null;
}

const FILE_TYPES = { '.swift': 'sourcecode.swift', '.xcstrings': 'text.json.xcstrings' };

/**
 * Datei in GENAU diese Gruppe + GENAU diese Phase des Targets aufnehmen (idempotent).
 * Gruppengenau, weil App und Widget je einen „Localizable.xcstrings" haben.
 */
function addFileToTarget(project, { name, groupKey, targetKey, isa }) {
  const objects = project.hash.project.objects;
  const phase = findPhase(project, targetKey, isa);
  if (!phase) throw new Error(`[withAnyvoRestingLiveActivity] ${isa} des Targets fehlt (${name}).`);
  const group = objects.PBXGroup[groupKey];
  const refs = objects.PBXFileReference;
  let fileRef = (group.children ?? []).map(c => c.value).find(k => refs[k] && (refs[k].path === name || refs[k].path === `"${name}"`));
  if (fileRef && phase.files.some(f => objects.PBXBuildFile[f.value]?.fileRef === fileRef)) return;   // bereits Mitglied
  if (!fileRef) {
    fileRef = project.generateUuid();
    const type = FILE_TYPES[path.extname(name)] ?? 'text';
    refs[fileRef] = { isa: 'PBXFileReference', lastKnownFileType: type, name: `"${name}"`, path: `"${name}"`, sourceTree: '"<group>"' };
    refs[`${fileRef}_comment`] = name;
    group.children.push({ value: fileRef, comment: name });
  }
  const phaseName = isa === 'PBXSourcesBuildPhase' ? 'Sources' : 'Resources';
  const buildKey = project.generateUuid();
  objects.PBXBuildFile[buildKey] = { isa: 'PBXBuildFile', fileRef, fileRef_comment: name };
  objects.PBXBuildFile[`${buildKey}_comment`] = `${name} in ${phaseName}`;
  phase.files.push({ value: buildKey, comment: `${name} in ${phaseName}` });
}

function addKnownRegions(project, regions) {
  const proj = real(project.hash.project.objects.PBXProject)[0]?.[1];
  if (!proj) return;
  proj.knownRegions = proj.knownRegions ?? ['en', 'Base'];
  for (const r of regions) if (!proj.knownRegions.includes(r)) proj.knownRegions.push(r);
}

/** Vor dem expo-live-activity-Mod: existiert das Widget-Target bereits, Objektstand sichern. */
function snapshotIfTargetExists(project) {
  if (findTargetKeys(project, WIDGET_TARGET).length > 0) {
    project[SNAPSHOT] = JSON.parse(JSON.stringify(project.hash.project.objects));
  }
}

/** Nach dem expo-live-activity-Mod: erneutes Anlegen verwerfen (Snapshot wiederherstellen). */
function restoreSnapshotIfAny(project) {
  if (project[SNAPSHOT]) {
    project.hash.project.objects = project[SNAPSHOT];
    delete project[SNAPSHOT];
  }
}

/** Versionen des Widget-Targets an die App-Config angleichen (nötig nach Snapshot-Restore). */
function syncWidgetVersions(project, targetKey, version, buildNumber) {
  const objects = project.hash.project.objects;
  const listKey = objects.PBXNativeTarget[targetKey].buildConfigurationList;
  for (const c of objects.XCConfigurationList[listKey].buildConfigurations) {
    const bs = objects.XCBuildConfiguration[c.value].buildSettings;
    if (version) bs.MARKETING_VERSION = `"${version}"`;
    if (buildNumber) bs.CURRENT_PROJECT_VERSION = `"${buildNumber}"`;
  }
}

function copyInto(projectRoot, rels, dir) {
  for (const rel of rels) fs.copyFileSync(path.join(projectRoot, rel), path.join(dir, path.basename(rel)));
}

const withAnyvoRestingLiveActivity = config =>
  withXcodeProject(config, cfg => {
    const project = cfg.modResults;
    const { projectRoot, platformProjectRoot } = cfg.modRequest;
    restoreSnapshotIfAny(project);

    const widgetKeys = findTargetKeys(project, WIDGET_TARGET);
    const widgetGroup = findGroupKey(project, WIDGET_TARGET);
    const widgetDir = path.join(platformProjectRoot, WIDGET_TARGET);
    const bundlePath = path.join(widgetDir, BUNDLE_FILE);
    if (widgetKeys.length !== 1 || !widgetGroup || !fs.existsSync(bundlePath)) {
      throw new Error(
        `[withAnyvoRestingLiveActivity] Erwartet genau 1 Widget-Target "${WIDGET_TARGET}" (gefunden: ${widgetKeys.length}). ` +
        'Das Plugin muss in app.json VOR "expo-live-activity" stehen, der Prebuild-Guard DANACH.',
      );
    }
    const appKey = findAppTargetKey(project);
    const appName = appKey ? project.hash.project.objects.PBXNativeTarget[appKey].name.replace(/"/g, '') : null;
    const appGroup = appName ? findGroupKey(project, appName) : null;
    if (!appKey || !appGroup) throw new Error('[withAnyvoRestingLiveActivity] App-Target/-Gruppe nicht gefunden.');

    copyInto(projectRoot, [...WIDGET_SOURCES, ...WIDGET_RESOURCES], widgetDir);
    for (const rel of WIDGET_SOURCES) addFileToTarget(project, { name: path.basename(rel), groupKey: widgetGroup, targetKey: widgetKeys[0], isa: 'PBXSourcesBuildPhase' });
    for (const rel of WIDGET_RESOURCES) addFileToTarget(project, { name: path.basename(rel), groupKey: widgetGroup, targetKey: widgetKeys[0], isa: 'PBXResourcesBuildPhase' });

    const appDir = path.join(platformProjectRoot, appName);
    copyInto(projectRoot, [...APP_SOURCES, ...APP_RESOURCES], appDir);
    for (const rel of APP_SOURCES) addFileToTarget(project, { name: path.basename(rel), groupKey: appGroup, targetKey: appKey, isa: 'PBXSourcesBuildPhase' });
    for (const rel of APP_RESOURCES) addFileToTarget(project, { name: path.basename(rel), groupKey: appGroup, targetKey: appKey, isa: 'PBXResourcesBuildPhase' });

    syncWidgetVersions(project, widgetKeys[0], cfg.version, cfg.ios?.buildNumber);
    addKnownRegions(project, KNOWN_REGIONS);
    fs.writeFileSync(bundlePath, patchWidgetBundle(fs.readFileSync(bundlePath, 'utf8')));
    return cfg;
  });

/** Läuft VOR dem expo-live-activity-Mod (in app.json NACH dem Paket eintragen). */
const withAnyvoLiveActivityPrebuildGuard = config =>
  withXcodeProject(config, cfg => {
    snapshotIfTargetExists(cfg.modResults);
    return cfg;
  });

module.exports = withAnyvoRestingLiveActivity;
module.exports.withAnyvoLiveActivityPrebuildGuard = withAnyvoLiveActivityPrebuildGuard;
module.exports.patchWidgetBundle = patchWidgetBundle;
module.exports.addFileToTarget = addFileToTarget;
module.exports.snapshotIfTargetExists = snapshotIfTargetExists;
module.exports.restoreSnapshotIfAny = restoreSnapshotIfAny;
module.exports.syncWidgetVersions = syncWidgetVersions;
module.exports.WIDGET_SOURCES = WIDGET_SOURCES;
module.exports.WIDGET_RESOURCES = WIDGET_RESOURCES;
module.exports.APP_SOURCES = APP_SOURCES;
module.exports.APP_RESOURCES = APP_RESOURCES;
