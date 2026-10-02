import { buildOtaIdentity, formatAppVersion, formatGitCommit, EMPTY } from '../buildOtaIdentity';

const UUID = '01a0fdbb-1111-4222-8333-9999999aaec1';
const SHA = '1f791707dd838983a324f72d32c61f786bbbf642';

describe('buildOtaIdentity', () => {
  it('OTA aktiv: Update-ID, Channel, Runtime, Erstellzeit', () => {
    const id = buildOtaIdentity({
      nativeApplicationVersion: '1.0.3',
      nativeBuildVersion: '48',
      releaseGitCommit: SHA,
      running: {
        updateId: UUID, channel: 'production', runtimeVersion: '1.0.3',
        isEmbeddedLaunch: false, isEmergencyLaunch: false, emergencyLaunchReason: null,
        createdAt: new Date(2026, 9, 2, 19, 5),
      },
    });
    expect(id.status).toBe('ota');
    expect(id.statusLabel).toBe('OTA aktiv');
    expect(id.source).toBe('OTA Update');
    expect(id.app).toBe('1.0.3 (48)');
    expect(id.runtime).toBe('1.0.3');
    expect(id.channel).toBe('production');
    expect(id.otaUpdate).toBe('01a0fdbb…aec1');
    expect(id.otaUpdateFull).toBe(UUID);
    expect(id.gitCommit).toBe('1f791707…');
    expect(id.published).toMatch(/02\.10\.2026/);
    expect(id.published).toMatch(/19[:.]05/);
    expect(id.emergency).toBe('Nein');
  });

  it('Embedded: keine irreführende OTA-Aussage, auch wenn eine ID existiert', () => {
    const id = buildOtaIdentity({
      running: { updateId: UUID, isEmbeddedLaunch: true, isEmergencyLaunch: false },
    });
    expect(id.status).toBe('embedded');
    expect(id.statusLabel).toBe('Embedded');
    expect(id.source).toBe('Im Build eingebettet');
    expect(id.otaUpdate).toBe('Embedded / keine OTA-ID');
    expect(id.otaUpdateFull).toBeNull();
  });

  it('fehlende optionale Werte: kein Crash, Fallback „—"', () => {
    const id = buildOtaIdentity({ running: { isEmbeddedLaunch: false } });
    expect(id.app).toBe(EMPTY);
    expect(id.runtime).toBe(EMPTY);
    expect(id.channel).toBe(EMPTY);
    expect(id.published).toBe(EMPTY);
    expect(id.gitCommit).toBe(EMPTY);
    expect(id.otaUpdateFull).toBeNull();
    expect(id.emergency).toBe('Nein');
  });

  it('Emergency Launch: sichtbar, mit Grund aus der öffentlichen API', () => {
    const id = buildOtaIdentity({
      running: { isEmbeddedLaunch: true, isEmergencyLaunch: true, emergencyLaunchReason: 'Init failed' },
    });
    expect(id.status).toBe('emergency');
    expect(id.statusLabel).toBe('Emergency Fallback');
    expect(id.emergency).toBe('Ja · Init failed');
    expect(buildOtaIdentity({ running: { isEmbeddedLaunch: true, isEmergencyLaunch: true } }).emergency).toBe('Ja');
  });

  it('ungültiges createdAt wirft nicht', () => {
    expect(buildOtaIdentity({ running: { isEmbeddedLaunch: false, createdAt: new Date('x') } }).published).toBe(EMPTY);
  });
});

describe('formatAppVersion', () => {
  it('Version + Build', () => expect(formatAppVersion('1.0.3', '48')).toBe('1.0.3 (48)'));
  it('nur Version', () => expect(formatAppVersion('1.0.3', null)).toBe('1.0.3'));
  it('nur Build', () => expect(formatAppVersion(undefined, '48')).toBe('(48)'));
  it('nichts', () => expect(formatAppVersion(null, '')).toBe(EMPTY));
});

describe('formatGitCommit', () => {
  it('kürzt gültige SHA', () => expect(formatGitCommit(SHA)).toBe('1f791707…'));
  it('Fallback bei leer/ungültig', () => {
    expect(formatGitCommit(undefined)).toBe(EMPTY);
    expect(formatGitCommit('')).toBe(EMPTY);
    expect(formatGitCommit('(unbekannt)')).toBe(EMPTY);
  });
});
