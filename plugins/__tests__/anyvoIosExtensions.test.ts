/**
 * ANYVO iOS-Erweiterungen (Config-Plugin): Prebuild-Guard gegen doppelte Widget-Targets,
 * exakte Target-Zuordnung (Widget ↔ App), Bundle-Registrierung, Plugin-Reihenfolge,
 * Lokalisierung und Sicherheitsverbote in Widget/Intents. Der echte Prebuild (clean + 3×
 * ohne --clean) wurde zusätzlich gegen das generierte Xcode-Projekt geprüft.
 */
import { existsSync, readFileSync } from 'fs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withAnyvoRestingLiveActivity');

const swiftWidget = readFileSync('plugins/ios/widget/AnyvoQuickStartWidget.swift', 'utf8');
const swiftIntents = readFileSync('plugins/ios/app/AnyvoAppIntents.swift', 'utf8');
/** Swift ohne Kommentare (Verbote dürfen in Kommentaren erklärt werden). */
const code = (s: string) => s.split('\n').map(l => l.replace(/\/\/.*$/, '').replace(/\/\/\/.*$/, '')).join('\n');
/** .strings-Datei → { Schlüssel: Wert } (JSON-kompatible Stringliterale). */
const stringsFile = (p: string) => Object.fromEntries(
  [...readFileSync(p, 'utf8').matchAll(/^("(?:[^"\\]|\\.)*") = ("(?:[^"\\]|\\.)*");$/gm)].map(m => [JSON.parse(m[1]), JSON.parse(m[2])]),
) as Record<string, string>;
const catalog = (p: string) => JSON.parse(readFileSync(p, 'utf8')).strings as Record<string, { localizations: Record<string, unknown> }>;

describe('Target-Zuordnung (Source of Truth im Repo)', () => {
  it('Widget-Target: Liegezeit V2 + Schnellstart + Widget-Katalog; App-Target: Intents + Kataloge', () => {
    expect(plugin.WIDGET_SOURCES.map((p: string) => p.split('/').pop())).toEqual([
      'AnyvoRestingActivityAttributes.swift', 'AnyvoRestingActivityWidget.swift', 'AnyvoQuickStartWidget.swift',
    ]);
    expect(plugin.WIDGET_RESOURCES.map((p: string) => p.split('/').pop())).toEqual(['Localizable.xcstrings']);
    expect(plugin.APP_SOURCES.map((p: string) => p.split('/').pop())).toEqual(['AnyvoAppIntents.swift']);
    expect(plugin.APP_RESOURCES.map((p: string) => p.split('/').pop())).toEqual(['Localizable.xcstrings']);
    for (const p of [...plugin.WIDGET_SOURCES, ...plugin.WIDGET_RESOURCES, ...plugin.APP_SOURCES, ...plugin.APP_RESOURCES]) expect(existsSync(p)).toBe(true);
    expect(plugin.APP_LOCALIZED_STRINGS).toEqual([{ name: 'AppShortcuts.strings', srcDir: 'plugins/ios/app', languages: ['de', 'fr', 'it'] }]);
    for (const lng of ['de', 'fr', 'it']) expect(existsSync(`plugins/ios/app/${lng}.lproj/AppShortcuts.strings`)).toBe(true);
    // keine Widget-Datei im App-Target, keine Intent-Datei im Widget-Target
    expect(plugin.APP_SOURCES.some((p: string) => /Widget/.test(p))).toBe(false);
    expect(plugin.WIDGET_SOURCES.some((p: string) => /Intent/.test(p))).toBe(false);
  });

  it('WidgetBundle: V1 + Liegezeit V2 + Schnellstart, idempotent, je genau einmal', () => {
    const src = readFileSync('node_modules/expo-live-activity/ios-files/LiveActivityWidgetBundle.swift', 'utf8');
    const once = plugin.patchWidgetBundle(src);
    expect(plugin.patchWidgetBundle(once)).toBe(once);
    for (const w of ['LiveActivityWidget()', 'AnyvoRestingActivityWidget()', 'AnyvoQuickStartWidget()']) {
      expect(once.split(w).length - 1).toBe(1);
    }
    expect(() => plugin.patchWidgetBundle('struct X {}')).toThrow(/nicht gefunden/);
  });

  it('Plugin-Reihenfolge: Erweiterung VOR expo-live-activity, Prebuild-Guard DANACH', () => {
    const names = JSON.parse(readFileSync('app.json', 'utf8')).expo.plugins.map((p: unknown) => (Array.isArray(p) ? p[0] : p));
    const i = (n: string) => names.indexOf(n);
    expect(i('./plugins/withAnyvoRestingLiveActivity')).toBeGreaterThan(-1);
    expect(i('./plugins/withAnyvoRestingLiveActivity')).toBeLessThan(i('expo-live-activity'));
    expect(i('./plugins/withAnyvoLiveActivityPrebuildGuard')).toBe(i('expo-live-activity') + 1);
  });
});

