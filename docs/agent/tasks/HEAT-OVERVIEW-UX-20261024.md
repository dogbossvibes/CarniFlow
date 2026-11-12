# Läufigkeit: freigegebener Überblick, Tagesbeobachtung und Verlauf

Humanauftrag in Chat07 vom 24.10.2026: Mockup umsetzen, ausschließlich Hündinnen,
Bestandsdaten erhalten; nach bestandenem Review/Preflight Git und iOS55 OTA.
Geräteprüfungen zurückgestellt. Sole implementation writer07; Review/release01;
Git-Sicherung00; Datenvertragsreview05. Keine Schema-/Live-DB-/Native-Änderung.

## Quelle
Worktree `anyvo-heat-overview-ux`, Branch `feat/heat-overview-ux-20261024`.
Basis `86c3d1e2a09952148bfd35a84642ca69be820b78`, bestätigte veröffentlichte
Runtime `1.0.5-motion-v4`. Aktuelle Basis vor OTA erneut durch01 prüfen.

## Umsetzung
- Neue Route `/dog-heat-overview/[dogId]`: ANYVO Header, Hundbezug, Übersicht,
  Beobachtungsformular und Verlauf. Mint statt Pink, flexibles Layout,
  beschriftete Auswahlzustände, Touch-Ziele >=48px in neuen Komponenten.
- Health-/Dog-/Home-Einstieg führt zur Übersicht. Historische Detail-/Phasen-
  und Kalenderfunktionen bleiben unter ihren bisherigen Routen erhalten.
- HeatDogGate lädt vor jeder Route das tatsächliche Hundeprofil (bei Cycle-Links
  über dessen dogId). Nur `gender === 'female'` erlaubt Inhalt; männlich/null/
  unbekannt sind ausgeschlossen. Routen-/Accountwechsel verstecken alte Inhalte
  sofort; verspätete Antworten werden verworfen. Backend-RLS bleibt zuständig.
- Neue Tagesbeobachtungen: vorhandenes dog_heat_observations-Format, kanonische
  deutsche type/value-Werte unabhängig von App-Sprache, freie alte Werte bleiben
  sichtbar. Keine Vorauswahl = keine erfundene Beobachtung.
- Ein INSERT-Statement für alle Beobachtungen eines Formulars. Stabile clientseitige
  UUIDs und exakter Vergleich beim Retry nach unbestätigtem Speichern; kein Upsert,
  kein Löschen, kein Überschreiben vorhandener Beobachtungen. Fehler behalten den
  Entwurf; bis Retry/Verwerfen ist der gesendete Snapshot gesperrt.
- Writes prüfen aktuelle Session, Owner, weibliches Profil und Cycle-Dog-Bindung.
  Leser sehen keine neuen Schreibaktionen. Datumsgrenzen und Doppelklicks geschützt.
- 'Blutung: Keine' ist ausschließlich eine Beobachtung. Ende der gesamten
  Läufigkeit ist eine separate Aktion mit Datum; verändert nur end_date/status/
  updated_at, niemals Notizen/Phasen/Beobachtungen. Optimistische Bedingung auf
  offenem Cycle und Prüfung zurückgegebener ID verhindert falsche Erfolgsmeldung.
- Frühere Läufigkeit eintragen verlangt Enddatum und speichert completed.
- Neue Übersicht beschreibt den dokumentierten Status; keine neue Prognose oder
  medizinische Phasenbestimmung. Bestehende Berechnungen nicht verändert.
- Historische Detailreads propagieren Supabase-Fehler im optionalen Strict-Modus;
  ein fehlgeschlagener Refresh ersetzt vorhandene Phasen/Beobachtungen nicht durch
  Leerlisten. Retry statt falscher Not-found-Meldung, Generation-Guard beim Unmount.
- Kopien für de/en/fr/it/gsw; Schweizerdeutsch enthält konservative deutsche
  Fachbegriffe. Sprachliche und tatsächliche Geräteabnahme nicht behauptet.

