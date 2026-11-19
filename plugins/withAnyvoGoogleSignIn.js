// ─────────────────────────────────────────────────────────────────────────
// Lokaler Expo-Config-Plugin — nativer Google-Login (ohne Firebase).
//
// iOS braucht für @react-native-google-signin/google-signin das umgekehrte
// iOS-Client-ID-Schema (com.googleusercontent.apps.<id>) in der Info.plist.
// Die ID kommt beim Build aus der EAS-Umgebung (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
// damit app.json statisch bleibt (die Release-Werkzeuge werten app.config.* als
// «nicht prüfbar») und kein Wert im öffentlichen Repo steht.
//
// Fehlt die Variable, ändert der Plugin NICHTS: der Build läuft normal, und die
// App nutzt auf iOS weiter den bisherigen Web-Login (services/googleNativeSignIn.ts
// fällt automatisch zurück). Android braucht ohne Firebase keinen Plugin-Eintrag.
// ─────────────────────────────────────────────────────────────────────────

const GOOGLE_SCHEME_PREFIX = 'com.googleusercontent.apps.';
const GOOGLE_ID_SUFFIX = '.apps.googleusercontent.com';

function iosUrlSchemeFromClientId(rawClientId) {
  const clientId = String(rawClientId ?? '').trim();
  if (!clientId) return null;
  if (clientId.startsWith(GOOGLE_SCHEME_PREFIX)) return clientId;
  if (!clientId.endsWith(GOOGLE_ID_SUFFIX)) {
    throw new Error(
      'withAnyvoGoogleSignIn: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID muss auf ".apps.googleusercontent.com" enden (iOS-Client aus der Google Cloud Console).',
    );
  }
  return GOOGLE_SCHEME_PREFIX + clientId.slice(0, -GOOGLE_ID_SUFFIX.length);
}

function withAnyvoGoogleSignIn(config) {
  const iosUrlScheme = iosUrlSchemeFromClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  if (!iosUrlScheme) {
    console.warn('[withAnyvoGoogleSignIn] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID fehlt — iOS nutzt weiter den Web-Google-Login.');
    return config;
  }
  const pluginModule = require('@react-native-google-signin/google-signin/app.plugin.js');
  const withGoogleSignIn = pluginModule.default ?? pluginModule;
  return withGoogleSignIn(config, { iosUrlScheme });
}

module.exports = withAnyvoGoogleSignIn;
module.exports.iosUrlSchemeFromClientId = iosUrlSchemeFromClientId;
