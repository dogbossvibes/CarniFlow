// Ebene 3 – App: was ohne Gerät prüfbar ist. Erkennt Simulator-/Emulator-
// Werkzeuge (installiert nichts) und kann optional einen Expo-Web-Export als
// Bundling-Smoke-Test ausführen. Kein EAS-Build, keine OTA, kein Netzwerk-Backend.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, safeEnv, writeFile, log } from './lib.mjs';

function probe(cmd, args) {
  const r = run(cmd, args, { timeoutMs: 20000, env: process.env });
  return { ok: r.code === 0, out: (r.stdout || r.stderr).trim().split('\n')[0] ?? '' };
}

function webExportRun(dir, out, name) {
  const dist = join(dir, '.verify-web-dist');
  const r = run(join(dir, 'node_modules', '.bin', 'expo'), ['export', '--platform', 'web', '--output-dir', dist],
    { cwd: dir, timeoutMs: 20 * 60 * 1000, env: safeEnv() });
  writeFile(join(out, 'evidence', `${name}.log`), (r.stdout + r.stderr).slice(-400000));
  return { exitCode: r.code, ms: r.ms, evidence: `evidence/${name}.log`,
    error: r.code === 0 ? undefined : ((r.stdout + r.stderr).match(/(Error|error):.*$/m) ?? [null])[0] };
}

export async function runAppLayer({ headDir, baseDir = null, out, webExport = false }) {
  const res = { layer: 'app', tools: {}, checks: {}, notes: [] };
  const xs = probe('xcode-select', ['-p']);
  res.tools.xcodeSelect = xs.out;
  res.tools.fullXcode = xs.ok && /Xcode.*\.app/.test(xs.out);
  res.tools.simctl = probe('xcrun', ['simctl', 'help']).ok;
  res.tools.xcodebuild = probe('xcodebuild', ['-version']).ok;
  res.tools.adb = probe('adb', ['version']).ok;
  res.tools.emulator = probe('emulator', ['-version']).ok;
  res.tools.reactNativeWeb = Boolean(headDir && existsSync(join(headDir, 'node_modules', 'react-native-web', 'package.json')));

  if (webExport && headDir) {
    log('App: expo export --platform web (Bundling-Smoke, ohne Backend-Variablen)');
    const h = webExportRun(headDir, out, 'app-web-export');
    res.checks.webExport = { ...h, verdict: h.exitCode === 0 ? 'PASS' : 'FAIL' };
    if (h.exitCode !== 0 && baseDir) {
      log('App: Web-Export scheitert – Gegenprobe auf der Basis');
      const b = webExportRun(baseDir, out, 'app-web-export-base');
      if (b.exitCode !== 0) {
        // Vorbestehend: Web-Bundling ist für dieses Projekt (noch) nicht möglich – kein Fehler der Änderung.
        res.checks.webExport = { ...h, verdict: 'UNSUPPORTED', reason: `Auch auf der Basis nicht exportierbar: ${b.error ?? 'Fehler'}` };
      }
    }
  } else {
    res.checks.webExport = { verdict: 'SKIP', reason: webExport ? 'kein Snapshot' : 'nicht angefordert (--app-web-export)' };
  }
  res.checks.simulator = res.tools.simctl
    ? { verdict: 'AVAILABLE', reason: 'iOS Simulator vorhanden – Development-Build lokal bauen und mit dem Simulator-Werkzeug prüfen (siehe docs/agent/VERIFY_CENTER.md).' }
    : { verdict: 'SKIP', reason: 'Kein Xcode/simctl (nur Command Line Tools). Nichts installiert.' };
  res.checks.device = { verdict: 'MANUAL', reason: 'Geräteabnahme bleibt manuell (Testweg laut Release-Karte).' };
  // Die App-Ebene ist nur dann FAIL, wenn ein tatsächlich ausgeführter Check scheitert.
  res.verdict = res.checks.webExport.verdict === 'FAIL' ? 'FAIL' : (res.checks.webExport.verdict === 'PASS' ? 'PASS' : 'SKIP');
  res.notes.push('SKIP heisst: keine Aussage zur App-Oberfläche möglich – nicht „geprüft“.');
  return res;
}
