import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withAnyvoAndroidWidget');

it.each([undefined, '../escape', 'com.app;bad'])('rejects invalid application ID %s', appId => {
  expect(() => plugin({ name: 'ANYVO', slug: 'anyvo', android: { package: appId } })).toThrow(/valid android.package/);
});

it('adds exactly one private widget receiver, preserving unrelated receivers and permissions', async () => {
  const cfg = plugin({ name: 'ANYVO', slug: 'anyvo', android: { package: 'com.anyvo.app' } });
  const application = { $: { 'android:name': '.MainApplication' }, receiver: [{ $: { 'android:name': 'OtherReceiver' } }] };
  const manifest = { manifest: { application: [application],
    'uses-permission': [{ $: { 'android:name': 'android.permission.ACCESS_BACKGROUND_LOCATION' } }],
  } };
  const input = { ...cfg, modResults: manifest,
    modRequest: { platform: 'android', modName: 'manifest', projectRoot: process.cwd() },
  };
  await cfg.mods.android.manifest(input);
  const first = JSON.stringify(manifest);
  await cfg.mods.android.manifest(input);
  expect(JSON.stringify(manifest)).toBe(first);
  expect(application.receiver).toHaveLength(2);
  expect(application.receiver[1]).toMatchObject({
    $: { 'android:name': 'com.anyvo.app.widgets.AnyvoQuickStartWidgetProvider', 'android:exported': 'false' },
    'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/anyvo_quick_start_widget' } }],
  });
  expect(manifest.manifest['uses-permission']).toHaveLength(1);
});

it('generates variant-aware Java and resources reproducibly without replacing unrelated resources', () => {
  const root = mkdtempSync(join(tmpdir(), 'anyvo-widget-plugin-'));
  try {
    const res = join(root, 'android/app/src/main/res');
    mkdirSync(join(res, 'values'), { recursive: true });
    writeFileSync(join(res, 'values/unrelated.xml'), '<resources/>');
    plugin.writeSources(root, 'com.anyvo.preview');
    const java = join(root, 'android/app/src/main/java/com/anyvo/preview/widgets/AnyvoQuickStartWidgetProvider.java');
    const first = readFileSync(java, 'utf8');
    plugin.writeSources(root, 'com.anyvo.preview');
    expect(readFileSync(java, 'utf8')).toBe(first);
    expect(first).toContain('package com.anyvo.preview.widgets;');
    expect(first).toContain('import com.anyvo.preview.R;');
    expect(first).not.toContain('__APPLICATION_ID__');
    expect(readFileSync(join(res, 'values/unrelated.xml'), 'utf8')).toBe('<resources/>');
    expect(readdirSync(res)).toEqual(expect.arrayContaining(['layout', 'xml', 'drawable', 'values', 'values-de', 'values-fr', 'values-it']));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('uses the same three existing navigation destinations as iOS', () => {
  const java = readFileSync('plugins/android/quick-start-widget/AnyvoQuickStartWidgetProvider.java', 'utf8');
  const swift = readFileSync('plugins/ios/widget/AnyvoQuickStartWidget.swift', 'utf8');
  const routes = (s: string) => [...s.matchAll(/"(anyvo:\/\/[^"\s]+)"/g)].map(m => m[1]).sort();
  expect(routes(java)).toEqual(routes(swift));
  for (const file of ['app/track/index.tsx', 'app/track/legen.tsx', 'app/track/historie.tsx']) {
    expect(readFileSync(file, 'utf8').length).toBeGreaterThan(0);
  }
});
