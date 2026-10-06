// Expo SDK 54 ships expo-task-manager 14.0.9 with Android task callbacks that
// remain retained after completion or when the JS task does not finish in time.
// Apply the fixes on every install, including EAS Build.
const fs = require('node:fs');
const path = require('node:path');

const packageFile = require.resolve('expo-task-manager/package.json');
const { version } = require(packageFile);
if (version !== '14.0.9') {
  throw new Error(`Review expo-task-manager patch for version ${version}`);
}

const sourceFile = path.join(
  path.dirname(packageFile),
  'android/src/main/java/expo/modules/taskManager/TaskService.java',
);
let source = fs.readFileSync(sourceFile, 'utf8');
let changed = false;
function patchOnce(before, after, label) {
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) {
    throw new Error(`Expected expo-task-manager ${label} site not found exactly once`);
  }
  source = source.replace(before, after);
  changed = true;
}

patchOnce('import android.os.Handler;', 'import android.os.Handler;\nimport android.os.Looper;', 'main looper import');
patchOnce('import java.util.UUID;', 'import java.util.UUID;\nimport java.util.concurrent.ConcurrentHashMap;', 'concurrent map import');
patchOnce(
  'private static final Map<String, TaskExecutionCallback> sTaskCallbacks = new HashMap<>();',
  'private static final Map<String, TaskExecutionCallback> sTaskCallbacks = new ConcurrentHashMap<>();',
  'callback map',
);
patchOnce(
  'TaskExecutionCallback taskCallback = sTaskCallbacks.get(eventId);',
  'TaskExecutionCallback taskCallback = sTaskCallbacks.remove(eventId);',
  'completion cleanup',
);
patchOnce(
  'sTaskCallbacks.put(eventId, callback);',
  `sTaskCallbacks.put(eventId, callback);
      // A headless JS task can be throttled or never acknowledge its event.
      // Android already finishes the job after 15 seconds; release the native
      // callback after that deadline so GPS jobs cannot fill the Java heap.
      new Handler(Looper.getMainLooper()).postDelayed(
        () -> sTaskCallbacks.remove(eventId), MAX_TASK_EXECUTION_TIME_MS + 5000
      );`,
  'expired callback cleanup',
);

if (changed) {
  fs.writeFileSync(sourceFile, source);
  console.log('Patched expo-task-manager Android callback lifecycle');
} else {
  console.log('expo-task-manager Android callback lifecycle already patched');
}
