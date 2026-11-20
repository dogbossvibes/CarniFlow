# Maestro – automatische UI-Tests (lokal, Staging)

Stand: 2026-11-20. Die Abläufe liegen in `.maestro/` und bedienen die App so, wie
es bisher von Hand im iOS-Simulator und Android-Emulator geprüft wurde.

## Grenzen (zuerst lesen)

- **Nur Staging.** Die Abläufe schreiben Testdaten (Medikament, Hund, Feld «Futter»)
  und räumen sie wieder auf. Nie gegen Production laufen lassen.
- **Keine Zugangsdaten im Repo.** Die Abläufe melden niemanden an. Die Nutzerin
  meldet sich einmalig von Hand mit dem Staging-Testkonto an; die Anmeldung bleibt
  erhalten, weil die Abläufe den App-Speicher nie löschen (`clearState: false`).
- **Keine Fährtenaufnahme.** Simulator und Emulator liefern keine laufenden
  GPS-Fixes; Legen, Liegezeit und Absuche werden nicht automatisch geprüft.
- **Keine Kosten** (Vorgabe der Nutzerin 2026-11-18): nur lokal auf dem Mac im
  iOS-Simulator und Android-Emulator. Kein Maestro Cloud (`maestro cloud …`, von
  der CLI beworben), keine EAS-Builds oder EAS Workflows, keine GitHub-Actions-
  Läufe, keine Testgeräte-Dienste. Die Maestro-CLI selbst ist gratis.
- Ein grüner Lauf ersetzt keinen Gerätetest für Tracking/GPS, Abo/Bezahlung,
  Mitteilungen, Kamera/Fotos und Offline-Verhalten.

## Voraussetzungen

1. **Maestro-CLI** (geprüft mit 2.12.1) unter `~/.maestro/bin` oder im `PATH`,
   dazu Java 17+. Installation nur von <https://maestro.mobile.dev>.
2. **Dev-Build der App** (`com.anyvo.app`) im iOS-Simulator bzw. Android-Emulator
   installiert (Rezepte wie bisher: `xcodebuild … -sdk iphonesimulator
   CODE_SIGNING_ALLOWED=NO SENTRY_DISABLE_AUTO_UPLOAD=true`, Emulator
   `Samsung_Galaxy_S23`).
3. **Metro gegen Staging** läuft (`EXPO_PUBLIC_BACKEND_ENV=staging`,
   `expo start --dev-client`). Die Abläufe starten Metro nicht selbst.
4. **Angemeldet** mit dem Staging-Testkonto, Einführung abgeschlossen.
5. **Ein Testhund** im Konto. Standardname `Testhund`; anderer Name über
   `-e DOG_NAME="…"`. Für Auswertung und Logbuch braucht er mindestens eine
   gespeicherte Fährte. Seine Gesundheitsakte muss sonst leer sein: Die
   Gesundheits-Abläufe erkennen ihre Testeinträge im Verlauf über Filter und
   prüfen vor dem Löschen den Inhalt, erwarten aber keine fremden Einträge.
6. **Dev-Menü-Knopf ausblenden** (einmalig je Gerät): Dev-Menü öffnen →
   «Tools button» ausschalten. Der schwebende Knopf verdeckt sonst Knöpfe oben
   rechts.

Die App-Sprache stellen die Abläufe selbst auf Deutsch.

## Starten

```bash
npm run test:e2e -- --platform android
```

```bash
npm run test:e2e -- --platform ios
```

Einzelner Ablauf oder nur die Schnellprüfung:

```bash
npm run test:e2e -- --platform ios .maestro/flows/10-gesundheit-medikament.yaml
```

```bash
npm run test:e2e -- --platform android --include-tags smoke
```

Der Wrapper `scripts/e2e-maestro.mjs` sucht Maestro und das laufende Gerät, legt
die Testdatei `.maestro/fixtures/e2e-maestro-testdokument.pdf` für Ablauf 19 aufs
Gerät (Android: `Download`, iOS: «Auf meinem iPhone») und
legt Screenshots und Logs unter `.maestro/.output/<plattform>/` ab (nicht
versioniert). iOS und Android nacheinander laufen lassen, nicht gleichzeitig:
Beide Geräte nutzen dasselbe Testkonto.

