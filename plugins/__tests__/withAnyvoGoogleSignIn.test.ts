// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withAnyvoGoogleSignIn');

describe('withAnyvoGoogleSignIn', () => {
  const original = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = original;
  });

  it('kehrt die iOS-Client-ID in das URL-Schema um', () => {
    expect(plugin.iosUrlSchemeFromClientId('123-abc.apps.googleusercontent.com'))
      .toBe('com.googleusercontent.apps.123-abc');
    expect(plugin.iosUrlSchemeFromClientId(' com.googleusercontent.apps.123-abc '))
      .toBe('com.googleusercontent.apps.123-abc');
    expect(plugin.iosUrlSchemeFromClientId('')).toBeNull();
    expect(plugin.iosUrlSchemeFromClientId(undefined)).toBeNull();
  });

  it('lehnt falsche IDs mit klarer Meldung ab (Build bricht früh ab)', () => {
    expect(() => plugin.iosUrlSchemeFromClientId('falsch')).toThrow(/apps\.googleusercontent\.com/);
  });

  it('lässt die Konfiguration ohne Variable unverändert', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { name: 'ANYVO', slug: 'anyvo' };
    expect(plugin(config)).toBe(config);
    warn.mockRestore();
  });

  it('registriert mit Variable den Info.plist-Eintrag für das Google-URL-Schema', () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = '123-abc.apps.googleusercontent.com';
    const result = plugin({ name: 'ANYVO', slug: 'anyvo', ios: {}, _internal: { projectRoot: process.cwd() } });
    // Der iOS-Mod wird von Expo erst beim Prebuild ausgeführt; hier genügt der Nachweis,
    // dass die Mods registriert sind.
    expect(result.mods?.ios?.infoPlist).toEqual(expect.any(Function));
  });
});
