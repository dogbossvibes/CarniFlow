/* eslint-disable @typescript-eslint/no-require-imports */
// Statusauflösung der Web-Bestätigungsseite /auth/confirmed (reine Logik).
// Die Seite selbst hat keine eigene Test-Infrastruktur; getestet wird das
// wiederverwendbare Resolver-Modul (Browser via window, Node via require).

const AuthConfirm = require('../assets/auth-confirm.js') as {
  ANYVO_APP_LINK: string;
  getOpenAppTarget: () => string;
  resolveConfirmStatus: (search?: string, hash?: string) => string;
  parseParams: (search?: string, hash?: string) => Record<string, string>;
};

const { resolveConfirmStatus, getOpenAppTarget, ANYVO_APP_LINK } = AuthConfirm;

describe('resolveConfirmStatus', () => {
  it('zeigt Erfolg bei PKCE-Callback mit code', () => {
    expect(resolveConfirmStatus('?code=abc-123', '')).toBe('success');
  });

  it('zeigt Erfolg bei Implicit-Flow mit access_token im Fragment', () => {
    expect(resolveConfirmStatus('', '#access_token=xyz&type=signup')).toBe('success');
  });

  it('zeigt Erfolg bei token_hash/type-Template', () => {
    expect(resolveConfirmStatus('?token_hash=hh&type=email', '')).toBe('success');
  });

  it('behandelt abgelaufenen Link (otp_expired) neutral als "expired"', () => {
    expect(
      resolveConfirmStatus('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    ).toBe('expired');
  });

  it('behandelt access_denied als "expired" (bereits verwendet)', () => {
    expect(resolveConfirmStatus('?error=access_denied', '')).toBe('expired');
  });

  it('zeigt generischen Fehler bei sonstigem error', () => {
    expect(resolveConfirmStatus('?error=server_error&error_description=boom', '')).toBe('error');
  });

  it('täuscht bei Direktaufruf ohne Parameter KEINEN Erfolg vor', () => {
    expect(resolveConfirmStatus('', '')).toBe('neutral');
    expect(resolveConfirmStatus(undefined, undefined)).toBe('neutral');
    expect(resolveConfirmStatus('?', '#')).toBe('neutral');
  });

  it('priorisiert einen Fehler auch dann, wenn zusätzlich ein code vorhanden ist', () => {
    expect(resolveConfirmStatus('?code=abc&error=access_denied&error_code=otp_expired', '')).toBe('expired');
  });
});

describe('Open-App-Ziel (kein Open-Redirect)', () => {
  it('nutzt ausschliesslich das feste anyvo-Scheme', () => {
    expect(getOpenAppTarget()).toBe('anyvo://');
    expect(ANYVO_APP_LINK).toBe('anyvo://');
  });

  it('ignoriert ein manipuliertes redirect-Ziel aus der URL', () => {
    // Selbst wenn die URL ein fremdes Ziel mitführt, bleibt das Ziel konstant.
    (global as any).__evil = 'https://evil.example/steal';
    expect(getOpenAppTarget()).toBe('anyvo://');
    delete (global as any).__evil;
  });
});