describe('Dateipfade wie Xcode (Regression EAS-Build beb81dfe: „Build input file cannot be found")', () => {
  const fakeProject = (groupPath?: string) => {
    let n = 0;
    const objects: any = {
      PBXNativeTarget: { T: { name: 'ANYVO', buildPhases: [{ value: 'S' }, { value: 'R' }] } },
      PBXSourcesBuildPhase: { S: { files: [] } },
      PBXResourcesBuildPhase: { R: { files: [] } },
      PBXGroup: { G: { children: [], ...(groupPath ? { path: groupPath } : { name: 'ANYVO' }) } },
      PBXFileReference: {},
      PBXBuildFile: {},
    };
    return { hash: { project: { objects } }, generateUuid: () => `U${++n}` } as any;
  };
  it('App-Gruppe ohne path (Expo-Template: name = ANYVO) → Referenz „ANYVO/<Datei>" wie AppDelegate.swift', () => {
    const p = fakeProject();
    plugin.addFileToTarget(p, { name: 'AnyvoAppIntents.swift', dirName: 'ANYVO', groupKey: 'G', targetKey: 'T', isa: 'PBXSourcesBuildPhase' });
    plugin.addFileToTarget(p, { name: 'Localizable.xcstrings', dirName: 'ANYVO', groupKey: 'G', targetKey: 'T', isa: 'PBXResourcesBuildPhase' });
    const paths = Object.entries(p.hash.project.objects.PBXFileReference).filter(([k]) => !k.endsWith('_comment')).map(([, r]: any) => r.path);
    expect(paths).toEqual(['"ANYVO/AnyvoAppIntents.swift"', '"ANYVO/Localizable.xcstrings"']);
  });
  it('AppShortcuts.strings: EINE Variant-Group (de/fr/it, „ANYVO/<lang>.lproj/…") in Resources, idempotent', () => {
    const p = fakeProject();
    const args = { name: 'AppShortcuts.strings', languages: ['de', 'fr', 'it'], dirName: 'ANYVO', groupKey: 'G', targetKey: 'T' };
    for (let i = 0; i < 2; i++) plugin.addVariantGroupToTarget(p, args);
    const o = p.hash.project.objects;
    const variants = Object.entries(o.PBXVariantGroup).filter(([k]) => !k.endsWith('_comment'));
    expect(variants).toHaveLength(1);
    const [vKey, v]: [string, any] = variants[0] as never;
    expect(v.name).toBe('"AppShortcuts.strings"');
    expect(v.children.map((c: any) => [o.PBXFileReference[c.value].name, o.PBXFileReference[c.value].path, o.PBXFileReference[c.value].lastKnownFileType])).toEqual([
      ['de', '"ANYVO/de.lproj/AppShortcuts.strings"', 'text.plist.strings'],
      ['fr', '"ANYVO/fr.lproj/AppShortcuts.strings"', 'text.plist.strings'],
      ['it', '"ANYVO/it.lproj/AppShortcuts.strings"', 'text.plist.strings'],
    ]);
    expect(o.PBXGroup.G.children.map((c: any) => c.value)).toEqual([vKey]);
    expect(o.PBXResourcesBuildPhase.R.files.map((f: any) => o.PBXBuildFile[f.value].fileRef)).toEqual([vKey]);
    expect(o.PBXSourcesBuildPhase.S.files).toHaveLength(0);
  });
  it('Gruppe mit eigenem path (Widget: path = LiveActivity) → Referenz nur „<Datei>"', () => {
    expect(plugin.fileRefPath({ path: 'LiveActivity' }, 'LiveActivity', 'AnyvoQuickStartWidget.swift')).toBe('AnyvoQuickStartWidget.swift');
    expect(plugin.fileRefPath({ name: 'ANYVO' }, 'ANYVO', 'AnyvoAppIntents.swift')).toBe('ANYVO/AnyvoAppIntents.swift');
  });
  it('idempotent: zweiter Aufruf erzeugt weder Referenz noch Build-Datei doppelt', () => {
    const p = fakeProject();
    for (let i = 0; i < 2; i++) plugin.addFileToTarget(p, { name: 'AnyvoAppIntents.swift', dirName: 'ANYVO', groupKey: 'G', targetKey: 'T', isa: 'PBXSourcesBuildPhase' });
    expect(p.hash.project.objects.PBXSourcesBuildPhase.S.files).toHaveLength(1);
    expect(p.hash.project.objects.PBXGroup.G.children).toHaveLength(1);
  });
});

