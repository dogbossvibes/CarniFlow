# Verbindlicher Inhaltsabgleich vor Releases

Direkter Nutzerauftrag im SDK58-/OTA-Chat vom 04.11.2026: Funktionsstände
vereinheitlichen und dauerhaft verhindern, dass freigegebene Verbesserungen
beim nächsten Build fehlen. Diese Regel ergänzt die bestehenden Prüfungen und
erteilt keine Commit-, Push-, Build-, OTA-, Store- oder Datenbankfreigabe.

## Ein Funktionsumfang, nachvollziehbare Plattformstände

Die vorhandenen Taskberichte und der kanonische MASTER bleiben die
Aufgabenverwaltung. Pro Release wird daraus eine versionierte Soll-Inventur
abgeleitet: bereits ausgelieferte gemeinsame Funktionen, zusätzlich zur
Übernahme freigegebene Pakete und ausdrücklich bestätigte Plattformausnahmen.
Ein SDK-/Runtimewechsel darf diesen Umfang nicht stillschweigend verkleinern.
Ein älterer nativer Build ist allein keine vollständige Funktionsbasis: Seine
später ausgelieferten OTAs müssen ebenfalls berücksichtigt werden.

Diese Inventur wird unabhängig vom Kandidaten geprüft und eingefroren.
Die Dateiliste des Kandidaten oder seine bestandenen Tests dürfen die Soll-Liste
nicht selbst definieren. Eine unbekannte oder unvollständige Inventur ergibt
keinen Vollständigkeits-PASS. Zurückstellungen benötigen einen konkreten
Scope, Grund und belegte Entscheidung; bestehende Funktionen werden nicht
allein wegen einer anderen Runtime zu optionalen Funktionen.

## Drei getrennte Zustände je Paket

1. **Umgesetzt:** Quellstand, bestehender Taskbericht, Dateien und Tests bekannt.
2. **Im Release integriert:** Zielplattform/-runtime, Kandidaten-Commit/-Tree und
   Übernahmenachweis bestätigt. Zulässig ist enthaltene Commit-Abstammung oder
   ein unabhängig geprüfter Port mit gebundenem Quell- und Zielstand. Eine
   fehlende Original-SHA allein beweist noch keine fehlende Funktion.
3. **Ausgeliefert:** Tatsächliche native Build-ID beziehungsweise OTA-Group- und
   Update-ID, Runtime und Plattform nachgewiesen. Geräteempfang und
   Geräte-/Feldabnahme bleiben davon getrennte Nachweise.

"DONE", ein lokaler Commit, ein erfolgreicher Typecheck und ein erfolgreicher
Cloud-Build sind kein Ersatz für diese Unterscheidung.

## Pflicht vor dem nächsten neuen Releaseauftrag

- 00 hält den vereinbarten Soll-Umfang in der bestehenden Verwaltung fest.
  Die Werkstatt/Fachchats liefern die Paket- und Portnachweise. 01 integriert
  und veröffentlicht weiterhin als einziger Publisher; keine parallelen Writer.
- Vor einem nativen Build oder einer OTA wird die vollständige Abdeckung der
  eingefrorenen Soll-Inventur am tatsächlichen Kandidaten geprüft. Fehlende
  Pakete, ungeklärte Ports oder widersprüchliche Ziele blockieren den Start.
- Tests, unabhängiger Review, Export und Veröffentlichung beziehen sich auf
  denselben geprüften Quellstand. Änderungen danach erfordern einen erneuten
  Abgleich der betroffenen Nachweise, keinen stillen Wechsel des Kandidaten.
- Native Kompatibilität, Versionen/Buildnummern gegen die echten Stores,
  Signing, Backend, Runtime, Kanal, Datenhaltung und bestehende Release-Guards
  bleiben zusätzlich Pflicht. Inhalts-PASS ersetzt keine Nutzerfreigabe.
- Der Abschluss nennt enthaltene Pakete, bekannte Auslassungen und tatsächliche
  Auslieferungsbelege. Ohne vollständige Inventur keine Aussage wie
  "alle neuen Änderungen enthalten" oder "vollständiger Kundenstand".

Bereits separat autorisierte und gestartete Fehlerkorrekturen werden nicht um
weitere Funktionen erweitert. Ihr enger Umfang und bekannte Integrationslücken
müssen ausdrücklich erkennbar bleiben; sie gelten nicht als Gesamtfreigabe.

## Automationsstatus und konkreter Regressionfall

