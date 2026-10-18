import { readFileSync } from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runPostInstall } = require('../eas-build-post-install.cjs') as {
  runPostInstall: (env: Record<string, string | undefined>, run: (file: string, args: string[], options: unknown) => void) => string | null;
};
const commit = '1234567890abcdef1234567890abcdef12345678';
const android = { EAS_BUILD: 'true', EAS_BUILD_PLATFORM: 'android', EAS_BUILD_GIT_COMMIT_HASH: commit };

it('keeps the existing TaskManager safety check before any source stamping', () => {
  const run = jest.fn();
  expect(runPostInstall(android, run)).toBe(commit);
  expect(run.mock.calls[0].slice(0, 2)).toEqual([process.execPath, [path.join(__dirname, '..', 'patch-expo-task-manager.cjs'), '--check']]);
  expect(run.mock.calls[1].slice(0, 2)).toEqual(['set-env', ['EXPO_PUBLIC_RELEASE_GIT_COMMIT', commit]]);
});
it('binds the job source instead of a stale shared public variable', () => {
  const run = jest.fn();
  runPostInstall({ ...android, EXPO_PUBLIC_RELEASE_GIT_COMMIT: 'f'.repeat(40) }, run);
  expect(run.mock.calls[1][1]).toEqual(['EXPO_PUBLIC_RELEASE_GIT_COMMIT', commit]);
});
it.each([{}, { ...android, EAS_BUILD: 'false' }, { ...android, EAS_BUILD_PLATFORM: 'ios' }])('does not stamp a local or iOS job', env => {
  const run = jest.fn(); expect(runPostInstall(env, run)).toBeNull(); expect(run).toHaveBeenCalledTimes(1);
});
it.each([undefined, '', 'x'.repeat(40), 'a'.repeat(39), 'A'.repeat(40)])('refuses an untraceable Android source %s', value => {
  const run = jest.fn(); expect(() => runPostInstall({ ...android, EAS_BUILD_GIT_COMMIT_HASH: value }, run)).toThrow('source commit');
  expect(run).toHaveBeenCalledTimes(1);
});
it('refuses an unknown cloud platform', () => {
  const run = jest.fn(); expect(() => runPostInstall({ ...android, EAS_BUILD_PLATFORM: '' }, run)).toThrow('platform');
  expect(run).toHaveBeenCalledTimes(1);
});
it('stops when the native callback check fails', () => {
  const run = jest.fn(() => { throw new Error('native check failed'); });
  expect(() => runPostInstall(android, run)).toThrow('native check failed'); expect(run).toHaveBeenCalledTimes(1);
});
it('fails the build when source stamping cannot persist', () => {
  const run = jest.fn().mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('set-env failed'); });
  expect(() => runPostInstall(android, run)).toThrow('set-env failed');
});
it('is connected to the real EAS post-install lifecycle', () => {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  expect(pkg.scripts['eas-build-post-install']).toBe('node scripts/eas-build-post-install.cjs');
});
