# Einmalige Übungsauswahl – 07 – 2026-10-21

## Auftrag und geprüfte Basis

Der Nutzer beauftragt einmalige Auswahl nach Übungsname, vorherige Hinweise, heutige Beobachtung und nächsten Hinweis; bewusst benannte Unterschiede bleiben getrennt. Umsetzung, GitHub-Sicherung und OTA sind ausdrücklich freigegeben, Geräteprüfungen zurückgestellt. 07 sole Writer in `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-journal-all-disciplines`, Branch `fix/journal-all-disciplines`, sauberer Ausgangs-HEAD `bc44698965a8690aa811e49615bb49922a3dc661`. Scope mit00 reserviert. Keine Änderungen an sources/globalen Statusdokumenten.

## Ursache und konkrete Änderung

Frühere Vorlagenauswahl hinterließ gleichnamige Registry-IDs. Der neue geführte Ablauf behielt die technische Variantenwahl bei. Im Neuanlegen bietet er nun eine direkte Auswahl je trim/lowercase-Namensgruppe. Keine automatische Nummerierung oder zusätzliche Auswahl. Bereits ausgewählte/restaurierte IDs haben Vorrang, danach die zuletzt in der geladenen aktuellen Hundehistorie verwendete ID, bei fehlender Historie eine stabile vorhandene ID. Unterschiedlich benannte Übungen bleiben eigene Optionen. Kein Registry-Insert, Rename, Delete oder serverseitiger Merge für diese Auswahl.

Erneute Auswahl einer bereits gewählten Namensgruppe im Neuanlegen ist idempotent: Beobachtungen und nächste Hinweise bleiben erhalten. Entfernen bleibt explizit über die ausgewählte Karte. Bestehende Trainingsbearbeitung/Verwaltung behält ihre ID-genaue Auswahl; historische Ergebnisse werden niemals nach Namen verbunden oder umgeschrieben. Frühere Hinweise werden weiterhin für Hund/Sparte unabhängig von der für heute gewählten ID angezeigt. Die Historienanzeige bleibt ID-genau, Quellnavigation und atomarer Speicher-/Retry-/Quota-Vertrag unverändert. Keine DB-, Native-, Abhängigkeits-, Übersetzungs- oder Trackingänderung.

## Prüfungen und Grenzen

Owner-Cold-Regressionslauf ohne Cache:21 Suites/264 Tests PASS,0 Fehler/Skipped. Enthält6 neue Regressionen: direkte Auswahl ohne Nummern, restaurierte ID bei neueren gleichnamigen Einträgen, stabiler Fallback unabhängig Reihenfolge, bewusst benannte Unterschiede, aktuelle Hundehistorie + alter Hinweis anderer ID + getrennte neue Beobachtung/Fokus im atomaren Request und unveränderte alte Datensätze, Doppeltipp/erneute Auswahl ohne Datenverlust. Bestehende Konto-/Hundwechsel-, Draft-, Timer-, Resume-, Offline-/Retry-, History-, Help-/i18n-Tests enthalten. Keine neuen Laufzeit-/Geräte-/Live-API-Prüfungen; Gerätetests ausdrücklich zurückgestellt.

Typecheck/Lint/Diff-Ergebnisse und finale Commit-/Quellhashes werden im Freeze unter `outputs/training-single-choice-07-2026-10-21/` im Projektordner gebunden. Der Bericht allein ist keine Veröffentlichungsevidenz. 01 führt unabhängigen Review, frische plattform-/runtimebezogene Production-Preflights und Publikation aus;00 normale GitHub-Sicherung. Kein Push, Build, Merge, OTA oder DB-Schreibzugriff durch07.

## Dokumentation

Repo verlangt SDK54-Dokumentation vor Code: versions/v54 URLs geprüft, aktuell Redirect auf latest; deshalb die originale Expo-SDK54-Dokumentation über offiziellen Repositorybranch sdk-54 gelesen (`docs/pages/versions/v54.0.0/sdk/crypto.mdx`). Keine neuen Expo-APIs eingeführt. Temporärer eigener node_modules-Link nur für Prüfungen, vor Freeze entfernt.
