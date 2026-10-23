# UX 3+4: Historie, Trainingsvorlage und sichtbares Bearbeiten

Owner: Chat 07, alleiniger UI-Writer. Lokale Umsetzung, iOS zuerst; gemeinsamer React-Native-Code bleibt Android-kompatibel. Kein Commit, Push, Merge, Build, OTA oder Store-Release autorisiert.

## Quelle und Zuordnung

Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-training-template-ux-20261023`
Branch: `feat/training-template-ux-20261023`
Basis/HEAD: `6328890822a842cb94cd6819e483cc5e86056ed7`.
Chat 01 bestätigte die veröffentlichte iOS55-Basis frisch mit `outputs/IOS55-LATEST-READ-FOR-UX-07-20261023.json`. Tracking-R2-Dateien überschneiden sich nicht mit diesem Paket. Worktree vor Änderungen sauber; alle Änderungen bleiben uncommitted. Lokaler node_modules-Link dient nur der Wiederverwendung unveränderter installierter Abhängigkeiten und gehört nicht zum Produktdiff.

## Umsetzung

- Bestehende konten-, hunde- und spartengebundene Historie wird weiterverwendet. Datumsanzeige lokalisiert; letzte Übungsbewertungen zusätzlich sichtbar.
- Im eigenen abgeschlossenen Trainingsdetail erscheint „Als Vorlage übernehmen“. Auswahl einer vorhandenen aktiven Sparte, einzelner Übungen und offener Schwerpunkte. Checkbox-Zustände und klare Auswahl-/Abbruchaktionen.
- Ein neues Training öffnet den bestehenden Dokumentationseditor mit neuen Einheits-/Vorgangs-/Übungszeilen-IDs. Stabile Übungsidentitäten bleiben erhalten; Legacy-Zeilen werden nicht nach Namen zusammengeführt.
- Bewertungen, Beobachtungen, Notizen, Zeitstempel, Dauer, Medien und Leistungsmetriken werden nicht aus der Quelle übernommen. Gewählte offene Schwerpunkte bleiben datierte, lesende Vorbereitungshinweise im lokalen Entwurf; keine doppelten Fokus- oder Trainingsdatensätze.
- Ein unfertiger Vorlagenentwurf wird über denselben Konto-/Quell-/Hund-/Sparten-Schlüssel wieder angeboten. Andere Vorlagen und gewöhnliche Entwürfe bleiben erhalten. Nach bestätigtem Speichern greift die vorhandene Entwurfsbereinigung.
- Speicherung, Quota, atomare Save-Intents, Retry und Berechtigungen verwenden den bestehenden Vertrag. Kein neues Backend-/DB-/KI-/Native-Modell. Das bestehende Trainingsmodell hat kein zusätzliches allgemeines Zielfeld; geeignete offene Ziele werden als vorhandene Schwerpunkte behandelt, keine alten Notizen als neue Ziele interpretiert.
- Journal zeigt Bearbeiten direkt für normale Einheiten und Legacy-Sessions. Termin-Timeline zeigt Bearbeiten nur für eigene manuelle Termine gemäß bestehendem canEditOwnEvent; Trainer-/Importtermine behalten ihre bisherigen Abläufe. Monats-/Wochenansicht verwendet weiterhin das bestehende Aktionsblatt.
- Deutsche, schweizerdeutsche, englische, französische und italienische UI-Texte ergänzt.

## Prüfungen und Grenzen

8 Jest-Suiten, 126 Tests bestanden, keine übersprungen. Abgedeckt sind Auswahl/Abbruch, getrennte stabile Identitäten, Fremdkonto/Hund, beschädigte Auswahl, fehlende Quelle/Offlinefehler, Entwurfsfortsetzung ohne Überschreiben, getrennte Entwürfe, heutiges Speichern über Create ohne historische Fakten/Fokusduplikate, Kontowechsel und sichtbare Edit-Navigation inklusive Import-/Trainergrenzen.
Typecheck, ESLint und diff-check: genaue Endergebnisse im SOURCE-FREEZE-07.json und gebundenen Logs.
Keine Geräte-/Screenreader-/visuelle Laufzeitabnahme und keine Live-API-Prüfung ausgeführt. Geräteprüfungen zurückgestellt. Unabhängiger Review vor Integration noch offen. Expo-Dokumentationslinks für v54 wurden geprüft, leiteten aber auf latest um; keine neuen APIs oder Abhängigkeiten eingeführt, installierte SDK54-Typen sind maßgeblich.

## Übergabe

Freeze und Prüfbelege: `outputs/ux-training-template-07-20261023/` im Projektmirror. 00 koordiniert unabhängigen Review und danach Übergabe des geprüften Stands an 11 für die deterministischen Adapter. Keine parallelen Änderungen an den UI-Dateien; expliziter Release-Stopp bleibt gültig. Android-Übernahme/-Abnahme folgt nach der iOS-Stufe; keine veröffentlichte Funktion behaupten.
