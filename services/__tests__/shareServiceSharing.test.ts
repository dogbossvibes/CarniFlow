// `shareViaSystem` — Verhaltenstests des nativen Teilen-Pfads.
//
// Anlass: derselbe Importfehler wie im QA-Export. expo-sharing@14 hat KEINEN
// Default-Export; `const { default: Sharing } = await import('expo-sharing')`
// ergibt `undefined` und scheitert mit
// "Cannot read property 'isAvailableAsync' of undefined".
//
// Anders als beim QA-Export wird hier KEINE Datei geschrieben — geteilt wird
// eine URL. Einen Cache-Leak kann es an dieser Stelle deshalb nicht geben,
// was ein Test unten ausdrücklich festhält.

import { readFileSync } from 'fs';

const mockSetString = jest.fn(async (_s: string) => {});
jest.mock('expo-clipboard', () => ({ setStringAsync: (s: string) => mockSetString(s) }));

const mockIsAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_url: string, _opts?: unknown) => {});
// Bewusst OHNE `default` — exakt so, wie das echte Modul aufgebaut ist.
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  shareAsync: (url: string, opts?: unknown) => mockShare(url, opts),
}));

jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: jest.fn() }, from: jest.fn() } }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { shareViaSystem } = require('@/services/shareService') as typeof import('@/services/shareService');

const URL = 'https://anyvo.app/share/abc123';

describe('shareViaSystem — nativer Pfad', () => {
  beforeEach(() => {
    mockSetString.mockClear(); mockShare.mockClear();
    mockIsAvailable.mockReset().mockResolvedValue(true);
  });

  it('Teilen verfügbar → shareAsync wird mit Titel aufgerufen, kein Clipboard', async () => {
    await shareViaSystem(URL, 'Training teilen');
    expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(URL, { dialogTitle: 'Training teilen' });
    expect(mockSetString).not.toHaveBeenCalled();
  });

  it('isAvailableAsync wird VOR shareAsync geprüft', async () => {
    const order: string[] = [];
    mockIsAvailable.mockImplementation(async () => { order.push('check'); return true; });
    mockShare.mockImplementation(async () => { order.push('share'); });
    await shareViaSystem(URL, 'T');
    expect(order).toEqual(['check', 'share']);
  });

  it('Teilen nicht verfügbar → Link landet in der Zwischenablage, kein Fehler', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await expect(shareViaSystem(URL, 'T')).resolves.toBeUndefined();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockSetString).toHaveBeenCalledWith(URL);
  });

  it('kein verwaistes Cache-File: dieser Pfad schreibt überhaupt keine Datei', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await shareViaSystem(URL, 'T');
    const src = readFileSync('services/shareService.ts', 'utf8');
    // Es gibt in dieser Datei keinerlei Dateisystem-Nutzung — geteilt wird eine URL.
    expect(src).not.toContain('expo-file-system');
    expect(src).not.toContain('writeAsStringAsync');
    expect(src).not.toContain('cacheDirectory');
  });
});

describe('shareViaSystem — defekte/fehlende Sharing-Implementierung', () => {
  it('fehlende Funktionen führen nicht zum Absturz, sondern zum Clipboard-Fallback', async () => {
    jest.resetModules();
    mockSetString.mockClear();
    // Genau der Zustand, der den Gerätefehler ausgelöst hat: das Objekt ist da,
    // die Funktionen fehlen (bzw. `default` war undefined).
    jest.doMock('expo-sharing', () => ({}));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require('@/services/shareService') as typeof import('@/services/shareService');
    await expect(svc.shareViaSystem(URL, 'T')).resolves.toBeUndefined();
    expect(mockSetString).toHaveBeenCalledWith(URL);
  });
});

describe('Importform', () => {
  const src = readFileSync('services/shareService.ts', 'utf8');
  const code = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('kein Default-Destructuring von expo-sharing mehr', () => {
    expect(code).not.toContain('{ default: Sharing }');
  });

  it('Namespace-Import und Fähigkeitsprüfung vorhanden', () => {
    expect(code).toContain("import * as Sharing from 'expo-sharing';");
    expect(code).toContain("typeof Sharing.isAvailableAsync !== 'function'");
    expect(code).toContain("typeof Sharing.shareAsync !== 'function'");
  });

  it('der Web-Zweig und der Clipboard-Pfad bleiben unverändert', () => {
    expect(code).toContain("if (Platform.OS === 'web')");
    expect(code).toContain('navigator.share');
    expect(code).toContain('export async function copyToClipboard');
    expect(code).toContain('Clipboard.setStringAsync(url)');
  });
});
