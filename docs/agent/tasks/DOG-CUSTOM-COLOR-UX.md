# Freie Hundefarbe — Chat 07, 2026-10-08

Status: Client implementiert und lokal geprüft. Backend-/Production-DB-Abnahme und native Geräteprüfung OPEN. Kein Commit/Push/Merge/OTA/Build/DB-Write durch 07.

Worktree: /Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-dog-custom-color
Branch: feat/dog-custom-color
Basis/HEAD: 28355badd869b1bf4f022c2c1c13a0c0b2636eca

## Autorisierung und Grenzen

Direkten 02-Nutzerturn 01a11d72-091b-7332-a553-124475ca0809 selbst gelesen: freie Farben umsetzen und per OTA. 07 Clientowner, 05 Backendowner, 01 einziger Publisher. Kein Live-DB-Write aus OTA-Freigabe. Neue Workflow-Vorgabe zum Erhalt aller bestehenden Kundendaten berücksichtigt. Keine bestehende Migration geändert, keine Daten/Cachezeilen gelöscht, keine historischen Farbwerte oder Fellfarben umgeschrieben. Main/fremde Worktrees unverändert.

## Client-Vertrag und Umsetzung

Bestehende dogs.track_overlay_color_key: null und sieben Palette-Keys bleiben erhalten; zusätzlich normalisiertes, opakes #RRGGBB, sechs Hexziffern, uppercase. 05 hat diesen Vertrag im laufenden Chat bestätigt; Live-Constraint-/RLS-Abnahme damit nicht ersetzt. Alte Clients verwerfen unbekanntes HEX nur für die Darstellung und nutzen ihren dogId-Automatikfallback; keine Gleichfarbigkeit alter Clients behaupten.

Zentraler Resolver validiert/normalisiert HEX. Dog-Typ, Reference-Overlay-Typ, Profilbearbeitung, Übersicht und DogTrackingPanel verwenden denselben Vertrag. Keine dynamischen Übersetzungsschlüssel aus HEX; lokalisiertes „Eigene Farbe“. Fünf Sprachen ergänzt (DE, GSW, EN, FR, IT); GSW-Sprachabnahme OPEN. Bestehender account-/doggebundener Offlinecache erhält bestätigte HEX-Werte; verspätete fremde Hundedaten bleiben ausgeschlossen.

Neue CustomTrackColorSheet: direkt bearbeitbarer HEX-Wert, RGB-Regler samt +/- und Screenreader-adjustable-Aktionen, Vorschau, eigenes lokalisiertes Abbrechen außerhalb des Scrollbereichs, keyboard-aware begrenztes bestehendes Sheet. Keine neue Dependency. Drag/Tippen/Abbrechen vor Übernehmen ruft keinen Server-Save auf. Übernehmen nutzt ausschließlich den vorhandenen Aufrufer. Eigener sofortiger Aufrufschutz verhindert doppeltes Bestätigen; false/Throw erhalten Eingabe. Editorunmount ignoriert späte Ergebnisse. Key an Konto/Hund verwirft Editorentwurf bei Kontextwechsel.

DogTrackingPanel speichert weiterhin nur das vorhandene Farbfeld, mit bestätigtem Dog/Owner, unmittelbarem Saveguard und Schutz vor altem Kontext nach asynchroner Rückkehr. Bei Fehler keine erfolgreiche Aktualisierung vortäuschen. Profilbearbeitung sendet das Farbfeld weiterhin nur bei expliziter Änderung; unbekannte/alte Werte werden bei anderen Profiländerungen nicht überschrieben.

Senkrechter Farbstreifen in Übersicht/Profil bleibt vorhanden, mit dünner neutraler Kontur. Schwarze/weiße Vorschau erhält kontrastgerechten Text. Referenzlinien erhalten bei dunklen freien Farben einen hellen Halo statt dunklem Halo; Legacy-Palette, Pfadpunkte, Linienbreite/Sortierung unverändert. Aktuelle Linien und bestehende Replay-Konsumenten beziehen Farbe über vorhandene Hooks; keine Recording-/GPS-/Sensor-/Score-/Winkel-/Continuityänderung. Reale Kartenlesbarkeit (insbesondere dunkle aktuelle Linie auf dunklem Kartenuntergrund) bleibt Geräteabnahme; kein universeller Kontrast-PASS.

## Prüfnachweise

Gezielte Jest-Prüfungen: initial sieben erfolgreiche Suites, 77 Tests; neuer Sheet-Test zuerst wegen Mockfactory korrigiert, danach Screenreader-Query doppelte RN-Hostknoten korrigiert. Final vier Suites/26 Tests PASS einschließlich Profilbestand, neuer Sheet-/late-save-Tests und dunklem HEX-Referenzhalo. Insgesamt neun verschiedene Suites, 89 verschiedene Tests (überlappende Läufe nicht addiert). Abschließender Sheetlauf nach lokalisiertem Header-Abbruch: fünf Tests PASS, bereits enthalten.

Abschließender Full-Typecheck PASS (Exit 0), nach Korrektur der TestRenderer-Typabstraktion im neuen Test. ESLint PASS, 0 Fehler und 2 bereits bestehende Warnungen in app/edit-dog.tsx (ungenutzter Alert-Import, useEffect-t-Abhängigkeit); neuer Test separat abschließend lintfrei. git diff --check PASS. Kein Geräte-PASS.

## Integration und Freigabegrenzen

01 erhält isolierten Patch/Dateihashes/Logs nach finalen Checks. Genau passende Runtime-/Plattformintegration und aktuelle Production-Basis beim Publisher prüfen, keine alten gesamten Screen-/Hook-Versionen über neuere Änderungen kopieren. Backend-Check darf nicht durch Clienttests ersetzt werden: bestehendes CHECK erlaubt bislang nur sieben Keys. Freie Farben erst ausliefern, wenn 05 Serverkompatibilität und separat freigegebene notwendige Änderung bestätigt.

Keine Kundenzeilen/Backfills, keine neue Freigabe, keine zweite Farbspalte. Ein Rollback darf bestehende HEX-Werte nicht löschen, um einen alten Constraint wiederherzustellen. Nativer iOS-/Android-Speicher-/Restart-/Offline-/große-Schrift-/VoiceOver-/TalkBack-/Kartenkontrast-Test und sprachliche GSW-Abnahme OPEN.

## Getrennte Folgearbeit

Trainingsdokumentation P1a bleibt eigener geplanter Worktree/Scope; nicht mit diesem Farbauftrag vermischen. Der Nutzer meldete Supabase in Safari geöffnet. 05 ist über diesen vorhandenen Zugang und fehlende training_exercises-Metadaten informiert; keine eigene Browserübernahme oder DB-Schreibfreigabe daraus. Fährtenlegende/manueller Default100/Liegezeitlabel/Diagnoselayout nicht in diesen Kandidaten aufgenommen.
