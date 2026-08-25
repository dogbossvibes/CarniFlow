# CODEX — P0-FIX-01 REVIEW

## 1. Verdict

APPROVED WITH CORRECTIONS

P0-FIX-01 ist als vorbereitender Dokumentationsschritt akzeptabel: Es wurde keine erfundene Baseline erstellt, keine SQL-Datei angelegt und keine Produktlogik geaendert. Korrekturbedarf besteht bei der Migration-History-Reconciliation und bei der expliziten Abgrenzung, dass eine Baseline-Datei nicht gegen eine bereits existierende Production-DB ausgefuehrt werden darf.

## 2. Scope Verification

- `git diff --stat` zeigt nur bereits bestehende tracked Aenderungen an `app/track/legen.tsx` und `docs/adr/ADR-001_Domain_Model.md`.
- `git diff` zeigt keine tracked Aenderung an `supabase/migrations/README.md`, weil `supabase/migrations/` aktuell untracked ist.
- `supabase/migrations/` wurde additiv angelegt und enthaelt aktuell nur `README.md`.
- Es existiert keine Baseline-SQL-Datei unter `supabase/migrations/`.
- Es gibt keinen Hinweis, dass untracked ZIP/PNG/ADR-Dateien geloescht wurden; sie erscheinen weiterhin im `git status`.
- `app/track/legen.tsx` und `docs/adr/ADR-001_Domain_Model.md` sind weiterhin geaendert, aber diese Diffs sind nicht Bestandteil von P0-FIX-01.

## 3. Correct Findings

- Die README sagt klar, dass sie selbst keine Migration und keine Baseline ist.
- Die README trennt korrekt zwischen Root-`*.sql`-Dateien und Remote Database Truth.
- Die README beschreibt korrekt, dass PostgREST/Anon-Checks Tabellen und Spalten plausibilisieren koennen, aber keine vollstaendige DDL-Wahrheit fuer Constraints, RLS, Policies, Trigger, Functions und Indizes liefern.
- Die README haelt fest, dass die echte Baseline wegen fehlender lokaler/remote Voraussetzungen blockiert ist: kein Docker, kein `pg_dump`, kein `psql`, kein Service-Role-Zugriff und kein DB-Passwort.
- Der aktuelle Ordner `supabase/migrations/` enthaelt keine erfundene Baseline und keine ausfuehrbare SQL-Migration.
- Die Angaben "11 Remote-Migrationen" und "Remote-Historie endet 2026-06-01" sind durch die vorhandenen Analyseartefakte konsistent belegt, aber in diesem Codex-Review nicht unabhaengig remote verifiziert. Status: NOT INDEPENDENTLY REMOTE VERIFIED IN THIS REVIEW.
- Die gemeldeten Testresultate sind plausibel, weil P0-FIX-01 nur Markdown/Review-Dokumentation betrifft. Sie wurden in diesem Review nicht erneut ausgefuehrt.

## 4. Required Corrections

- Die README muss klarer sagen, dass `00000000000000_baseline.sql` nicht automatisch die 11 bereits remote registrierten Supabase-Migrationsversionen ersetzt.
- Die Aussage "`supabase migration list --linked` -> Local == Remote" ist in der aktuellen Form irrefuehrend. Eine einzelne Baseline-Datei mit Version `00000000000000` erzeugt nicht automatisch Gleichstand mit Remote-Versionen `202605...` und `202606...`.
- Es fehlt ein expliziter Reconciliation-Plan fuer die Supabase-Migration-History, zum Beispiel lokale Stub-/Archivdateien fuer die 11 Remote-Versionen oder ein dokumentierter `migration repair`-Ablauf. Keine Repair-Befehle duerfen ohne separate Freigabe ausgefuehrt werden.
- Die README muss ausdruecklich festhalten, dass eine echte Baseline-Datei nur den Ist-Zustand fuer neue lokale/Review-Umgebungen repraesentiert und nicht gegen die bereits existierende Production-DB ausgefuehrt werden darf.
- Die Objektabdeckung sollte explizit um Views, Types/Enums und Sequences ergaenzt werden. `pg_dump --schema-only --schema=public` kann diese erfassen, aber die README listet sie im Zielbild nicht vollstaendig.
- Die `pg_dump`-Anleitung sollte Secrets nicht als Connection-URI mit Passwortplatzhalter in einem Shell-Befehl nahelegen. Besser: Passwort interaktiv eingeben, `.pgpass` verwenden oder eine temporaere Umgebung ohne persistente Shell-History nutzen.
- Falls Grants/Privileges fuer die Runtime relevant sind, muss dokumentiert werden, dass `--no-privileges` diese bewusst auslaesst und wie sie separat bewertet werden.