Die verbindliche Regel gilt ab sofort. Der Offline-Checker
`scripts/check-release-content.mjs` ist im kanonischen `scripts/preflight.mjs`
vor den teuren technischen Prüfungen eingebunden. Der kanonische Lauf umfasst
24 bestandene Tests ohne übersprungene Fälle, einschließlich des historischen
Trainingsfehlers, des Schutzes der Build58-Fährtenbasis und des frühzeitigen
Stopps ohne Manifest. Die tatsächliche erste Soll-Inventur ist weiterhin
unvollständig und darf nicht als freigegeben eingetragen werden.

Die verwalteten npm-Einstiege für EAS-Builds und Entwicklungs-/Preview-OTAs
laufen jetzt über `scripts/release-command.mjs`. Der direkte Production-Wrapper
prüft `scripts/release-entry-gate.mjs` selbst, vor weiteren Releasearbeiten und
nochmals unmittelbar vor dem Publish. TestFlight-Upload und Kundenabnahme haben
getrennte Einstiege; kein automatisches Submit beim Build. Der Kundencheck
veröffentlicht selbst nie etwas.

Die erste vollständige Soll-Inventur ist weiterhin nicht freigegeben. Die
mitgelieferte `release-policy.json` steht deshalb ausdrücklich auf `complete:false`.
Sie ist KEINE Freigabe und nennt die offenen Geräte-/Absturzbefunde. Ohne eine
unabhängig versionierte, freigegebene Policy bleiben die neuen Einstiege gesperrt.

**Technische Grenze:** Diese lokalen Programme können direkte Aufrufe eines
extern installierten EAS-CLI, ältere Worktrees ohne diese Änderungen oder manuelle
Freigaben im Apple-/Google-Portal nicht abfangen. Für eine nicht umgehbare
organisationsweite Sperre müssen Schreibrechte ausschließlich beim überprüften
Release-Dienst liegen und alle benutzten Release-Checkouts dieses Tooling erhalten.
Diese Rechte-/CI-Umstellung ist hier weder erfolgt noch als erledigt behauptet.
Ein lokaler Kundencheck ist kein serverseitiger Store-Freigabehaken.

Pflichtfall für die technische Prüfung: Die Soll-Liste enthält den bereits
ausgelieferten Trainings-Hub `d67773bec61fcc4999496db1095daf5da07776d2`.
Build-59-Quelle `00376126dbcf537d8a96131a1e6aed548dba8a02` enthält stattdessen
den alten Trainings-Einstieg und keinen geprüften Port. Ergebnis muss **BLOCK**
sein. Fehlende oder als unvollständig markierte Soll-Inventur muss ebenfalls
blockieren. Ein nachgewiesener, geprüfter Port darf bestehen, obwohl seine
Original-SHA nicht Vorfahre des Kandidaten ist.

Der konkrete Befund steht in [BUILD59_CONTENT_AUDIT.md](BUILD59_CONTENT_AUDIT.md).

### Lokaler Aufruf

Für reine Entwicklungsprüfungen ohne Inhalts- oder Releasefreigabe:

```sh
node scripts/preflight.mjs --development-checks-only
```

Vor einem Release müssen alle sieben Angaben aus der unabhängig festgelegten
Soll-Inventur beziehungsweise dem geprüften Kandidaten kommen:

```sh
node scripts/preflight.mjs \
  --inventory-commit <festgelegter-Soll-Commit> \
  --inventory-path <versionierter-Soll-Pfad> \
  --inventory-sha256 <unabhaengig-gepruefter-Soll-Hash> \
  --manifest <Kandidatenmanifest-Datei> \
  --commit <exakter-Kandidaten-Commit> \
  --platform <ios-oder-android> \
  --runtime <exakte-Zielruntime>
```

Die spitzen Klammern kennzeichnen nicht ausführbare Platzhalter. Der Kandidat
muss der saubere aktuelle HEAD sein. Ohne diese Angaben stoppt der Preflight
vor Typecheck, Lint, Jest und sonstigen kostenintensiveren Prüfungen. Die
explizite Entwicklungsoption darf nicht als Ersatz für einen Inhaltsnachweis
oder als Erlaubnis zum Build/Publish verwendet werden. Tests des Checkers:
`node --test scripts/__tests__/releaseContent.node.test.mjs`.

Ältere Produkt-Worktrees dürfen ihre alte Preflight-Kopie nicht als Ersatz für
diese Regel verwenden. Bis zur gezielten Tooling-Übernahme kann der kanonische
Checker auch aus ihrem tatsächlichen Release-Arbeitsverzeichnis über den
absoluten Pfad gestartet werden:
`node /Users/moyo/canisflow-worktrees/anyvo-main/scripts/check-release-content.mjs`
mit denselben sieben Pflichtangaben. Er prüft den aktuellen Arbeitsstand dieses
Verzeichnisses; die übrigen technischen Prüfungen bleiben dort zusätzlich
erforderlich. Das ist kein automatischer Aufruf durch EAS selbst.

