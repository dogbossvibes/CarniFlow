# Hilfefenster: lesbarer und scrollbar begrenzter Inhalt — 07

Begonnen: 2026-10-08; final geprüft: 2026-10-09. Minimaler Clientfix, uncommitted. Kein Commit/Push/Merge/OTA/Build/DB-Write. Kundendaten und gespeicherte Einstellungen unverändert.

Worktree: /Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-help-sheet-scroll
Branch: fix/help-sheet-scroll
Basis/HEAD: 28355badd869b1bf4f022c2c1c13a0c0b2636eca
Bei Anlage sauber. Main und bestehende WIPs unverändert. Managed-Worktree-Tool meldete „Not a git repository“ für Projektmirror; isolierte Git-Worktree-Anlage anschließend automatisch genehmigt. Keine Bereinigung fremder Änderungen.

## Direkter Auftrag und Primärbeleg

Direkte Workflow-Nutzermeldung selbst gelesen: Turn01a11d7d-e8f7-7d62-8097-d0ac4afff2a3 / Message01a11d7d-efe9-7051-ae11-4fb83d3cd1e9: „bitte beheben, dies kann man nicht scrollen und auch nicht lesen“. Original READONLY /Users/moyo/Downloads/Bildschirmfoto 2026-10-08 um 23.47.48.png tatsächlich angesehen: Schrittlänge kalibrieren, Hilfefenster „Persönliche Schrittlänge“, sichtbar abgeschnittener Body. Keine Kalibrierungsaktion selbst ausgeführt; die fehlende Scrollbarkeit ist Nutzerbeobachtung, nicht eigene Native-Reproduktion.

Komponentenpfad: HelpButton → HelpSheet → track_step_calibration-Registrytexte. Dieselbe Hilfekomponente wird für andere Hilfe-Themen verwendet. Voriger Läufigkeits-History-Fix betrifft AnyvoBottomSheet, eine andere Komponente; diesen vorhandenen Kandidaten weder ersetzt noch dupliziert.

## Ursache und minimaler Fix

Vorher: card.maxHeight='80%' liegt in einer content-sized SafeAreaView; dieser prozentuale Wert ist keine verlässliche Bildschirmhöhenbegrenzung. ScrollView besitzt keine explizite Schrumpfung, Kopf und Footer konkurrieren mit dem Body um Platz. Screenshot und Code unterstützen die Layoutursache; tatsächliche Yoga-Geometrie auf dem Nutzergerät wurde nicht gemessen.

Jetzt: maximale Kartenhöhe aus useWindowDimensions plus SafeArea-Inset, höchstens80% des Fensters und innerhalb des verfügbaren Bereichs. SafeArea/Karte dürfen schrumpfen. Body flexShrink1/minHeight0, Scrollindikator und nestedScrollEnabled; Kopf/Actions außerhalb des normalen Text-Scrollbereichs mit flexShrink0. Buttons mindestens48pt, horizontale Innenabstände, bei Breite<360 oder fontScale>1.3 untereinander. Bei availableHeight<240×fontScale scrollt die gesamte Karte, damit große Kopf-/Footertexte nicht den Body auf0 verdrängen; dieses UI-Breakpointverhalten ist keine Berechnung gespeicherter Daten. Wechsel von Topic/Details/Visible setzt den Scrollbereich neu auf, wiederholtes Öffnen beginnt nicht am alten Scrollende. SystemBack, Backdrop, Verstanden und Mehr erfahren behalten ihre bestehenden Callbackwege.

Kompakt-/Detail-/externLink-Inhalte bleiben vollständig erhalten. Text verwendet bestehendes C.white statt halbtransparentem festem Weiß; sonst bestehende ANYVO-Design-Tokens. Keine neue Themefunktion; Native Hell-/Dunkel-QA bleibt offen.

## Prüfungen

Zwei gezielte Suites /13 unterschiedliche Tests PASS: Schrittlängen-Hilfe bei320×568/Schrift1,390×844/Schrift2,844×390/Schrift1und2; sichere numerische Grenzen, vollständige Textknoten, Textbereich schrumpfbar, Footer im normalen Fall getrennt, EntireCardScroll bei wenig Platz, Footer-Callbacks/SystemBack/reopen. Bestehende Shelly-Hilfe inklusive fünf Sprachen, offiziellem externen Link und Fehlermeldung PASS. Test-SafeArea-Mock um tatsächlichen Hook ergänzt. Diese React-Renderer-Tests beweisen keinen nativen Touch-/Scroll-PASS.

Gezielter Typecheck für Produktdatei und beide Tests PASS nach Aufnahme vorhandener react-test-renderer.d.ts in temporäre Prüfconfig und nullsicherer Test-Registryabfrage. Finale ESLint-Prüfung0Fehler0Warnungen, git diff --check PASS. Abschließender vollständiger Projekt-Typecheck PASS, Exit0.

Visuelle Kontrolle: tatsächlicher Vorher-Screenshot geprüft. Browser-Layoutvorschau nicht abgeschlossen: Playwright-CLI-Start lieferte kein Ergebnis und eigener Startprozess wurde beendet; kein Browserwechsel in die vom Backend-Writer benutzte Safari-Supabase-Sitzung. Keine als Native-App ausgegebene HTML-Nachbildung. Visuelle Afterfix-Kontrolle und echte iOS-/Android-Prüfung OPEN.

## Native Abnahme und Releasegrenzen

Prüfen: kleine Geräte/Rotation/maximale Schrift, kurzer/langer Hilfeinhalt, kompletter Scroll bis zu beiden Aktionen, VoiceOver/TalkBack-Fokus und Aktivierung, Modalöffnen/-schließen erneut, SafeArea/SystemBack, Hell/Dunkel soweit unterstützt. Kein Geräte-PASS aus Jest. Bestehende Kalibrierungswerte/50-Schritte-Ablauf/Permissions/GPS/Sensoren unverändert; kein Reset, keine Neuinstallation, keine Kundendatenlöschung.

Nur components/help/HelpSheet.tsx als Produktdatei. Neuer HelpSheet-Test, minimale Ergänzung bestehender Shelly-Test-Mock und eigener Bericht. Isolierter Patch für gezielte Integration auf aktuelle Plattform-/Runtimebasis durch01. Keine Commit-/OTA-Freigabe aus diesem neuen Bugauftrag oder der30-Minuten-Frist. Keine weiteren Roadmapanalysen begonnen. Trainingsdokumentation P1a weiterhin getrennt geplant; Farbclient separat fertig übergeben.
