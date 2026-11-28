import fs from 'fs';
import os from 'os';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withAnyvoAndroidBackupRules');

describe('withAnyvoAndroidBackupRules', () => {
  it('schliesst nur SecureStore aus und enthält keine Include-Regel (alles andere bleibt gesichert)', () => {
    for (const xml of [plugin.backupRulesXml(), plugin.dataExtractionRulesXml()]) {
      expect(xml).toContain('<exclude domain="sharedpref" path="SecureStore.xml"/>');
      expect(xml).toContain('<exclude domain="sharedpref" path="SecureStore"/>');
      expect(xml).not.toMatch(/<include\b/);
      expect(xml).not.toMatch(/domain="(database|file|root)"/);
    }
    const extraction = plugin.dataExtractionRulesXml();
    expect(extraction).toMatch(/<cloud-backup>[\s\S]*SecureStore[\s\S]*<\/cloud-backup>/);
    expect(extraction).toMatch(/<device-transfer>[\s\S]*SecureStore[\s\S]*<\/device-transfer>/);
  });

  it('setzt beide Manifest-Attribute und lässt allowBackup unverändert', () => {
    const manifest = {
      manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } }] },
    };
    const app = plugin.applyManifest(manifest).manifest.application[0].$;
    expect(app['android:fullBackupContent']).toBe('@xml/anyvo_backup_rules');
    expect(app['android:dataExtractionRules']).toBe('@xml/anyvo_data_extraction_rules');
    expect(app['android:allowBackup']).toBe('true');
  });

  it('schreibt die Regeldateien beim Prebuild nach res/xml', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anyvo-backup-'));
    try {
      const config = plugin({ name: 'ANYVO', slug: 'anyvo' });
      const dangerous = config.mods?.android?.dangerous;
      expect(dangerous).toEqual(expect.any(Function));
      await dangerous({ ...config, modResults: {}, modRequest: { platformProjectRoot: root, platform: 'android' } });
      const dir = path.join(root, 'app', 'src', 'main', 'res', 'xml');
      expect(fs.readFileSync(path.join(dir, 'anyvo_backup_rules.xml'), 'utf8')).toBe(plugin.backupRulesXml());
      expect(fs.readFileSync(path.join(dir, 'anyvo_data_extraction_rules.xml'), 'utf8'))
        .toBe(plugin.dataExtractionRulesXml());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
