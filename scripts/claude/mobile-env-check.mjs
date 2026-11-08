#!/usr/bin/env node
// ANYVO Mobile-Testumgebung prüfen (lesend). Startet keine Simulatoren/Emulatoren,
// installiert nichts, baut nichts. Zeigt, welche iOS-/Android-Testwege lokal
// tatsächlich verfügbar sind und was fehlt.
//   node scripts/claude/mobile-env-check.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
  return r.status === 0 ? (r.stdout || '').trim() : null;
};
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
const adb = [join(sdk, 'platform-tools/adb'), 'adb'].find((p) => p === 'adb' ? run('which', ['adb']) : existsSync(p));
const emulator = existsSync(join(sdk, 'emulator/emulator')) ? join(sdk, 'emulator/emulator') : null;
const avdDir = join(homedir(), '.android/avd');

const rows = [];
const add = (area, item, ok, detail) => rows.push({ area, item, ok, detail });

const xcodePath = run('xcode-select', ['-p']);
const xcodebuild = run('xcodebuild', ['-version']);
add('iOS', 'Xcode', !!xcodebuild, xcodebuild ? xcodebuild.split('\n')[0] : `fehlt (xcode-select: ${xcodePath || '?'}) — Xcode installieren und \`sudo xcode-select -s /Applications/Xcode.app\``);
const simctl = run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
let sims = [];
try { sims = Object.values(JSON.parse(simctl).devices).flat().filter((d) => /iPhone|iPad/.test(d.name)); } catch { /* kein simctl */ }
add('iOS', 'Simulatoren', sims.length > 0, sims.length ? `${sims.length} verfügbar, gebootet: ${sims.filter((d) => d.state === 'Booted').map((d) => d.name).join(', ') || 'keiner'}` : 'nicht verfügbar (benötigt Xcode)');
add('iOS', 'CocoaPods', !!run('pod', ['--version']), run('pod', ['--version']) || 'fehlt');

add('Android', 'SDK', existsSync(sdk), existsSync(sdk) ? sdk : 'nicht gefunden');
add('Android', 'adb', !!adb, adb ? `${adb}${adb.startsWith('/') && !run('which', ['adb']) ? ' (nicht im PATH)' : ''}` : 'fehlt');
const avds = existsSync(avdDir) ? readdirSync(avdDir).filter((f) => f.endsWith('.ini')).map((f) => f.replace(/\.ini$/, '')) : [];
add('Android', 'Emulator/AVDs', !!emulator && avds.length > 0, emulator ? `${avds.length} AVDs: ${avds.join(', ')}` : 'Emulator fehlt');
const devices = adb ? run(adb, ['devices']) : null;
const attached = devices ? devices.split('\n').slice(1).filter((l) => /\tdevice$/.test(l)).length : 0;
add('Android', 'Verbundene Geräte/Emulatoren', attached > 0, `${attached} aktiv`);
add('Android', 'Java (JDK)', !!run('java', ['-version']) || spawnSync('java', ['-version']).status === 0, (spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr || '').split('\n')[0] || 'fehlt');

add('E2E', 'Maestro', !!run('maestro', ['--version']), run('maestro', ['--version']) || 'nicht installiert (optional für UI-Flows)');
add('Expo', 'EAS CLI', !!run('eas', ['--version']), run('eas', ['--version']) || 'fehlt');
add('Expo', 'Dev-Client-Abhängigkeit', existsSync('node_modules/expo-dev-client'), existsSync('node_modules/expo-dev-client') ? 'installiert' : 'nicht in node_modules');

console.log('# ANYVO Mobile-Testumgebung\n');
console.log('| Bereich | Werkzeug | Status | Detail |\n|---|---|---|---|');
for (const r of rows) console.log(`| ${r.area} | ${r.item} | ${r.ok ? 'OK' : 'FEHLT'} | ${r.detail} |`);
const iosReady = rows.find((r) => r.item === 'Xcode').ok && sims.length > 0;
const androidReady = existsSync(sdk) && !!adb && !!emulator && avds.length > 0;
console.log(`\nLokal testbar: iOS-Simulator ${iosReady ? 'ja' : 'NEIN'} · Android-Emulator ${androidReady ? 'ja' : 'NEIN'}`);
console.log('Hinweis: Simulator/Emulator ersetzen keine Geräte- und GPS-Feldprüfung.');
