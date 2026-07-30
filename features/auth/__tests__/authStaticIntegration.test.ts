import { readFileSync } from 'fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('Auth static integration checks', () => {
  it('5/6. Session Context behandelt PASSWORD_RECOVERY und öffnet den Passwort-Screen', () => {
    const src = read('lib/session-context.tsx');
    expect(src).toContain("event === 'PASSWORD_RECOVERY'");
    expect(src).toContain("router.replace('/auth/recovery' as never)");
  });

  it('6. Recovery-Screen tauscht PKCE-Code und setzt neues Passwort', () => {
    const src = read('app/auth/recovery.tsx');
    expect(src).toContain('exchangeCodeForSession(code)');
    expect(src).toContain("updatePassword(pw1)");
    expect(src).toContain("t('auth.newPasswordTitle')");
  });

  it('19. OAuth Callback bleibt auf auth/callback und tauscht nur Web-Codes', () => {
    const callbackSrc = read('app/auth/callback.tsx');
    const serviceSrc = read('services/auth.ts');
    expect(serviceSrc).toContain("path:   'auth/callback'");
    expect(callbackSrc).toContain('exchangeCodeForSession(code)');
    expect(callbackSrc).toContain("Platform.OS !== 'web'");
  });

  it('21. Apple Login bleibt nativ über signInWithIdToken vorhanden', () => {
    const src = read('services/auth.ts');
    expect(src).toContain("provider: 'apple'");
    expect(src).toContain('signInWithIdToken');
    expect(src).toContain('expo-apple-authentication');
  });

  it('SMS, Phone Auth und Identity Linking wurden nicht eingeführt', () => {
    const src = read('services/auth.ts');
    expect(src).not.toContain('signInWithOtp');
    expect(src).not.toContain('verifyOtp');
    expect(src).not.toContain('linkIdentity');
  });
});
