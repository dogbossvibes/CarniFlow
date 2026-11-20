#!/usr/bin/env node
// ANYVO UI-Tests mit Maestro (lokal, nur gegen Staging). Anleitung: docs/agent/MAESTRO.md
//   npm run test:e2e -- --platform ios|android [--device <id>] [Ablauf.yaml …] [Maestro-Optionen]
// Startet weder Metro noch einen Build, meldet niemanden an und liest keine .env-Dateien.
// Exit: Maestro-Exitcode (0 = alle Abläufe bestanden), 2 = Werkzeug-/Aufruffehler.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.error(`[e2e] ${msg}`); process.exit(2); };
const capture = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });

function findMaestro() {
  if (capture('maestro', ['--version']).status === 0) return 'maestro';
  const local = join(homedir(), '.maestro', 'bin', 'maestro');
  if (existsSync(local)) return local;
  return fail('Maestro-CLI nicht gefunden (weder im PATH noch unter ~/.maestro/bin). Siehe docs/agent/MAESTRO.md.');
}

function findAdb() {
  if (capture('adb', ['version']).status === 0) return 'adb';
  const sdk = process.env.ANDROID_HOME ?? join(homedir(), 'Library', 'Android', 'sdk');
  const local = join(sdk, 'platform-tools', 'adb');
  return existsSync(local) ? local : null;
}

function androidDevice() {
  const adb = findAdb();
  if (!adb) return fail('adb nicht gefunden (ANDROID_HOME setzen oder platform-tools in den PATH aufnehmen).');
  const lines = (capture(adb, ['devices']).stdout ?? '').split('\n').slice(1);
  const id = lines.map(l => l.trim().split(/\s+/)).find(p => p[1] === 'device')?.[0];
  return id ?? fail('Kein laufender Android-Emulator gefunden. Emulator starten und App öffnen.');
}

function iosDevice() {
  const out = capture('xcrun', ['simctl', 'list', 'devices', 'booted', '--json']).stdout;
  let booted = [];
  try { booted = Object.values(JSON.parse(out).devices).flat().filter(d => d.state === 'Booted'); } catch { /* unten gemeldet */ }
  // Mehrere gestartete Simulatoren: nicht raten (der erste ist oft der falsche).
  if (booted.length > 1) {
    return fail(`Mehrere iOS-Simulatoren gestartet – bitte einen mit --device <UDID> wählen:\n${
      booted.map(d => `  ${d.udid}  ${d.name}`).join('\n')}`);
  }
  return booted[0]?.udid ?? fail('Kein gestarteter iOS-Simulator gefunden. Simulator starten und App öffnen.');
}

const args = process.argv.slice(2);
const take = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  if (!value) fail(`${flag} braucht einen Wert.`);
  return value;
};
const platform = take('--platform');
let device = take('--device');
if (!device) {
  if (platform === 'android') device = androidDevice();
  else if (platform === 'ios') device = iosDevice();
  else fail('Bitte --platform ios|android (oder --device <id>) angeben.');
}

// Testdatei für den Dokument-Upload (Ablauf 19) aufs Gerät legen. Enthält keine Personendaten.
const FIXTURE = join(ROOT, '.maestro', 'fixtures', 'e2e-maestro-testdokument.pdf');
function pushFixture() {
  if (!existsSync(FIXTURE)) return;
  if (platform === 'android') {
    const adb = findAdb();
    capture(adb, ['-s', device, 'push', FIXTURE, '/sdcard/Download/']);
    capture(adb, ['-s', device, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
      '-d', 'file:///sdcard/Download/e2e-maestro-testdokument.pdf']);
  } else if (platform === 'ios') {
    // «Auf meinem iPhone» der Dateien-App des Simulators.
    const groups = join(homedir(), 'Library', 'Developer', 'CoreSimulator', 'Devices', device, 'data', 'Containers', 'Shared', 'AppGroup');
    const meta = '.com.apple.mobile_container_manager.metadata.plist';
    const found = (existsSync(groups) ? readdirSync(groups) : []).map(g => join(groups, g)).find(g =>
      capture('plutil', ['-extract', 'MCMMetadataIdentifier', 'raw', join(g, meta)]).stdout?.trim() === 'group.com.apple.FileProvider.LocalStorage');
    if (!found) { console.warn('[e2e] Dateien-Ablage des Simulators nicht gefunden – Ablauf 19 findet die Testdatei nicht.'); return; }
    const target = join(found, 'File Provider Storage');
    mkdirSync(target, { recursive: true });
    copyFileSync(FIXTURE, join(target, 'e2e-maestro-testdokument.pdf'));
  }
}
pushFixture();

const hasTarget = args.some(a => !a.startsWith('-') && /\.ya?ml$|\.maestro/.test(a));
const out = join(ROOT, '.maestro', '.output', platform ?? 'device');
const maestroArgs = [
  '--device', device, 'test',
  '--debug-output', out, '--flatten-debug-output',
  ...args,
  ...(hasTarget ? [] : [join(ROOT, '.maestro')]),
];

console.log(`[e2e] Gerät: ${device} · Ausgabe: ${out}`);
console.log('[e2e] Voraussetzung: Metro läuft gegen STAGING, die App ist mit dem Staging-Testkonto angemeldet.');
const adb = findAdb();
const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' };
if (adb && adb !== 'adb') env.PATH = `${dirname(adb)}:${env.PATH}`;
const run = spawnSync(findMaestro(), maestroArgs, { stdio: 'inherit', cwd: ROOT, env });
process.exit(run.status ?? 2);
