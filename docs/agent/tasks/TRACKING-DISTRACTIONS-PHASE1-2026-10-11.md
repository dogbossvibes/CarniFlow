# Verleitungsfährten – getrennte lokale Aufnahme

Status: Implementierung im eigenen Worktree isoliert; finale Typ-/Speicherprüfung und unabhängiger Release-Review offen; nicht veröffentlicht.

Worktree: anyvo-tracking-distractions, Branch feat/tracking-distractions.
Basis/HEAD unverändert: 9b8acb1dbd73c34379cff78d42a256aa2e427e59.
Der frühere Entwurf in anyvo-tracking-active-initiation ist NICHT die Releasequelle.

Direkter Nutzerauftrag in Chat02: erst den Öffnungsfehler übergebener Fährten
beheben, danach Verleitungen wie vorgeschlagen umsetzen, mit05 abstimmen und
nach Prüfung über01 als getrennte iOS-/Android-OTA veröffentlichen.

## Abgrenzung

Der Öffnungsfix liegt getrennt auf der veröffentlichten iOS-Basis9b8acb1 im
Worktree anyvo-transfer-preview-fix: feste160pt-SVG-Vorschau. Exakte isolierte
Prüfung21Suiten191Tests, Typecheck/Lint/diff bestanden. Kein DB-/GPS-Eingriff.
Der Videoablauf zeigt erfolgreichen Empfang und Previewtitel, dann übergroße
Leerfläche. Das Foto mit SOURCE_INCOMPLETE ist ein separater, nicht durch
Layoutänderung behobener Fall. Kein neuer Geräte-PASS.

Verleitungen Stufe1: eigene Ablenkungslinien an einer auf diesem Gerät
vorhandenen eigenen Hauptfährte. Explizite lokale Speicherung; Kontofreigabe,
Cloud-Synchronisation und Aufnahme durch eine zweite Person folgen separat.
Keine neuen Serverrechte, keine Live-DB-Mutation, kein neuer nativer Baustein.

## Datenfluss

Eigene Hauptfährte → Verleitungenansicht → unabhängiger SQLite-Entwurf →
vorhandene zentrale Positionsquelle → separates GPS-Sampling mit vorhandenen
Distanz-/Genauigkeits-/Geschwindigkeitsgrenzen → serialisierte lokale
Checkpoints → gespeicherte gestrichelte Kartenebene.

Hauptfährte, TrackingStore, Marker, Suchlauf, Score, Quota, SyncQueue und
Enderkennung werden nicht mit den neuen Punkten gefüllt. Layer werden nur
an die Kartendarstellung übergeben. Bestehende Lay-/Search-Pipelines unverändert.

Zeit beginnt beim tatsächlichen Start eines leeren Entwurfs. Wetter wird
an der ersten angenommenen Position beim vorhandenen Wetteranbieter abgefragt.
Fehlende Werte bleiben null; Fehler blockieren keine Aufnahme. Legeende ist
explizites Speichern; Liegezeit bezieht sich auf dieses Ende.

Aufnahme ist in Stufe1 ausdrücklich Vordergrundaufnahme. App-Wechsel,
Bildschirmsperre und Verlassen der Ansicht pausieren, verspätete Fixes werden
abgewiesen. Fortsetzen/Neustart beginnt einen neuen Abschnitt. Fehlende
Zwischenwege werden weder verbunden noch in die Distanz aufgenommen.
Es gibt keinen behaupteten Sperrbildschirm-/Feld-PASS.

## Speicherung und Schutz

Additive lokale Migration8: local_track_distractions, eigener Index.
UUID und vorhandene local_UUID-Elternkennungen werden unterstützt. Fixes vor dem tatsächlichen Aufnahmestart werden ohne Schreibversuch verworfen.
Bis32Linien jeHauptfährte und20.000Punkte jeLinie. Jeder Datenzugriff bindet
Nutzer, Auth-Epoche und Hauptfährte; CAS-Revisionen verhindern alte Updates.
Transaktionen schreiben ausschließlich die neue Tabelle. Löschen aller
lokalen Daten umfasst auch diese neue Tabelle, ohne die vorhandene Semantik
anderer Tabellen zu ändern.

Start einer Verleitungsaufnahme während einer Haupt-Lege-/Suchaufnahme wird
abgewiesen. Gleichzeitige Aktionen, Konto-A-B-A, verspäteter Streamstart,
Diskfehler, Pause/Resume und Wetter-/Punktreihenfolge sind Testfälle.

## Plattformen und Release

iOS1.0.4-Basis9b8acb1, Android1.0.4-Basisb28c5fc6. Android besitzt den reinen
Helper features/tracking/utils/trackContinuity.ts noch nicht. Dort benötigt
nur die neue Verleitung dessen Abschnittsaufteilung; Aufnahme dieses Helpers
ändert weder Android-Hauptaufzeichnung noch den bestehenden Transfer-Gap-Guard.
Migrationnummer vor Integration gegen den tatsächlichen Release-Stand prüfen.

ACTIVE-/Consent-/Abo-WIPs ausdrücklich NICHT in das Verleitungspaket übernehmen.
Chat01 alleiniger Publisher; vorher unabhängiger Review, finale Tests,
plattformbezogene Integration und aktuelle Runtime-/OTA-Preflights.

## Vorläufige Belege

- Isolierte Erstprüfung: 7 Suiten / 42 Tests PASS; vollständiger Typecheck PASS.
- Nach Start-/Kennungsregressionen: 6 Suiten / 28 Tests PASS.
- Letzter Stand einschließlich Hundefarbe: 7 Suiten / 36 Tests PASS (inklusive bestehender Kartenebenen). Zahlen überlappen; nicht addieren.
- Vorherige breite Prüfung: ein UI-Zeitlimit auf ausgelastetem Host überschritten; derselbe UI-Ablauf mit 30-s-Testlimit in den obigen finalen Läufen bestanden. Kein Produktzeitlimit verändert.
- Neuer vollständiger Typecheck und ESLint noch laufend; bis Exit nicht als PASS gezählt.
- Hauptfährtenfarbe über vorhandenen useDogTrackColor-Hook, DE/GSW/EN/FR/IT-Texte vorhanden.
- SQLite-Synthetik: sechsChecks bestanden, Elternaufnahme unverändert.
- Native Darstellung, tatsächliche GPS-Feldqualität und Geräteaufnahme offen.
- Code/Tests/Manifest erst nach finaler Prüfung einfrieren.
