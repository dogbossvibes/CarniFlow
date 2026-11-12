/* global __dirname */
// SDK58 has completion cleanup upstream, but not ANYVO's unacknowledged-task expiry.
// Preserve the existing concurrency/expiry protections; no GPS/task thresholds change.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const VERSION = '58.0.13';
const ORIGINAL_SHA256 = '01e0ffa94e55bb55793d3763c040f090f78ba2bbf403e748b1c3462ebecb016d';
const PATCHED_SHA256 = '6f76cfa5ab99f8c4b28163ec623c11d72ff2527570e86d8488e352a6669a4fe8';
const SOURCE_PATH = 'android/src/main/java/expo/modules/taskmanager/TaskService.java';
const sha256 = source => createHash('sha256').update(source).digest('hex');
const changes = [
  ['import android.os.Handler;', 'import android.os.Handler;\nimport android.os.Looper;'],
  ['import java.util.UUID;', 'import java.util.UUID;\nimport java.util.concurrent.ConcurrentHashMap;'],
  ['private static final Map<String, TaskExecutionCallback> sTaskCallbacks = new HashMap<>();',
    'private static final Map<String, TaskExecutionCallback> sTaskCallbacks = new ConcurrentHashMap<>();'],
  ['sTaskCallbacks.put(eventId, callback);', `sTaskCallbacks.put(eventId, callback);
      // Preserve ANYVO callback expiry when the JS task never acknowledges.
      new Handler(Looper.getMainLooper()).postDelayed(
        () -> sTaskCallbacks.remove(eventId), MAX_TASK_EXECUTION_TIME_MS + 5000
      );`],
];
function patchSource(source, version) {
  if (version !== VERSION) throw new Error(`Review expo-task-manager patch for version ${version}`);
  const hash = sha256(source);
  if (hash === PATCHED_SHA256) return { source, changed: false, sha256: hash };
  if (hash !== ORIGINAL_SHA256) throw new Error('Unexpected TaskService source; native lifecycle review required');
  let patched = source;
  for (const [before, after] of changes) {
    if (patched.split(before).length !== 2) throw new Error('TaskService patch site mismatch');
    patched = patched.replace(before, after);
  }
  if (sha256(patched) !== PATCHED_SHA256) throw new Error('TaskService patch verification failed');
  return { source: patched, changed: true, sha256: PATCHED_SHA256 };
}
function patchInstalled(projectRoot = path.resolve(__dirname, '..'), { checkOnly = false } = {}) {
  const packageFile = require.resolve('expo-task-manager/package.json', { paths: [projectRoot] });
  const { version } = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const sourceFile = path.join(path.dirname(packageFile), SOURCE_PATH);
  const result = patchSource(fs.readFileSync(sourceFile, 'utf8'), version);
  if (checkOnly && result.changed) throw new Error('expo-task-manager Android callback patch is missing or incomplete; run postinstall before building');
  if (result.changed) fs.writeFileSync(sourceFile, result.source);
  return result;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/patch-expo-task-manager.cjs [--check]');
  }
  if (args[0] === '--check' && process.env.EAS_BUILD_PLATFORM === 'ios') {
    console.log('Android callback verification skipped for iOS build');
    process.exit(0);
  }
  const result = patchInstalled(undefined, { checkOnly: args[0] === '--check' });
  console.log(`TaskManager ${VERSION}: ${result.changed ? 'patched' : 'verified'}; ${result.sha256}`);
}
module.exports = { VERSION, SOURCE_PATH, ORIGINAL_SHA256, PATCHED_SHA256, changes, sha256, patchSource, patchInstalled };
