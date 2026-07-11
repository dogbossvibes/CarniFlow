// ─────────────────────────────────────────────────────────────────────────
// Lokaler Expo-Config-Plugin (kein Paket) — bereinigt ausschliesslich das
// Android-MAIN-Manifest für saubere Production-Builds. Ändert KEINE Runtime-,
// GPS- oder Fährtenlogik.
//
//  1) SYSTEM_ALERT_WINDOW aus dem MAIN-Manifest entfernen.
//     Grund: kommt aus dem expo-dev-client-Toolchain und würde sonst in die
//     Production-AAB gelangen. Die Dev-Overlay-Berechtigung bleibt über das
//     separate `android/app/src/debug/AndroidManifest.xml`-Sourceset erhalten
//     (nur Debug-Builds) → Dev-Menu/Overlay funktioniert unverändert.
//
//  2) READ_EXTERNAL_STORAGE auf Android <= 12 begrenzen (maxSdkVersion=32).
//     Auf Android 13+ (targetSdk 36) wird stattdessen READ_MEDIA_* verwendet.
//
//  3) uses-feature `android.hardware.bluetooth_le` auf required=false setzen.
//     Externes BLE-GPS ist optional → App bleibt auf Geräten ohne BLE
//     installierbar (react-native-ble-plx erzwingt sonst required=true).
// ─────────────────────────────────────────────────────────────────────────
const { withAndroidManifest } = require('@expo/config-plugins');

const REMOVE_FROM_MAIN = ['android.permission.SYSTEM_ALERT_WINDOW'];

module.exports = function withAnyvoManifestCleanup(config) {
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
};
