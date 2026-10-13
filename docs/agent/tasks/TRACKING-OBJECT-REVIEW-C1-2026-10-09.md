# Gegenstandskorrekturen V1: C1 Cold-cache Offline-Fix

2026-10-09 · Owner02 · Implementiert/lokal geprüft, unabhängiger Review noch offen.
Basis87d5e2b3b3ed931b655464eec971b95225dcf0ff, Branchfeat/tracking-object-review-v1,
Worktree anyvo-tracking-object-review-v1 im ChatGPT-Projektspiegel.

## Ursache und Reproduktion

01 belegte: Im ersten FullClient existiert ohne gecachte bestätigte Review-Basis kein
Offlinepfad zum Verwerfen einer automatischen Erkennung. Der frühere lokale Pfad wurde
zum Schutz der Originaldaten entfernt; initialize benötigt Netzwerk, enqueueReview eine
bestätigte Revision. Der neue Cold-cache-UI-Regressionstest wurde VOR dem Fix ausgeführt:
1FAIL/7PASS (Verwerfen-Schaltfläche fehlt). Beleg outputs/OBJECT-REVIEW-C1-REPRO.log.

Vor Änderungen wurden sämtliche36Filehashes des bisherigen fc5c/4eb1-Freeze geprüft.
Ein unveränderter Vergleich wurde unter outputs/object-review-c1-before gesichert.
Snapshot-OTAs und andere Writer blieben unberührt; keine parallelen FullRuntime-Transfers.

## Verhalten nach Korrektur

- Ohne gecachte Basis kann der Eigentümer im dargestellten, abgeschlossenen Run dessen
  vorhandene automatische Erkennungen zum Verwerfen vormerken. Exakte run_id/session_id,
  Abschlusszeit und tatsächlich gespeicherte Detection-IDs werden geprüft. Keine Erfindung
  von IDs oder Ableitung von Identitäten aus Koordinaten/Indizes/Fundzahlen.
- Eine Vormerkung ist explizit als lokal/noch unbestätigt sichtbar. Sie bleibt in der eigenen
  vorhandenen Review-Outbox über Navigation, Offline-Neustart und Kontowechsel erhalten.
  Bestätigte Zustände/Gesamtscore werden nicht optimistisch als Servererfolg angezeigt.
- Mehrere Verwerfungen können nacheinander offline hinzugefügt werden. Jede Fassung erhält
  eine neue UUID; die vorige bleibt archiviert mit Verweis auf die Nachfolgeoperation.
  Der originale Aufnahme-JSON wird niemals umgeschrieben.
- Die vorhandene eindeutige offene Operation pro Eigentümer/Run gilt auch für Cold-cache-
  Vormerkungen. Parallele/alte Schreibversuche scheitern, statt Änderungen zu verlieren.
- Ein Cold-cache-Eintrag hat expectedRevision:null und wird NIEMALS an apply RPC gesendet.
  Nach Wiederverbindung darf seine bereits explizit beauftragte Basis vorbereitet werden.
  Danach wartet er auf Zuordnungsbestätigung; keine automatische Zuordnung/Neubewertung.
- Bei alten Aufnahmen können lokale Erkennungs-IDs und Servermarker-IDs unterschiedlich sein.
  Deshalb wählt der Nutzer für jede Vormerkung ausdrücklich den gemeinten Servergegenstand.
  Kein vorgewählter Treffer anhand Reihenfolge/Geometrie. Vorhandene gleiche Kennungen
  führen ebenfalls nicht zu einer stillen Zuordnung. Auswahl kann abgebrochen/zurückgesetzt
  werden, ohne die Vormerkung zu löschen. Ist der bestätigte Stand bereits richtig, kann
  der Nutzer ihn ausdrücklich übernehmen und die Vormerkung zurückziehen.
- Erst die ausdrückliche Bestätigung erzeugt eine neue RPC-Operation mit exakter Basisrevision
  und eigener UUID. Originalabsicht archivieren + neue Operation anlegen erfolgen atomar in
  withExclusiveTransactionAsync. Fehler, UUID-Kollision oder überholte Revision rollen beides
  zurück. Die bestehende Lost-ACK-/Retry-/Konfliktlogik behält anschließend dieselbe RPC-UUID.
- Fremde Eigentümer/Runs/Hunde sehen keine Vormerkungen. Kontextwechsel verwerfen nur die
  ungespeicherte Zuordnungsauswahl; gespeicherte Absichten bleiben erhalten. Fehlender Backend-
  Vertrag oder noch unvollständiger Parent/Marker-Sync bleibt sichtbar/retrybar, ohne Datenverlust.