## Vorrangige Schutzbasis: Fährtensystem aus Build58

Direkter anschließender Nutzerauftrag vom 04.11.2026: Das Fährtensystem aus
Build58 muss unbedingt erhalten bleiben. Verbindliche iOS-Quelle:
`6722b88fded3fb6936472996dd40d6f4dde453f2`, erfolgreiches EAS-Binary
`802c7cde-b348-4bd5-865b-9abd2d2c495a`. Der ältere fehlgeschlagene
Build58-Versuch ist keine alternative Quelle.

Der Quellvergleich mit Build59/`00376126` bestätigt 714 identische Git-Dateien
in den geprüften Fährten-, Native-Modul-, lokalen Speicher- und Syncbereichen.
Das ist ein Quellnachweis, keine neue Geräte-/Feldabnahme.

Geschützte Bereiche: `app/track/`, `features/tracking/`,
`features/tracking-distractions/`, `features/tracking-exchange/`,
`features/tracking-planner/`, `features/tracking-sharing/`,
`modules/anyvo-motion/`, `modules/anyvo-gnss/`,
`modules/anyvo-resting-activity/`, `lib/localDb/`, `features/sync/`.
Nicht vorhandene Modulpfade werden nicht als vorhanden behauptet; der Schutz
muss auch hinzugefügte, entfernte oder umbenannte Dateien in diesen Bereichen
erkennen. Eine vollständige neue Tracking-Implementierung an einem anderen Ort
ist keine zulässige Umgehung des Erhaltsauftrags.

Die unabhängig festgelegte Soll-Inventur muss diese Schutzbasis ebenfalls
binden. Alte Trackingpakete werden bei Bedarf als durch die geschützte Basis
ersetzt dokumentiert. Ein allgemeiner Portreview oder eine alte UI-Freigabe
berechtigt nicht dazu, diese Trackingbasis zu verdrängen. Bei einer Abweichung
ist eine erneute ausdrückliche Entscheidung erforderlich. UI-Nacharbeit muss
klein bleiben; kein Merge eines gesamten älteren Releasebranches.

## Automatischer Abgleich aller aktiven Runtimes

Der Koordinator legt den versionierten Stand von `docs/agent/release-policy.json`
über die gemeinsame Git-Referenz `refs/anyvo/release-policy` fest. Diese Referenz
ist in allen Worktrees desselben Repositorys gleich; der Kandidat darf keine
alternative Policy über einen Schalter wählen. Der Plan muss genau diesen
Policy-Commit und deren Inventurreferenz nennen. Eine neue Policy macht ältere
Pläne und Gerätebelege ungültig. Die erste Festlegung benötigt die vollständige
Inventur und eine eigene Commitfreigabe; es wurde kein Commit/Ref erzeugt.

Zusätzlich liest jeder Einstieg die EAS-Channelzuordnung und die neuesten 50
OTA-Gruppen der ausdrücklich inventarisierten Branches frisch. Ohne Plattform-
oder Runtimefilter: Eine neue OTA für Build58 verändert den Fingerabdruck und
blockiert damit auch einen vorbereiteten Build59-Stand. `production` ist Pflicht,
der jeweilige Zielkanal ebenfalls. Fehlgeschlagene Abfragen blockieren. Die Liste
ist ein Änderungsindikator, keine vollständige historische Funktionsinventur.
Diese bleibt separat verpflichtend. Produktion wird unmittelbar vor Ausführung
nochmals geprüft; Build/Upload/Kundencheck verwenden denselben lokalen Lock wie
Production-OTAs. Externe Publisher auf anderen Rechnern sind davon nicht gesperrt.

## Eingänge und Belege

`ANYVO_RELEASE_PLAN` zeigt auf eine externe JSON-Datei. Gemeinsame Pflichtfelder:
`schemaVersion:1`, `operation`, `policyCommit`, `sourceCommit`, `inventory`,
`platform`, `runtime`, `profile`, `channel`, `environment`, `manifest` und
`qualityEvidence`. Relative Belegpfade beziehen sich auf die Plan-Datei.
`manifest` entspricht dem vorhandenen Inhaltschecker, `qualityEvidence` dem
vorhandenen Quality-Checker. Kandidat muss sauberer tatsächlicher HEAD sein.
Profil, explizites Environment, Kanal, aufgelöste Expo-Runtime und EAS-Projekt
werden geprüft; keine stillen Default- oder Backendwechsel. Die bisherigen
Production-Supabase-, Native-, Runtime-, Ancestry- und Postflight-Guards bleiben.