## Tests / Nachweise
Gezielte Jest-Suites: neue Screen-, Gate-, Datenfluss- und History-Create-Tests,
plus vorhandene Health-/Heat-/Kalender-/Gender-/Delete-Regressionen.
Die früheren Tests des ersetzten Health-BottomSheets wurden auf Fullscreen-
Navigation/Bestandserhalt umgestellt; Detail-/Kalender-Delete-Tests bleiben erhalten.
Typecheck, ESLint und diff-check werden im finalen Freeze mit Exitcodes und Logs
festgehalten. ESLint-Vorbestand: sechs Home-Warnungen, zwei alte Health-Testwarnungen und zwei alte Kalender-Testwarnungen.
Backend-Vertrag: Repo enthält kein vollständiges aktuelles DDL/RLS/ACL der
Beobachtungstabelle. 05 verlangt aktuelle read-only Introspection; bis zu diesem
Beleg kein vollständiger Release-PASS. Es wird keine Schemaänderung implementiert.
Runtime-Pakete unverändert; node_modules ist nur lokale Tests-Symlink, nicht Quelle.

Expo-v54-Dokumentations-URLs wurden gelesen; Anbieter leitet auf latest weiter.
Keine neueren APIs übernommen: vorhandene SDK54-/ExpoRouter-/ReactNavigation-
Muster sowie installierte TypeScript-Definitionen genutzt, keine Dependencies neu.

## Abnahmegrenzen
Kein Geräte-/Screenreader-/Audio-/Feldtest. Keine Live-DB-Mutation. Vor Veröffentlichung
unabhängiger Review01 + Backendvertrag05 + kompletter Production-Preflight notwendig.
SourceFreeze und geprüfte Belege liegen außerhalb Produktcode unter
`outputs/heat-overview-ux-07-20261024/`.

## Local correction after publication stop — 2026-10-24

Human clarified that prior cycles remain in History; missing next-date/countdown is a display regression, not demonstrated deletion. Explicit permission: local correction and tests only. Further human request: breeding observations, calendar access, clear previous/next cycle overview on Home, and access to correction/deletion. OTA, DB/live QA, commit and push remain stopped.

- Shared HeatForecast restores the existing predictHeat output on Overview, compact Dog/Health cards and Home: localized date, remaining days, today/past handling, rough estimate vs historical intervals. Future starts remain in history but are excluded from observed forecasting inputs. No algorithm change or mutation of records.
- Home shows each female dog's last recorded cycle and next estimate. Strict reads preserve previous results on refresh failure; account changes discard old-account display.
- Explicit breeding section captures observed standing days and free-text discharge via the existing atomic observation insert/retry path. Nothing is preselected or automatically saved.
- Overview shows recorded cycle dates, legacy and structured phases, and dated standing/discharge observations. Calendar directly accessible. Owner correction action opens the existing detail screen with its confirmed deletion flow; no actual records deleted during work.
- Four phases are explained automatically; no inferred current phase or fertile-day claim. Basis: https://www.vet.cornell.edu/dog-estrous-cycles (reviewed 2026-10-24).
- 114 tests / 9 suites PASS, including real prediction calculation, boundary dates, future starts, empty history, refresh errors, breeding save, Home account switch, and existing deletion gates. Focused ESLint exit 0, no output. git diff --check PASS. Final Typecheck exit 0 after correcting test-only renderer type declarations. Evidence in local correction output.
- No device checks; no independent external review yet. Automatic approval review rejected an attempted status message to 01 as unauthorized delegation. No retry or alternative channel used.
- Original V2 freeze remains unchanged. This local delta requires a fresh review/integration before any later release.

## Embedded overview calendar — 2026-10-25

Explicit human request: show calendar directly in heat overview, not only a link.
Added HeatOverviewCalendar above forecast/status, including current month even with no active cycle, month navigation, Today and estimated-start jumps, record/estimate/observation legend, selected day details and navigation to existing record details. Reuses buildHeatCalendarDays/getMonthGrid/predictHeat; no algorithm, backend, tracking, Live-Share or data changes. Forecast remains estimate-only; no invented future heat duration. Five locale labels and screen-reader day descriptions, selected state and non-colour markers.

Validation: 50 tests / 6 suites PASS, Typecheck exit 0, focused ESLint exit 0, git diff --check PASS. No device tests. No commit/push/OTA by 07. Original correction freeze/source preserved; separate additive snapshot in outputs/heat-inline-calendar-07-20261025. Independent review of this delta pending with 01. 01 confirms prior narrow historical forecast review PASS, Android OTA still unpublished as of received report.