describe('Prebuild-Guard (wiederholter Prebuild ohne --clean)', () => {
  const project = (targets: string[]) => ({
    hash: { project: { objects: { PBXNativeTarget: Object.fromEntries(targets.map((n, i) => [`T${i}`, { name: n }])) } } },
  });
  it('Target existiert → Snapshot; erneutes Anlegen durch das Paket wird verworfen', () => {
    const p: any = project(['ANYVO', 'LiveActivity']);
    plugin.snapshotIfTargetExists(p);
    p.hash.project.objects.PBXNativeTarget.T9 = { name: 'LiveActivity' };   // Paket legt erneut an
    plugin.restoreSnapshotIfAny(p);
    expect(Object.values(p.hash.project.objects.PBXNativeTarget).filter((t: any) => t.name === 'LiveActivity')).toHaveLength(1);
  });
  it('erster (clean) Prebuild: kein Snapshot, Paket-Ergebnis bleibt', () => {
    const p: any = project(['ANYVO']);
    plugin.snapshotIfTargetExists(p);
    p.hash.project.objects.PBXNativeTarget.T9 = { name: 'LiveActivity' };
    plugin.restoreSnapshotIfAny(p);
    expect(Object.values(p.hash.project.objects.PBXNativeTarget).filter((t: any) => t.name === 'LiveActivity')).toHaveLength(1);
  });
  it('Widget-Versionen folgen der App-Config (auch nach Restore)', () => {
    const objects: any = {
      PBXNativeTarget: { W: { name: 'LiveActivity', buildConfigurationList: 'L' } },
      XCConfigurationList: { L: { buildConfigurations: [{ value: 'D' }, { value: 'R' }] } },
      XCBuildConfiguration: { D: { buildSettings: { MARKETING_VERSION: '"1.0.3"' } }, R: { buildSettings: { CURRENT_PROJECT_VERSION: '"48"' } } },
    };
    plugin.syncWidgetVersions({ hash: { project: { objects } } }, 'W', '1.0.4', '49');
    for (const k of ['D', 'R']) expect(objects.XCBuildConfiguration[k].buildSettings).toMatchObject({ MARKETING_VERSION: '"1.0.4"', CURRENT_PROJECT_VERSION: '"49"' });
  });
});

