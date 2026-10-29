# T115: Empfangene Hunde in Health Sharing

Stand: 29.10.2026. Dieser Branch enthält ausschließlich die additive Empfänger-RPC und einen lokalen RLS-Test. Er enthält keine Kundendaten oder Zugangsdaten.

## Gesicherter Code

- Migration `20261029110000_list_received_health_dogs.sql`, SHA-256 `d0f89a9cc509d27690861c3cd4c4a8dc375cd482fe5a0028be46c85feaac1356`, Commit `59d1eab46daa5546ac93d8f132cb1506b906889b`.
- Lokaler RLS-Test: Syntaxkorrektur im `IF`-Block, Commit `20a06caa5a4e325616181cd472f18fe9246ae5a8`.
- Unabhängiger statischer SQL-Sicherheitsreview durch Chat 01: `PASS_STATIC_SQL_SECURITY_REVIEW_RUNTIME_AND_INSTALLATION_GATES_OPEN`, keine Findings. Die Funktion bindet sich an `auth.uid()`, prüft aktive hundespezifische Grants und gibt nur Hunde- und Eigentümer-Anzeigenamen, Laufzeit und explizite Leserechte aus. `PUBLIC` und `anon` erhalten kein EXECUTE.

## Geprüft

- Die vollständige synthetische Health-RLS-Suite lief zusammen mit der Migration in einer lokalen Supabase-Transaktion bis `HEALTH_SHARING_RLS|PASS`; danach wurden Funktion und Fixtures durch `ROLLBACK` entfernt.
- Frischer Production-Preflight im Zielprojekt bestätigte erforderliche Tabellen, Spalten, aktive RLS, Verbindungsprüfung und die zwei bereits vorhandenen Testkonten.
- Nach konkreter Nutzerfreigabe wurde die additive Migration in Supabase Production installiert. Der lesende Nachcheck bestätigte `SECURITY DEFINER`, leeren `search_path`, EXECUTE für `authenticated`, kein EXECUTE für `anon` und unveränderte RLS-Schalter. Die Migration enthält keine Kundendaten-DML.
- Ein eigens genehmigter synthetischer Test-Grant wurde mit ausschließlich `can_view_health_summary` und 15 Minuten Ablaufzeit erstellt und ist abgelaufen. Keine anderen Grants oder Kontorechte wurden geändert.
- Der lokale T115-Anmeldestarter wurde nach dem ersten Test korrigiert: Die macOS-Python-Version 3.9 akzeptierte einen gültigen Ablaufzeitstempel mit fünf Nachkommastellen nicht. Der Parser akzeptiert jetzt ISO-8601-Zeitstempel mit einer bis sechs Nachkommastellen und unterscheidet Parsing-, Ablauf- und Berechtigungsfehler. Elf lokale Parser-Tests und ein unabhängiger enger Review durch Chat 07 bestanden. Der Starter liegt nur im lokalen Projekt-Artefaktverzeichnis; er ist nicht Bestandteil dieses GitHub-Branches.

## Offen / STOP

- Der normale A/B-HTTP-Test meldete `STOP_INACTIVE_GRANT_RETURNED`. Der Parserfehler kann diesen STOP ausgelöst haben; ohne gespeicherte HTTP-Phase ist das nicht abschließend belegt. Ein erneuter Live-Test mit dem korrigierten Starter steht aus. Der erste Grant ist abgelaufen.
- Ein zweiter, auf dieselben synthetischen A/B-Daten begrenzter 15-Minuten-Grant wurde nur vorbereitet und **nicht installiert**. Der Nutzer hat den Test auf später verschoben und ausdrücklich angeordnet, jetzt nichts anzulegen. Für ein späteres Zeitfenster sind neue konkrete Freigabe und lokale verdeckte Eingabe des öffentlichen Keys und der beiden bestehenden Testpasswörter nötig.
- Client-Integration, Plattform-Preflight und iOS-/Android-OTA bleiben offen. Chat 01 koordiniert die Integration und Veröffentlichung erst nach vollständigem A/B-PASS und Release-Preflight. Gerätetests sind gemäß Nutzerwunsch nachgelagert.
- Keine weiteren Production-Zugriffe allein für die GitHub-Sicherung. Keine Änderungen an Kunden-, Bestands- oder Kontorechten.
