// Run the installed BLE plugin and our cleanup through Expo's real mod chain.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cleanup = require('../withAnyvoManifestCleanup');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withBLEAndroidManifest } = require('react-native-ble-plx/plugin/build/withBLEAndroidManifest');

const bleName = 'android.hardware.bluetooth_le';
const initial = () => ({ manifest: {
  $: {},
  'uses-permission': [
    { $: { 'android:name': 'android.permission.SYSTEM_ALERT_WINDOW' } },
    { $: { 'android:name': 'android.permission.READ_EXTERNAL_STORAGE' } },
    { $: { 'android:name': 'android.permission.ACCESS_BACKGROUND_LOCATION' } },
    { $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_LOCATION' } },
  ],
} });

it.each([true, false])('keeps BLE optional with cleanup registered last=%s', async cleanupLast => {
  const base = { name: 'ANYVO', slug: 'anyvo' };
  const ble = (c: typeof base) => withBLEAndroidManifest(c, { isBackgroundEnabled: true });
  const composed = cleanupLast ? cleanup(ble(base)) : ble(cleanup(base));
  const result = await composed.mods.android.manifest({
    ...composed, modResults: initial(),
    modRequest: { platform: 'android', modName: 'manifest', projectRoot: process.cwd() },
  });
  const manifest = result.modResults.manifest;
  expect(manifest['uses-feature'].filter((f: { $: Record<string, string> }) => f.$['android:name'] === bleName))
    .toEqual([{ $: { 'android:name': bleName, 'android:required': 'false' } }]);
  const permissions = manifest['uses-permission'].map((p: { $: Record<string, string> }) => p.$['android:name']);
  expect(permissions).not.toContain('android.permission.SYSTEM_ALERT_WINDOW');
  expect(permissions).toEqual(expect.arrayContaining([
    'android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.BLUETOOTH_SCAN',
  ]));
  expect(manifest['uses-permission'].find((p: { $: Record<string, string> }) => p.$['android:name'] === 'android.permission.READ_EXTERNAL_STORAGE').$)
    .toMatchObject({ 'android:maxSdkVersion': '32' });
});

it('corrects an existing required BLE feature and remains idempotent', async () => {
  const cfg = cleanup({ name: 'ANYVO', slug: 'anyvo' });
  const data = { ...initial(), manifest: { ...initial().manifest,
    'uses-feature': [{ $: { 'android:name': bleName, 'android:required': 'true' } }],
  } };
  const input = { ...cfg, modResults: data,
    modRequest: { platform: 'android', modName: 'manifest', projectRoot: process.cwd() },
  };
  await cfg.mods.android.manifest(input);
  await cfg.mods.android.manifest(input);
  expect(data.manifest['uses-feature']).toEqual([{ $: { 'android:name': bleName, 'android:required': 'false' } }]);
});