## Abläufe

| Datei | Prüft |
|---|---|
| `01-start` | Startbildschirm, Schnellzugriffe, Tab-Leiste |
| `02-tabs` | Jeder Haupt-Tab öffnet seinen Bereich |
| `03-hund-anlegen` | Hund anlegen und wieder löschen; bei erreichtem Kontingent stattdessen die Abo-Auswahl |
| `04-hund-bearbeiten` | Hundeprofil bearbeiten, speichern, zurücksetzen |
| `05-training-dokumentieren` | Training erfassen: Übung wählen, speichern |
| `06-trainingsjournal` | Journal, Zeitraumfilter, Suche |
| `07-faehrten-uebersicht` | Fährten-Übersicht mit allen Einstiegen |
| `08-faehrten-auswertung` | Auswertung der letzten Fährte |
| `09-faehrten-logbuch` | Logbuch, Geländefilter, Eintrag öffnen |
| `10-gesundheit-medikament` | Gesundheitsakte: Medikament erfassen, bearbeiten, Gabe dokumentieren, löschen |
| `11-kalender` | Training Hub (Timeline/Woche/Monat), Termin-Formular ausfüllen (ohne Speichern) |
| `12-gruppentraining` | Gruppen-Übersicht, Formulare «Mit Code beitreten» und «Gruppe erstellen» (ohne Absenden) |
| `13-profil-sprache` | Profil, Sprache umstellen und zurück |
| `14-gesundheit-gewicht` | Gewicht erfassen, Gewichtsverlauf, Messung bearbeiten, löschen |
| `15-gesundheit-tierarzt` | Tierarzttermin erfassen, im Verlauf öffnen, löschen |
| `16-gesundheit-impfung-parasiten` | Impfung und Parasitenbehandlung erfassen und löschen |
| `17-gesundheit-allergie-diagnose-notfall` | Allergie, Unverträglichkeit, Diagnose erfassen, in den Notfallinformationen wiederfinden, löschen |
| `18-gesundheit-dokumente-freigaben` | Dokument-Formular, Freigaben-Ansicht |
| `19-gesundheit-dokument-hochladen` | Test-PDF im System-Dateidialog wählen, hochladen, in der Liste finden, löschen |

Gemeinsame Bausteine in `.maestro/common/`: `start` (App neu starten, Start
abwarten), `dismiss-logbox` (Dev-Hinweise wegräumen), `dismiss-help`
(Kontexthilfe schliessen), `ensure-german`, `back`, `hide-keyboard`, `open-dog`,
`open-tracks`, `open-health`, `health-add-entry`, `health-delete-entry`.

## Regeln für neue Abläufe

- Über sichtbare Texte und Accessibility-Labels auswählen, keine Koordinaten.
- iOS fasst die Texte eines Knopfs zu einem Label zusammen («Sprache, Deutsch»),
  Android liefert sie einzeln: Muster wie `".*Sprache.*"` verwenden.
- Maestro vergleicht ohne Gross-/Kleinschreibung. Tabs heissen auf iOS «Hunde,
  tab, 2 of 7» und «Hunde» träfe auch die Kennzahl «HUNDE»: Tabs deshalb mit
  `"(?-i)Hunde(, tab.*)?"` wählen.
- Die Tab-Leiste liegt über dem Inhalt. Vor dem Antippen tief liegender Elemente
  `scrollUntilVisible` mit `centerElement: true` verwenden – ausser beim letzten
  Element einer Liste (lässt sich nicht zentrieren, der Schritt läuft auf iOS ins
  Zeitlimit).
- Tastatur mit `runFlow: ../common/hide-keyboard.yaml` schliessen, nicht mit
  `hideKeyboard` (auf iOS unzuverlässig).
- Bestätigungsdialoge: den Knopf relativ wählen, z. B. `text: "Löschen"` mit
  `rightOf: "Abbrechen"`, weil derselbe Text auch dahinter steht.