Die Offline-Verwerfung ist damit wieder dauerhaft erfassbar. Ohne bestätigte Basis ist sie
bewusst eine lokale Vormerkung; der spätere bestätigte Verlauf erfordert eine explizite
Zuordnung. Vorbereitete Absichten werden nicht als bereits korrigierte Messdaten ausgegeben.

## Scope und Plattformgrenzen

C1 betrifft localIntent-Modell, bestehende Repository-/Service-/Hook-/UI-Schicht, Detailrun-
Übergabe, ÜbersetzungenDE/EN/FR/IT (GSW bestehenderFallback) und Tests. R2-Backendvertrag und
bestehende SQLite-Migration7 bleiben BYTEIDENTISCH; keine neue Migration/Native-Abhängigkeit.
Snapshot-/Recorder-/Winkel-/GPS-/Fusion-/Bewertungslogik und Exportcode sind unverändert.

Diese Revision ersetzt den bisherigen FullClient-Freeze fc5c7163/Delta4eb1fbd8 für künftige
Integration. Die alten Patchdateien bleiben als unveränderte historische Belege erhalten.
Drei neue Artefakte: kompletter FullClient gegen87d5, Delta gegen Snapshot59805a84 und enger
C1-Fix gegen den alten vollständigen Freeze. Exakte Hashes/Dateiliste im neuen C1-Manifest.
Nicht mehrere dieser alternativen Patches übereinander anwenden.

## Tests und Beweisgrenzen

- Vorher gezielte Cold-cache-Reproduktion:1FAIL/7PASS; nachher RegressionPASS.
- Vollständiger bestehender Client-Prüfumfang plus neue Regressionen:18Suites/210TestsPASS.
- Explizites Android-Jest-Preset für Model/Repository/Service/Cold-cache/Hook/UI separat;
  tatsächliche Anzahl/Abschluss im Freeze-Manifest. Kein nativer Gerätebeleg.
- Reale lokale Node-SQLite-Ausführung: Dateidatenbank schließen/öffnen, Original-JSON erhalten,
  Owner-/Hund-/Run-Isolation, gemeinsame offene-Operation-Grenze, CAS gegen alte Absichten,
  atomare Folgefassungen, veraltete Serverrevision, doppelte UUID mit Rollback.
- Service+Repository integriert: Offline ohne Cache, zwei Vormerkungen, Wiederverbindung,
  unterschiedliche lokale/Server-IDs, keine automatische RPC-Anwendung, explizite Zuordnung,
  verlorenesACK und unveränderterRetry, Originalerhalt, alle alten Absichten weiter vorhanden.
- Kontowechsel während Basisanfrage wird vor Cache/Bestätigung erkannt. Warm-cache-Offline,
  bestehende Sync-/Recorder-/Export-/Konfliktprüfungen bleiben enthalten.
- Vollständiges tsc --noEmit tatsächlicherExit0; ESLint0Fehler/4bereits bestehendeWarnungen;
  git diff --checkPASS. Hashes und Patch-/Reversechecks sieheManifest.
- Frühere5PDFTests/visuellePDF-Abnahme und92R2-Backendtests sind historische, nicht neu
  ausgeführte Belege. Betroffene Export-/SQLite7-/Snapshotdateien auf Unverändertheit geprüft.
- Bestehende Grenze: archivierte/zurückgezogene lokale Outboxfassungen bleiben dauerhaft
  gespeichert, haben aber noch keine eigenständige Verlaufverwaltung in der UI. Sie werden
  nicht gelöscht oder automatisch in den bestätigten Serververlauf umgedeutet.

## Übergabe und Freigaben

01 bleibt alleiniger unabhängigerReviewer/Integrator/Committer/Publisher. C1-Gate erst nach
unabhängiger Abnahme schließen. R2-DB-Freigabe, frischer Deployment-/RLS-/Schema-Postflight,
Native-/SQLite-Geräteupgrade, Accountwechsel/Offline-Reconnect auf echten Geräten sowie
Runtime-spezifische FullClient-Adaptionen bleiben offen. VollUI nicht allein wegen lokalem
C1PASS ausliefern. Nutzer-OTA-Freigabe ersetzt keine DB-/Build-/Storefreigabe.

Keine eigenen Commits/Pushes/Merges/OTAs/Builds/Store-/DB-/Restore-Schritte. Kunden-/Originaldaten
wurden weder gelesen noch geändert; SQLite-Tests verwendeten ausschließlich synthetische Daten.
