// ─────────────────────────────────────────────────────────────────────────
// Lokaler Expo-Config-Plugin (kein Paket) — bereinigt Android-Manifest und
// iOS-Info.plist für saubere Store-Builds. Ändert KEINE Runtime-, GPS- oder
// Fährtenlogik.
//
// ANDROID (withAndroidManifest):
//  1) SYSTEM_ALERT_WINDOW aus dem MAIN-Manifest entfernen (Dev-Client-Toolchain;
//     bleibt via android/app/src/debug erhalten → Dev-Overlay unverändert).
//  2) READ_EXTERNAL_STORAGE auf Android <= 12 begrenzen (maxSdkVersion=32).
//  3) uses-feature `android.hardware.bluetooth_le` auf required=false setzen.
//
// iOS (withInfoPlist):
//  4) `fetch` aus UIBackgroundModes entfernen. expo-task-manager fügt es pauschal
//     hinzu, aber Anyvo registriert KEINEN Background-Fetch-Handler. `location`
//     und `bluetooth-central` bleiben ZWINGEND erhalten (Fährte + externes GPS).
// ─────────────────────────────────────────────────────────────────────────
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const REMOVE_FROM_MAIN = ['android.permission.SYSTEM_ALERT_WINDOW'];

function withAndroidCleanup(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // tools-Namespace sicherstellen (für tools:replace weiter unten).
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // 1) Dev-only Permission aus dem MAIN-Manifest entfernen.
    if (Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (p) => !REMOVE_FROM_MAIN.includes(p.$ && p.$['android:name']),
      );
    }

    // 2) READ_EXTERNAL_STORAGE begrenzen (überschreibt ungebundene Library-Deklarationen).
    for (const p of manifest['uses-permission'] || []) {
      if (p.$ && p.$['android:name'] === 'android.permission.READ_EXTERNAL_STORAGE') {
        p.$['android:maxSdkVersion'] = '32';
        p.$['tools:replace'] = 'android:maxSdkVersion';
      }
    }

    // 3) BLE-Feature nicht erzwingen.
    for (const f of manifest['uses-feature'] || []) {
      if (f.$ && f.$['android:name'] === 'android.hardware.bluetooth_le') {
        f.$['android:required'] = 'false';
      }
    }

    return cfg;
  });
}

function withIosCleanup(config) {
  return withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;

    // 4) Ungenutzten Background-Mode `fetch` entfernen; location + bluetooth-central behalten.
    if (Array.isArray(plist.UIBackgroundModes)) {
      plist.UIBackgroundModes = plist.UIBackgroundModes.filter((m) => m !== 'fetch');
    }

    return cfg;
  });
}

module.exports = function withAnyvoManifestCleanup(config) {
  config = withAndroidCleanup(config);
  config = withIosCleanup(config);
  return config;
};
