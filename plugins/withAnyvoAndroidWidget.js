// Stateless Android homescreen widget, generated reproducibly by Expo CNG.
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const CLASS_NAME = 'AnyvoQuickStartWidgetProvider';
const ASSET_ROOT = path.join(__dirname, 'android', 'quick-start-widget');

function widgetPackage(config) {
  const appId = config.android && config.android.package;
  if (!appId || !/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/.test(appId)) {
    throw new Error('ANYVO Android widget requires a valid android.package');
  }
  return appId;
}

function addReceiver(config) {
  return withAndroidManifest(config, cfg => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const name = `${widgetPackage(cfg)}.widgets.${CLASS_NAME}`;
    app.receiver = app.receiver || [];
    const existing = app.receiver.filter(r => r.$ && r.$['android:name'] === name);
    if (existing.length > 1) throw new Error('Duplicate ANYVO widget receiver');
    const receiver = {
      $: { 'android:name': name, 'android:exported': 'false', 'android:label': '@string/anyvo_widget_name' },
      'intent-filter': [{ action: [
        { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
        { $: { 'android:name': 'android.intent.action.LOCALE_CHANGED' } },
      ] }],
      'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/anyvo_quick_start_widget' } }],
    };
    if (existing.length) app.receiver[app.receiver.indexOf(existing[0])] = receiver;
    else app.receiver.push(receiver);
    return cfg;
  });
}

function copyResources(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyResources(path.join(from, entry.name), target);
    else fs.copyFileSync(path.join(from, entry.name), target);
  }
}

function writeSources(projectRoot, appId) {
  const main = path.join(projectRoot, 'android', 'app', 'src', 'main');
  const javaDir = path.join(main, 'java', ...appId.split('.'), 'widgets');
  fs.mkdirSync(javaDir, { recursive: true });
  const source = fs.readFileSync(path.join(ASSET_ROOT, `${CLASS_NAME}.java`), 'utf8');
  fs.writeFileSync(path.join(javaDir, `${CLASS_NAME}.java`), source.replaceAll('__APPLICATION_ID__', appId));
  copyResources(path.join(ASSET_ROOT, 'res'), path.join(main, 'res'));
}

module.exports = config => {
  widgetPackage(config);
  config = addReceiver(config);
  return withDangerousMod(config, ['android', cfg => {
    writeSources(cfg.modRequest.projectRoot, widgetPackage(cfg));
    return cfg;
  }]);
};
module.exports.writeSources = writeSources;
