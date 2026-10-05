// ─────────────────────────────────────────────────────────────────────────
// Liegezeit-Live-Activity V2 → bestehendes Widget-Target `LiveActivity`.
//
// expo-live-activity erzeugt das Widget-Target und kopiert nur seine eigenen
// Dateien. Dieses Plugin ergänzt dort:
//   • AnyvoRestingActivityAttributes.swift  (Schema — dieselbe Datei wie im App-Modul)
//   • AnyvoRestingActivityWidget.swift       (Sperrbildschirm + Dynamic Island)
//   • Registrierung im WidgetBundle (LiveActivityWidgetBundle.swift)
//
// REIHENFOLGE: Xcode-Mods laufen in UMGEKEHRTER Plugin-Reihenfolge. Dieses Plugin
// muss in app.json daher VOR "expo-live-activity" stehen, damit sein Mod NACH dem
// des Pakets läuft (Target + Bundle-Datei existieren dann). Fehlt das Target, bricht
// das Plugin mit klarer Meldung ab statt still ein Widget ohne V2 zu erzeugen.
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { withXcodeProject } = require('expo/config-plugins');

const TARGET_NAME = 'LiveActivity';
const MODULE_DIR = path.join('modules', 'anyvo-resting-activity');
const WIDGET_FILES = [
  path.join(MODULE_DIR, 'ios', 'AnyvoRestingActivityAttributes.swift'),
  path.join(MODULE_DIR, 'widget', 'AnyvoRestingActivityWidget.swift'),
];
const BUNDLE_FILE = 'LiveActivityWidgetBundle.swift';
const V1_WIDGET = 'LiveActivityWidget()';
const V2_WIDGET = 'AnyvoRestingActivityWidget()';

/** WidgetBundle um das V2-Widget ergänzen (idempotent). Exportiert für Tests. */
function patchWidgetBundle(source) {
  if (source.includes(V2_WIDGET)) return source;
  if (!source.includes(V1_WIDGET)) {
    throw new Error(`[withAnyvoRestingLiveActivity] ${BUNDLE_FILE}: "${V1_WIDGET}" nicht gefunden — Bundle-Format von expo-live-activity hat sich geändert.`);
  }
  return source.replace(V1_WIDGET, `${V1_WIDGET}\n    ${V2_WIDGET}`);
}

/** Sources-Phase GENAU des Widget-Targets (expo-live-activity benennt sie nicht „Sources",
 *  daher würde addSourceFile auf die App-Sources zurückfallen — dort gehört das Widget nicht hin). */
function findTargetSourcesPhase(project, targetKey) {
  const objects = project.hash.project.objects;
  const target = objects.PBXNativeTarget[targetKey];
  const phase = (target?.buildPhases ?? []).find(p => objects.PBXSourcesBuildPhase?.[p.value]);
  return phase ? objects.PBXSourcesBuildPhase[phase.value] : null;
}

function findFileRef(project, name) {
  const refs = project.pbxFileReferenceSection();
  return Object.keys(refs).find(k => !k.endsWith('_comment') && (refs[k].path === name || refs[k].path === `"${name}"`)) ?? null;
}

/** Datei in Gruppe + Sources des Widget-Targets aufnehmen (idempotent). Exportiert für Tests. */
function addWidgetSource(project, name, targetKey, groupKey) {
  const phase = findTargetSourcesPhase(project, targetKey);
  if (!phase) throw new Error(`[withAnyvoRestingLiveActivity] Sources-Phase des Targets "${TARGET_NAME}" fehlt.`);
  const comment = `${name} in Sources`;
  if (phase.files.some(f => f.comment === comment)) return;   // bereits Mitglied
  const file = findFileRef(project, name) ? null : project.addFile(name, groupKey);
  const fileRef = file ? file.fileRef : findFileRef(project, name);
  if (!fileRef) throw new Error(`[withAnyvoRestingLiveActivity] Dateireferenz für ${name} fehlt.`);
  const buildFile = { uuid: project.generateUuid(), fileRef, basename: name, group: 'Sources' };
  project.addToPbxBuildFileSection(buildFile);
  phase.files.push({ value: buildFile.uuid, comment });
}

function findGroupKey(project, name) {
  const groups = project.hash.project.objects.PBXGroup;
  return Object.keys(groups).find(k => !k.endsWith('_comment') && (groups[k].path === name || groups[k].name === name)) ?? null;
}

const withAnyvoRestingLiveActivity = config =>
  withXcodeProject(config, cfg => {
    const project = cfg.modResults;
    const { projectRoot, platformProjectRoot } = cfg.modRequest;
    const targetKey = project.findTargetKey(TARGET_NAME);
    const groupKey = findGroupKey(project, TARGET_NAME);
    const targetDir = path.join(platformProjectRoot, TARGET_NAME);
    const bundlePath = path.join(targetDir, BUNDLE_FILE);
    if (!targetKey || !groupKey || !fs.existsSync(bundlePath)) {
      throw new Error(
        `[withAnyvoRestingLiveActivity] Widget-Target "${TARGET_NAME}" fehlt. Das Plugin muss in app.json VOR "expo-live-activity" stehen.`,
      );
    }

    for (const rel of WIDGET_FILES) {
      const name = path.basename(rel);
      fs.copyFileSync(path.join(projectRoot, rel), path.join(targetDir, name));
      addWidgetSource(project, name, targetKey, groupKey);
    }

    fs.writeFileSync(bundlePath, patchWidgetBundle(fs.readFileSync(bundlePath, 'utf8')));
    return cfg;
  });

module.exports = withAnyvoRestingLiveActivity;
module.exports.patchWidgetBundle = patchWidgetBundle;
module.exports.addWidgetSource = addWidgetSource;
