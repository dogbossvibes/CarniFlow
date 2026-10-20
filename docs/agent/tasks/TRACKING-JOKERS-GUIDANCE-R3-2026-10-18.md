# Joker-Suchhinweise R3 — 2026-10-18

Gezielte Ergänzung des geprüften Joker/Gummi-R2-Kandidaten für android104, Basis 25dd497c188d1eddeb566ef6989343a4bfe8e085. R2 bleibt unverändert erhalten.

## Befund und Korrektur

Näheres Ball-/Dübel-Ereignis konnte als nächster Suchhinweis ausgewählt werden und reguläre Gegenstände/Winkel wegen des globalen Cooldowns verzögern. Tatsächliche Hooks vor Korrektur: 12/12 neue Konkurrenz-/Joker-only-Tests fehlgeschlagen; unabhängiger Screen-/Engine-Probe von Chat01 bestätigt den Pfad.

run.tsx gibt nur reguläre Gegenstände an die Suchführung weiter. Voice und Haptik schließen Joker zusätzlich defensiv aus, bevor Events ausgewählt/verbraucht werden. Kartendarstellung, Materialerhalt und Bestätigung beim Legen bleiben unverändert. Keine Änderungen an Engineprioritäten, Zeit-/Distanzschwellen, Sensorik, Persistence oder Enderkennung. Bestehende reguläre Guidance-Lifecycle-Tests nutzen jetzt Gummi statt Dübel; keine Assertions entfernt.

## Prüfung

Endstand: 7 Suites / 78 Tests PASS, TypeScript PASS, ESLint 0 Fehler, diff-check PASS. Neue 12 Hookfälle decken Ball/Dübel jeweils vor regulärem Gummi, Linkswinkel oder allein ab, für Voice und Haptik einschließlich disabled→enabled und unveränderter Eingaben. R2-Projektions- und Guidance-Engine-Prüfungen enthalten. Legen-/Karten-Dateien gegenüber R2 unverändert; daraus kein neuer Geräte- oder Audio-PASS. R2-Breitprüfungen bleiben separate, ältere Evidenz.

Vollpatch gegen exakte veröffentlichte Basis sowie kleiner Zusatzpatch gegen eingefrorenes R2 jeweils separat anwendbar und hashgeprüft. Keine Commits/Pushes/OTAs. R4-Live-HTTP-Abnahme bei Chat05 bleibt offen; Review/Release nur über Chat01. Kein Geräte-PASS.
