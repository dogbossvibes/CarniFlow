/* global __dirname */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

/** Preserve the native callback gate, then stamp only the actual Android build job. */
function runPostInstall(env = process.env, run = execFileSync) {
  run(process.execPath, [path.join(__dirname, 'patch-expo-task-manager.cjs'), '--check'], { stdio: 'inherit' });
  if (env.EAS_BUILD !== 'true' || env.EAS_BUILD_PLATFORM === 'ios') return null;
  if (env.EAS_BUILD_PLATFORM !== 'android') throw new Error('Missing Android build platform');
  const commit = env.EAS_BUILD_GIT_COMMIT_HASH;
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('Missing valid EAS build source commit');
  // EAS documents set-env for subsequent build phases. This never modifies the
  // shared production environment or stores any credentials.
  run('set-env', ['EXPO_PUBLIC_RELEASE_GIT_COMMIT', commit], { stdio: 'inherit' });
  return commit;
}

module.exports = { runPostInstall };
if (require.main === module) {
  try { runPostInstall(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
