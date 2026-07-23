# ANYVO — Build-Entscheidungsmatrix

Wann reicht ein **Dev-Reload** (kostenlos), wann ein **EAS Update** (OTA, kostenlos, nur JS/Assets), wann ein **neuer nativer Build** (kostenpflichtig) und wann eine **Store-Einreichung**?

> Voraussetzung für „EAS Update": **`expo-updates` muss installiert und in einem Store-Build aktiv sein.** Aktuell ist es NICHT installiert → bis dahin erzwingt jede Änderung einen nativen Build. Siehe `docs/DEVELOPMENT_WORKFLOW.md`.

Automatische Prüfung: `npm run native:check` (nennt Ergebnis A = kein Build / B = Build nötig).

| Änderung | Dev-Reload | EAS Update | Neuer nativer Build | Store-Einreichung |
|---|:---:|:---:|:---:|:---:|
| Text geändert | ✅ | ✅ | – | – |
| Farbe/Style geändert | ✅ | ✅ | – | – |
| Screen/Layout geändert (JS) | ✅ | ✅ | – | – |
| Supabase-Query geändert | ✅ | ✅ | – | – |
| RevenueCat **Produkt-ID** (nur JS-Konstante) | ✅ | ✅ | – | – |
| JS-Asset/Bild im Bundle | ✅ | ✅ | – | – |
| Feature-Flag-Wert (EXPO_PUBLIC_*) | ⚠️¹ | ✅ | – | – |
| **Neues natives Paket** | – | ❌ | ✅ | ✅ |
| **Neue Berechtigung** (Info.plist/Manifest) | – | ❌ | ✅ | ✅ |
| App-Icon geändert | – | ❌ | ✅ | ✅ |
| Splash-Screen (Asset/Plugin) | – | ❌ | ✅ | ✅ |
| **Expo SDK / React-Native** geändert | – | ❌ | ✅ | ✅ |
| Info.plist geändert | – | ❌ | ✅ (iOS) | ✅ |
| AndroidManifest geändert | – | ❌ | ✅ (Android) | ✅ |
| App-**Version** (Marketing-Version) | – | ❌ | ✅ | ✅ |
| buildNumber/versionCode | – | ❌ | ✅ | ✅ |
| ANYVO CONNECT **nur per Feature-Flag** (JS) | ✅ | ✅ | –² | – |
| Background Location (native/Manifest) | – | ❌ | ✅ | ✅ |
| Push Notifications (native Setup/Entitlement) | – | ❌ | ✅ | ✅ |
| Push-Inhalt/Handler (JS) | ✅ | ✅ | – | – |
| Config-Plugin (`plugins/`) geändert | – | ❌ | ✅ | ✅ |
| `eas.json` / `app.json` (native Optionen) | – | ❌ | ✅ | ✅ |

¹ EXPO_PUBLIC_* werden zur **Bundle-Zeit** eingesetzt → im Dev per Metro-Neustart, in Prod per Update/Build.
² CONNECT-**Code** ist rein JS → OTA-fähig; solange der Flag aus ist, ändert sich nativ nichts. Die CONNECT-**Migration** ist DB-seitig (kein App-Build).

**Legende:** ✅ möglich · ❌ nicht möglich/nicht erlaubt · – nicht nötig · ⚠️ mit Einschränkung.