- Testdaten heissen `E2E Maestro …` und werden im selben Ablauf wieder gelöscht.
  Nur diese löschen, nie vorhandene Einträge.
- Keine Passwörter, Codes oder Personendaten in Abläufen oder Screenshots.
- Jeder Ablauf beginnt mit `runFlow: ../common/start.yaml` und ist für sich
  allein lauffähig.

## Bekannte Eigenheiten

- **LogBox** (nur Dev-Build) legt Warnungen über die Tab-Leiste, z. B. den
  harmlosen Keychain-Fehler von expo-notifications im unsignierten
  Simulator-Build. `dismiss-logbox` räumt sie weg.
- **Formulare der Gesundheitsakte** lösen im Dev-Build den LogBox-Fehler «Text
  strings must be rendered within a <Text> component» aus; der Hinweis verdeckt
  «Speichern». `health-add-entry` räumt ihn vor dem Speichern weg.
- **Datei-Dialog (Ablauf 19):** Systemoberfläche, Texte in der Gerätesprache
  (iOS-Simulator deutsch: «Durchsuchen», «Auf meinem iPhone»). Auf iOS ist nur
  die ganze Datei-Kachel antippbar. Wird Maestro direkt statt über
  `npm run test:e2e` gestartet, fehlt die Testdatei auf dem Gerät.
- **Symbol-Knöpfe ohne Label** (Stift im Hundeprofil, Plus im Training Hub)
  werden über ihr Symbolzeichen angesteuert (`""`, `""`). Das bricht,
  wenn das Symbol wechselt; ein `accessibilityLabel` an diesen Knöpfen wäre die
  saubere Lösung.
- **Plan des Testkontos:** Das Staging-Testkonto ist seit 2026-11-19 ACTIVE
  (Abo-Zeile `staging_qa`, `user_capabilities.pro_member`). Im Newbie-Plan führt
  «Hund speichern» zur Abo-Auswahl (Ablauf 03 prüft dann diese) und Ablauf 05
  scheitert ab der dritten Einheit im Kalendermonat am Trainings-Kontingent.
- **Ablauf 05 hinterlässt eine Trainingseinheit:** Jeder Lauf speichert eine
  Einheit, die im Journal stehen bleibt (wird nicht gelöscht).
- **Staging muss den Datenbankstand von Production haben:** Ablauf 05 braucht
  die Funktionen `training_document_v1`, `training_exercise_identity_v1` und
  `training_focus_v1`, Ablauf 19 die erweiterte Leseregel `dog_documents_select`
  (beides 2026-11-19 auf Staging nachgezogen).
- **Abgebrochener Lauf hinterlässt Testdaten:** Scheitert ein Gesundheits-Ablauf
  nach dem Erfassen, bleibt der Eintrag `E2E Maestro …` stehen und der nächste
  Lauf legt einen zweiten an. Vor dem Wiederholen die `E2E Maestro …`-Einträge
  im Verlauf von Hand löschen.
- **Dev-Menü-Knopf auf iOS:** Der Schalter «Tools button» liegt im Dev-Menü ganz
  unten (Blatt nach oben ziehen).

## Nicht abgedeckt

Fährte legen/Liegezeit/Absuche (GPS), Verleitungen, Kartenplanung, Fährten teilen
und Dateien öffnen, Gruppentraining mit zweitem Konto (Beitritt bestätigen,
Sitzung, Auswertung), Termin speichern (native Datums-/Zeitauswahl),
Trainingstimer, Kommandos/Ziele/Backpack, Gesundheitsfreigabe erteilen (braucht einen Kontakt, also ein
zweites Konto), Läufigkeit, Erinnerungen/Fälligkeiten der Gesundheitseinträge,
Trainer-Bereich und Nachrichten, Abo-Kauf, Anmeldung/Registrierung/Konto löschen,
Mitteilungen, Fotos/Kamera/Sprachmemos, Offline/Sync, PDF-Export sowie die
Sprachen ausser Deutsch.
