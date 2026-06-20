# ANYVO — EAS Build / Expo Dev Build

ANYVO nutzt **Continuous Native Generation (CNG)**: `app.json` ist die einzige
Quelle der Wahrheit. Die Ordner `/ios` und `/android` sind **gitignored** und
werden bei jedem EAS-Build per `expo prebuild` frisch erzeugt. Man bearbeitet
also **nie** native Dateien direkt, sondern konfiguriert alles über `app.json`
(Plugins) und `eas.json` (Build-Profile).

## Voraussetzungen

- `eas-cli` ist installiert (global): `eas --version`
- Eingeloggt: `eas whoami` (sonst `eas login`)
- EAS-Projekt ist verknüpft: `extra.eas.projectId` in `app.json`

## Wichtig: Expo Go wird NICHT mehr unterstützt

Die App verwendet native Module, die in Expo Go **nicht** enthalten sind
(`expo-location` mit Hintergrund-Modus, `react-native-ble-plx`, `expo-sqlite`,
`expo-speech-recognition`, `expo-sensors`, `@sentry/react-native`, …). Für
Entwicklung und Tests wird daher zwingend ein **Development Build** (Dev-Client)
benötigt. Den Metro-Server passend dazu starten:

```bash
npm run start:dev-client      # = expo start --dev-client
```

(„Normales" `expo start` würde Expo Go ansteuern und die nativen Tracking-
Funktionen würden fehlen.)

## Build-Profile (`eas.json`)

| Profil                    | Zweck                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `development`             | Dev-Client für echte Geräte (iOS ad-hoc / Android-APK)      |
| `development-simulator`   | Dev-Client für den **iOS-Simulator** (kein Code-Signing)    |
| `preview`                 | Interne Testversion ohne Dev-Client (Android-APK)           |
| `production`              | Store-Release (iOS App Store / Android App Bundle)          |

## Befehle

### Development (Dev Build mit nativen Modulen)

```bash
# Android (installierbares Debug-APK)
eas build --profile development --platform android

# iOS (echtes Gerät, internes Ad-hoc-Provisioning)
eas build --profile development --platform ios

# iOS-Simulator (kein Apple-Gerät / kein Code-Signing nötig)
eas build --profile development-simulator --platform ios
```

### Production (Store-Release)

```bash
# Android (App Bundle für Play Store)
eas build --profile production --platform android

# iOS (App Store)
eas build --profile production --platform ios
```

### Kurzformen (npm-Scripts)

```bash
npm run build:dev:android
npm run build:dev:ios
npm run build:dev:ios:sim
npm run build:prod:android
npm run build:prod:ios
```

### Submit (Stores)

```bash
eas submit --profile production --platform ios       # ascAppId steht in eas.json
eas submit --profile production --platform android
```

## Lokaler Prebuild (optional, zum Debuggen der nativen Config)

EAS macht den Prebuild in der Cloud automatisch. Lokal nur bei Bedarf:

```bash
npx expo prebuild --clean --platform ios
npx expo prebuild --clean --platform android
```

Da `/ios` und `/android` gitignored sind, ist das gefahrlos — die Ordner sind
reine Artefakte und werden nicht eingecheckt.

## Health-Check

```bash
npx expo-doctor        # muss „18/18 checks passed" melden
```

## Neue native Module hinzufügen

1. Mit `npx expo install <paket>` installieren (wählt die SDK-passende Version).
2. Falls nötig Config-Plugin + Permissions in `app.json` ergänzen.
3. **Neuen Dev-Build** erstellen (native Module sind erst nach einem Rebuild
   verfügbar — ein JS-Reload reicht nicht).
4. `npx expo-doctor` prüfen.
