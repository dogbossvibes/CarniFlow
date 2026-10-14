import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const plugin = jest.requireActual('../withAnyvoRestingLiveActivity');
const plist = jest.requireActual('@expo/plist').default;

it('merges the exact extension once, preserving foreign extensions and entitlements', () => {
  const foreign = { targetName: 'Other', bundleIdentifier: 'com.anyvo.app.Other', entitlements: { unrelated: true } };
  const config = { ios: { bundleIdentifier: 'com.anyvo.app' }, extra: { eas: { build: { experimental: { ios: { appExtensions: [
    foreign, { targetName: 'LiveActivity', bundleIdentifier: 'com.anyvo.app.LiveActivity', entitlements: { other: 'kept', 'com.apple.security.application-groups': ['group.existing'] } },
    { targetName: 'LiveActivity', bundleIdentifier: 'com.anyvo.app.LiveActivity' },
  ] } } } } } };
  plugin.configureWidgetMetadata(config);
  expect(config.extra.eas.build.experimental.ios.appExtensions).toEqual([
    foreign, { targetName: 'LiveActivity', bundleIdentifier: 'com.anyvo.app.LiveActivity', entitlements: { other: 'kept', 'com.apple.security.application-groups': ['group.existing', 'group.com.anyvo.app.widgets'] } },
  ]);
  plugin.configureWidgetMetadata(config);
  expect(config.extra.eas.build.experimental.ios.appExtensions).toHaveLength(2);
  expect(() => plugin.configureWidgetMetadata({ ios: { bundleIdentifier: 'com.anyvo.app' }, extra: { eas: { build: { experimental: { ios: { appExtensions: [{ targetName: 'LiveActivity', bundleIdentifier: 'foreign.identity' }] } } } } } })).toThrow(/identity mismatch/);
});
it('restores previous extension entitlements after the package overwrites the file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anyvo-widget-plugin-'));
  try {
    const cfg = { modRequest: { platformProjectRoot: directory }, [plugin.ENTITLEMENTS_SNAPSHOT]: { original: 'kept', 'com.apple.security.application-groups': ['group.existing'] } };
    plugin.patchWidgetEntitlements(cfg, 'group.com.anyvo.app.widgets');
    const file = join(directory, 'LiveActivity', 'LiveActivity.entitlements');
    const expected = plist.parse(readFileSync(file, 'utf8'));
    expect(expected).toEqual({ original: 'kept', 'com.apple.security.application-groups': ['group.existing', 'group.com.anyvo.app.widgets'] });
    writeFileSync(file, plist.build({})); // Exact expo-live-activity@0.4.2 failure mode.
    plugin.patchWidgetEntitlements(cfg, 'group.com.anyvo.app.widgets');
    expect(plist.parse(readFileSync(file, 'utf8'))).toEqual(expected);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it('registers both new widgets once behind iOS17 availability, preserving existing widgets', () => {
  const source = readFileSync('node_modules/expo-live-activity/ios-files/LiveActivityWidgetBundle.swift', 'utf8');
  const patched = plugin.patchWidgetBundle(source);
  for (const widget of ['LiveActivityWidget()', 'AnyvoRestingActivityWidget()', 'AnyvoQuickStartWidget()', 'AnyvoDailyWidget()', 'AnyvoAppointmentsWidget()']) {
    expect(patched.split(widget)).toHaveLength(2);
  }
  expect(patched).toContain('if #available(iOS 17.0, *)');
  expect(plugin.patchWidgetBundle(patched)).toBe(patched);
});