Die Policy enthält `schemaVersion:1`, `complete:true`, unterschiedliche
`preparedBy`/`approvedBy`, `projectId`, `inventory`, `openBlockers` sowie `live`:
Einträge mit `channel`, `branch`, `fingerprint`. Der Fingerabdruck wird durch
`liveFingerprint(channelView, updateList)` aus frisch gelesenen EAS-Antworten
gebildet und unabhängig mit der Inventur festgelegt. Keine automatisch erfundene
PASS-Inventur und kein Rücksetzen der offenen Befunde durch den Kandidaten.

Operationen:
- `build`: vorhandene npm-Buildskripte; explizite Plattform/Profil. Kein Auto-Submit.
- `update`: Entwicklungs-/Preview-OTA; niemals Production über diesen Einstieg.
- `production-ota`: bestehender `update-production.mjs`, alle alten Guards zusätzlich.
- `submit`: `npm run release:submit:ios` lädt nur die konkret benannte iOS-Build-ID
  nach TestFlight. Kein `--latest`, kein Android-Track-Release, keine Kundenfreigabe.
- `customer-check`: `npm run release:check:customer` prüft die Kundenabnahme;
  führt niemals eine Store-Freigabe aus.

`--dry-run` an den verwalteten Befehlen prüft nur. Es umgeht keine Nachweise und
kann lesende EAS-Abfragen benötigen. Es gibt keinen `--skip`-Releaseweg. Reine
Entwicklungschecks mit dem bisherigen `--development-checks-only` berechtigen
weiterhin zu keinem Build/Release.

## Echte Geräteabnahme vor Kundenstand

Production-OTA und Kundencheck verlangen zusätzlich `deviceEvidence`, `buildId`,
`nativeSourceCommit`, `appVersion`, `buildNumber` (String), `nativeFingerprint`,
`updateId`, `updateGroup`. Die echten EAS-Build-/Updateobjekte müssen zu Quelle,
Version, Runtime und Plattform passen; der native Quellstand muss Vorfahre des
geprüften Kandidaten sein. Ein OTA-Quellcommit darf später als der native Build
sein, aber nicht von einer unvereinbaren Quelllinie stammen.

Der Gerätebeleg muss `schemaVersion:1`, `status:PASS`, dieselbe Policy-/Quellbindung
und die genannten Geräte-/Buildidentitäten enthalten, dazu `physicalDevice:true`,
`tester`, `deviceModel`, `osVersion`, `testedAt`, `openBlockers:[]`, `otaSource:OTA`
und `emergencyFallback:false`. Keine Emulatorabnahme als iPhone-Abnahme ausgeben.
Unter `checks` sind folgende echte Fälle jeweils mit `status:PASS` und einer
hashgebundenen Datei (`evidence.path`, `evidence.sha256`) erforderlich:

- `layStart`, `layFinish`: Legen starten und bewusst beenden.
- `searchStart`, `searchFinish`: Absuche starten und bewusst beenden.
- `save`, `reopen`: dauerhaft speichern und nach App-Neustart wieder öffnen.
- `offlineSave`: offline speichern, danach wieder öffnen/abgleichen.
- `existingDataRetained`: vorhandene Daten nach dem Update weiterhin vorhanden.
- `liveActivityEnd`: Live Activity im Abschlussablauf korrekt beendet/übergeben.
- `otaReceived`: tatsächlich laufende OTA-ID, kein Embedded-/Notfallstart.

Hashbindung verhindert unbemerkte Belegänderungen; ein JSON-Dokument kann eine
physische Prüfung nicht selbst durchführen und authentifiziert keinen Menschen.
Niemand darf Testergebnisse erfinden. Offene Crash-/Datenbefunde in der aktuellen
Policy blockieren Kundenauslieferung, erlauben aber die Vorbereitung eines
separat beauftragten Testbuilds. Der Schutz der Build58-Fährtenbasis bleibt auch
für einen solchen Testbuild unverändert Pflicht.

## Verifikation dieser Erweiterung

Neue Tests: `node --test scripts/__tests__/releaseEntry.node.test.mjs`.
Sie prüfen fehlende/veraltete Policies, eine zusätzliche OTA in einer anderen
Runtime, unbekannte Gerätefälle, falsche Build-/Updatebindung, falsche Beleg-
Hashes, unerlaubte Kommandoargumente sowie den vollständigen Prüfpfad mit echtem
lokalem Test-Git und ausschließlich simuliertem EAS. Die bestehenden OTA-Harness-
Tests isolieren den neuen Eingang bewusst durch ein Fixture-Modul und prüfen
weiterhin ihre bisherigen Runtime-/Race-/Quality-Guards. Kein Test startet einen
echten Build oder eine echte Veröffentlichung.
