import { existsSync, readFileSync } from 'fs';

const loginSource = () => readFileSync('app/(auth)/login.tsx', 'utf8');

describe('Login redesign', () => {
  it('1. verwendet das optimierte bgyam-login.jpg als Hintergrund', () => {
    expect(existsSync('assets/images/bgyam-login.jpg')).toBe(true);
    expect(loginSource()).toContain("require('@/assets/images/bgyam-login.jpg')");
    expect(loginSource()).toContain('<ImageBackground');
  });

  it('2. verwendet das vorhandene icon.png als Login-Logo', () => {
    expect(existsSync('assets/images/icon.png')).toBe(true);
    expect(loginSource()).toContain("require('@/assets/images/icon.png')");
    expect(loginSource()).toContain('resizeMode="contain"');
  });

  it('4/5. enthält die freigegebenen Hero- und Subline-Texte', () => {
    const src = loginSource();
    expect(src).toContain("t('auth.heroTitle')");
    expect(src).toContain("t('auth.heroSubPrefix')");
    expect(src).toContain("t('auth.heroSubAccent')");
    expect(src).not.toContain('Performance-Tracking für Hundesportler.');
  });

  it('6/7. Login und Registrierung verwenden weiter die bestehenden Auth-Handler', () => {
    const src = loginSource();
    expect(src).toContain('await signIn(email.trim(), passwort)');
    expect(src).toContain('await signUp(email.trim(), passwort, vollName.trim() || undefined)');
  });

  it('8. Passwort vergessen öffnet den bestehenden Recovery-Flow', () => {
    const src = loginSource();
    expect(src).toContain("t('auth.forgotPassword')");
    expect(src).toContain("router.push('/auth/forgot-password' as never)");
  });

  it('9. Passwort anzeigen/verbergen ist accessibility-beschriftet', () => {
    const src = loginSource();
    expect(src).toContain("accessibilityLabel={show ? t('auth.hidePassword') : t('auth.showPassword')}");
  });

  it('10/11. Google- und Apple-Handler bleiben angebunden', () => {
    const src = loginSource();
    expect(src).toContain('const handleGoogle = async () =>');
    expect(src).toContain('await signInWithGoogle()');
    expect(src).toContain('const handleApple = async () =>');
    expect(src).toContain('await signInWithApple()');
  });

  it('12/13. Loading- und Fehlerzustände bleiben sichtbar', () => {
    const src = loginSource();
    expect(src).toContain('disabled={isBusy}');
    expect(src).toContain('accessibilityState={{ disabled: isBusy, busy: laden }}');
    expect(src).toContain('{fehler ? (');
  });

  it('14-20. Keyboard/SafeArea/Scroll und Dark-Mint Layout sind vorhanden', () => {
    const src = loginSource();
    expect(src).toContain('<SafeAreaView');
    expect(src).toContain('<KeyboardAvoidingView');
    expect(src).toContain('<ScrollView');
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
    expect(src).toContain('keyboardDismissMode="interactive"');
    expect(src).toContain('automaticallyAdjustKeyboardInsets={Platform.OS === \'ios\'}');
    expect(src).toContain('isCompactHeight');
    expect(src).toContain('C.accent');
  });

  it('21. primäre Buttons für Login und Registrierung bleiben vorhanden', () => {
    const src = loginSource();
    expect(src).toContain("tab === 'anmelden' ? t('auth.loginUpper') : t('auth.registerUpper')");
    expect(src).toContain("accessibilityLabel={tab === 'anmelden' ? t('auth.login') : t('auth.register')}");
  });

  it('22. Social Buttons bleiben im scrollbaren Auth-Inhalt', () => {
    const src = loginSource();
    expect(src).toContain('style={[s.socialBtn, isCompactHeight && s.socialBtnCompact, isBusy && { opacity: 0.5 }]}');
    expect(src).toContain("t('auth.googleLogin')");
    expect(src).toContain('AppleAuthentication.AppleAuthenticationButton');
  });

  it('23. Trust-Bereich ist höhenabhängig und im Register-Modus ausgeblendet', () => {
    const src = loginSource();
    expect(src).toContain("const showTrust = tab === 'anmelden' && viewportHeight >= 2600");
    expect(src).toContain('{showTrust && (');
  });

  it('24. Auth-Card hat keine feste Höhe, die Inhalt clippt', () => {
    const src = loginSource();
    const authPanelBlock = src.match(/authPanel: \{[\s\S]*?\n  \},/)?.[0] ?? '';
    expect(authPanelBlock).not.toContain('height:');
    expect(authPanelBlock).not.toContain('maxHeight:');
  });

  it('25. ScrollView ist nicht mehr auf vertikale Space-Between-Verteilung angewiesen', () => {
    const src = loginSource();
    expect(src).toContain("justifyContent:    'flex-start'");
    expect(src).not.toContain("justifyContent:    'space-between'");
  });

  it('26. Auth-Handler-Referenzen bleiben unverändert', () => {
    const src = loginSource();
    expect(src).toContain('signIn, signUp, signInWithGoogle, signInWithApple, isAppleAuthAvailable');
    expect(src).toContain('await signInWithGoogle()');
    expect(src).toContain('await signInWithApple()');
  });
});