## 5. Baseline Strategy Review

Die README ist als Vorbereitungsdokument geeignet, weil sie keine falsche Baseline erfindet und die Remote-DB nicht veraendert. `pg_dump --schema-only` ist grundsaetzlich der richtige Weg, um eine datenfreie Schema-Baseline zu erzeugen, sofern er gegen die richtige Remote-DB, das richtige Schema und ohne Datendump verwendet wird.

Eine robuste Baseline muss mindestens Tabellen, Spalten, CHECK Constraints, Foreign Keys, Indizes, Views, Functions, Triggers, RLS Enable/Disable Status, Policies, Types/Enums und Sequences abdecken. `pg_dump --schema-only --schema=public` deckt diese Objektklassen grundsaetzlich ab; die README sollte die Vollstaendigkeit aber expliziter machen.

Das Naming `00000000000000_baseline.sql` ist als lokale Baseline-Konvention nachvollziehbar, aber nur dann sicher, wenn ihr Zweck klar begrenzt ist: Rekonstruktion des Ist-Zustands fuer neue Umgebungen oder Review, nicht erneute Anwendung auf die existierende Production-DB.

Production-Sicherheit ist noch nicht ausreichend dokumentiert. Es muss klar sein: keine `db push`-Anwendung der Baseline gegen Production, kein `db reset` gegen Remote, keine destructive Statements und keine Migration-History-Reparatur ohne separaten, geprueften Plan.

## 6. Supabase Migration History Risk

Kann eine einzelne `00000000000000_baseline.sql` die bereits vorhandenen 11 Remote-Migrationsversionen korrekt ersetzen?

NEIN.

Supabase Migration History arbeitet versionsbasiert. Eine lokale Datei `00000000000000_baseline.sql` entspricht nicht den remote registrierten Versionen `20260530175624` bis `20260601005614`. Dadurch wird `Local == Remote` nicht automatisch wahr. Es braucht zusaetzlich einen expliziten Reconciliation-Schritt: entweder passende lokale Dateien fuer die remote bekannten Versionen, eine bewusst dokumentierte Repair-Strategie oder eine andere klare Trennung zwischen Baseline fuer neue Umgebungen und bereits existierender Remote-History.

## 7. Architecture Status

P0-FIX-01:

PARTIALLY COMPLETED

Die Vorbereitung ist abgeschlossen: Ordner und README existieren, es gibt keine erfundene SQL-Baseline. Die eigentliche Remote-Schema-Baseline ist weiterhin blockiert, weil die notwendigen Credentials/Tools fuer einen vollstaendigen Schema-Dump fehlen.

ADR-002:

PROPOSED

ADR-002 darf noch nicht Accepted sein, weil die echte Remote-Baseline und die Migration-History-Reconciliation weiterhin offen sind.

## 8. Next Action

Darf P0-FIX-02 jetzt begonnen werden?

JA.

P0-FIX-02 darf als read-only Datenabgleich und Entfernungsplanung begonnen werden. Die fehlende echte DB-Baseline muss parallel als offener P0-DB-Track weitergefuehrt werden. Sie blockiert aber jede SQL-Migration, jeden DROP, jede Remote-Aenderung und jede irreversible Entfernung von Legacy-Daten oder Runtime-Code, die von unbewiesenen Schemaannahmen abhaengt.
