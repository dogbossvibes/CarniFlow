---
name: anyvo-security-review
description: Prüft ANYVO-Authentifizierung, serverseitige Autorisierung, Supabase/RLS, Storage und sensible Datenflüsse. Für Security-Reviews und sicherheitskritische Änderungen.
---

# ANYVO Security-Review

Standardmäßig lesend prüfen. Kein produktiver Angriffstest oder Remote-Schreiben.
Beachte gemeinsame Regeln; Secrets, Standortrohdaten und Gesundheitsdaten weder
in Ausgabe noch in Testfixtures kopieren. Vorhandene Integrationen zuerst prüfen.

## Scope und Vertrauensgrenzen
Prüfe Branch/HEAD/Status. Ermittle betroffene Client-Aufrufe, Backend-Endpunkte,
Migrationen, Datenmodelle und Storage-Regeln. Dokumentiere, welche Identität auf
welche Ressource zugreifen darf: Besitzer, berechtigter Trainer, fremder Account,
anonymer oder abgemeldeter Nutzer. Keine Trainerrechte aus UI-Sichtbarkeit ableiten.
Lokale SQL-Dateien belegen nicht den aktuellen Zustand einer Remote-Datenbank.

## Auftragsbezogene Prüfung
- Server muss Identität und Objektberechtigung prüfen. owner_id, dog_id und
  andere übergebene IDs dürfen keine fremden Ressourcen erschließen.
- Bei Supabase RLS für SELECT/INSERT/UPDATE/DELETE einschließlich USING und
  WITH CHECK, relationale Eigentumsprüfung, Views, RPCs und privilegierte
  Funktionen berücksichtigen. Bei SECURITY DEFINER search_path und Grants prüfen.
- Storage: Bucket-/Objektzugriff, Upload/Download/Delete, signierte URLs,
  Ablaufzeit und Freigaben auch nach Entzug einer Verbindung berücksichtigen.
- Auth-Lifecycle: Token-Erneuerung, Logout, Accountwechsel, lokaler Cache,
  Offline-Warteschlangen, Deep Links und Accountlöschung prüfen.
- Abos, Quoten und Trainerrechte serverseitig durchsetzen; Client-Premium-Gates
  oder manipulierbare Metadaten sind kein Autorisierungsbeleg.
- Keine privilegierten Schlüssel im App-Bundle, EXPO_PUBLIC-Konfiguration oder
  Logs. Keine Secret-Werte ausgeben; Befunde mit redigierten Fundstellen belegen.
- Datenminimierung bei Analytics, Crashreports, Exporten und Standortverlauf prüfen.
  Keine rechtliche Compliance-Zertifizierung aus einem Code-Review ableiten.

## Nachweise und sichere Tests
Je Befund Priorität, konkreten Angriffs-/Fehlerpfad, Fundstelle, Auswirkung,
kleinsten Fix und Regressionstest nennen. Ungeprüfte Vermutungen kennzeichnen.
Wenn Tests beauftragt und eine isolierte Zielumgebung bestätigt sind, mit
synthetischen Accounts A/B, anonymem Zugriff und erlaubter Trainerverbindung
positive und negative CRUD-Fälle prüfen; Testdaten gezielt aufräumen.
Fehlender Testzugriff bedeutet „nicht geprüft“, nicht „sicher“.

## STOP und Abschluss
Bei unklarer Zielumgebung, notwendigen echten Nutzerdaten, destruktiven Schritten
oder nicht freigegebenen Remote-Mutationen den betroffenen Schritt stoppen.
Migration/Fix lokal reviewbar vorbereiten, nicht automatisch anwenden.
Ergebnis: belegte Befunde, abgedeckter Scope, lokale vs. Remote-Nachweise,
Testresultate und verbleibende Risiken. Keine unbelegte Sicherheitsfreigabe.