describe('Schnellstart-Widget (Swift-Vertrag)', () => {
  it('nur systemSmall/systemMedium, statische Timeline (kein Polling)', () => {
    expect(swiftWidget).toMatch(/\.supportedFamilies\(\[\.systemSmall, \.systemMedium\]\)/);
    expect(swiftWidget).toMatch(/policy: \.never/);
    expect(swiftWidget).not.toMatch(/accessory/);
  });
  it('Navigation nur per widgetURL/Link auf die drei Production-Routen', () => {
    const urls = [...swiftWidget.matchAll(/URL\(string: "([^"]+)"\)/g)].map(m => m[1]).sort();
    expect(urls).toEqual(['anyvo://track', 'anyvo://track/historie', 'anyvo://track/legen']);
    expect(swiftWidget).toMatch(/\.widgetURL\(AnyvoQuickStartDestination\.layTrack\)/);
    expect((swiftWidget.match(/Link\(destination:/g) ?? []).length).toBe(1);   // eine Link-Komponente, 3× verwendet
    expect(code(swiftWidget)).not.toMatch(/AppIntent|Button\(intent|import AppIntents/);
  });
  it('keine Business-Logik/Daten: kein Netzwerk, keine App Group, kein Storage, kein Internal', () => {
    expect(code(swiftWidget)).not.toMatch(/URLSession|suiteName|UserDefaults|FileManager|group\.|supabase|anyvo-internal|CLLocation/i);
  });
  it('alle Text-Keys im Widget-Katalog für de/en/fr/it', () => {
    const keys = [...new Set([...swiftWidget.matchAll(/"(qs\.[a-zA-Z]+)"/g)].map(m => m[1]))];
    const cat = catalog('plugins/ios/widget/Localizable.xcstrings');
    expect(keys.sort()).toEqual(['qs.brand', 'qs.description', 'qs.displayName', 'qs.layTrack', 'qs.logbook', 'qs.tracks']);
    for (const k of keys) expect(Object.keys(cat[k].localizations).sort()).toEqual(['de', 'en', 'fr', 'it']);
  });
});

describe('App Intents / App Shortcuts (Swift-Vertrag)', () => {
  it('drei Intents, iOS 26: supportedModes .foreground(.immediate); openAppWhenRun nur als Fallback', () => {
    const intents = [...swiftIntents.matchAll(/struct (\w+): AppIntent/g)].map(m => m[1]).sort();
    expect(intents).toEqual(['AnyvoLayTrackIntent', 'AnyvoOpenLogbookIntent', 'AnyvoOpenTracksIntent']);
    for (const i of intents) {
      expect(swiftIntents).toMatch(new RegExp(`@available\\(iOS 26\\.0, \\*\\)\\nextension ${i} \\{\\n  static var supportedModes: IntentModes \\{ \\.foreground\\(\\.immediate\\) \\}`));
    }
    expect(swiftIntents).toMatch(/@available\(iOS 16\.0, \*\)\nstruct AnyvoAppShortcuts: AppShortcutsProvider/);
  });
  it('Navigation nur über den festen Übergabe-Slot — kein UIApplication.open, kein OpenURLIntent, keine App Group/kein Netzwerk', () => {
    expect(code(swiftIntents)).not.toMatch(/UIApplication|OpenURLIntent|openURL|suiteName|URLSession|import UIKit|anyvo:\/\/|anyvo-internal/);
    expect(swiftIntents).toMatch(/UserDefaults\.standard\.set\(/);
    expect(code(swiftIntents)).not.toMatch(/dogId|sessionId|beginRecording|startRecording/);
  });
  it('jede Phrase enthält den App-Namen und ist in <lang>.lproj/AppShortcuts.strings für de/fr/it übersetzt', () => {
    const phrases = [...swiftIntents.matchAll(/"([^"]*\\\(\.applicationName\)[^"]*)"/g)].map(m => m[1].replace('\\(.applicationName)', '${applicationName}'));
    expect(phrases).toHaveLength(6);
    for (const lng of ['de', 'fr', 'it']) {
      const t = stringsFile(`plugins/ios/app/${lng}.lproj/AppShortcuts.strings`);
      expect(Object.keys(t).sort()).toEqual([...phrases].sort());   // keine fehlenden, keine verwaisten Phrasen
      for (const p of phrases) expect(t[p].split('${applicationName}').length - 1).toBe(1);
    }
  });
  it('kein AppShortcuts.xcstrings (erst ab iOS 17; App-Deployment-Target 15.1 → Build-Fehler)', () => {
    expect(existsSync('plugins/ios/app/AppShortcuts.xcstrings')).toBe(false);
    expect(JSON.stringify([...plugin.APP_RESOURCES, ...plugin.WIDGET_RESOURCES])).not.toMatch(/AppShortcuts\.xcstrings/);
  });
  it('Intent-Titel/Beschreibungen im App-Katalog für de/en/fr/it', () => {
    const keys = [...new Set([...swiftIntents.matchAll(/"(intent\.[a-zA-Z.]+)"/g)].map(m => m[1]))];
    expect(keys).toHaveLength(6);
    const cat = catalog('plugins/ios/app/Localizable.xcstrings');
    for (const k of keys) expect(Object.keys(cat[k].localizations).sort()).toEqual(['de', 'en', 'fr', 'it']);
  });
});
