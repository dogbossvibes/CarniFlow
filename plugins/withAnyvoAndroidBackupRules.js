// ─────────────────────────────────────────────────────────────────────────
// Lokaler Expo-Config-Plugin: Android-Auto-Backup ohne Anmeldeschlüssel
// (Issue #112).
//
// Die Anmeldesitzung liegt verschlüsselt in AsyncStorage, der Schlüssel in
// expo-secure-store (SharedPreferences-Datei «SecureStore», Android Keystore).
// Diese Datei wird hier von Cloud-Backup und Gerätewechsel AUSGESCHLOSSEN.
// Ohne Schlüssel ist eine mitgesicherte verschlüsselte Sitzung wertlos.
//
// Bewusst NICHT die mitgelieferten Regeln von expo-secure-store
// (`configureAndroidBackup: true`): Diese enthalten `<include domain="sharedpref">`
// und schränken die Sicherung damit auf SharedPreferences ein. Datenbanken und
// Dateien (Offline-Einträge, Entwürfe, AsyncStorage) würden dann nicht mehr
// gesichert – das widerspräche dem Kundendatenerhalt. Hier gilt: nur
// ausschliessen, alles andere bleibt wie bisher in der Sicherung.
//
// Wirkt erst mit einem neuen nativen Build (nie per OTA).
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');

const BACKUP_RULES = 'anyvo_backup_rules';
const EXTRACTION_RULES = 'anyvo_data_extraction_rules';

// Android erwartet den Dateinamen; ältere Expo-Doku nennt ihn ohne Endung.
// Beide Formen ausschliessen (ein fehlender Pfad ist unschädlich).
const SECURE_STORE_EXCLUDES = [
  '<exclude domain="sharedpref" path="SecureStore.xml"/>',
  '<exclude domain="sharedpref" path="SecureStore"/>',
];

function backupRulesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- ANYVO: Auto Backup bis Android 11. Nur Ausschlüsse, alles andere bleibt gesichert. -->',
    '<full-backup-content>',
    ...SECURE_STORE_EXCLUDES.map(line => `  ${line}`),
    '</full-backup-content>',
    '',
  ].join('\n');
}

function dataExtractionRulesXml() {
  const block = tag => [`  <${tag}>`, ...SECURE_STORE_EXCLUDES.map(line => `    ${line}`), `  </${tag}>`];
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- ANYVO: Auto Backup ab Android 12. Nur Ausschlüsse, alles andere bleibt gesichert. -->',
    '<data-extraction-rules>',
    ...block('cloud-backup'),
    ...block('device-transfer'),
    '</data-extraction-rules>',
    '',
  ].join('\n');
}

function applyManifest(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  app.$['android:fullBackupContent'] = `@xml/${BACKUP_RULES}`;
  app.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_RULES}`;
  return manifest;
}

module.exports = function withAnyvoAndroidBackupRules(config) {
  config = withAndroidManifest(config, cfg => {
    cfg.modResults = applyManifest(cfg.modResults);
    return cfg;
  });
  config = withDangerousMod(config, ['android', async cfg => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupRulesXml());
    fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), dataExtractionRulesXml());
    return cfg;
  }]);
  return config;
};

module.exports.backupRulesXml = backupRulesXml;
module.exports.dataExtractionRulesXml = dataExtractionRulesXml;
module.exports.applyManifest = applyManifest;
