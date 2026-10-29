# ANYVO Intelligence: Architektur- und Umsetzungsvorschlag

Stand: 2026-10-23. Status: IOS_ADAPTER_V2_REVIEW_PASS; ANDROID_KOMPATIBILITAET_LOKAL_PASS; ANDROID_REVIEW_AUSSTEHEND.

**Aktueller Geltungsbereich:** Der direkte Nutzerauftrag „ausführen“ beauftragt die deterministischen Quellen- und Entwurfsadapter nach tatsächlichem UX3+4-Abschluss durch 07 und geprüfter Quellenübergabe über 00. Der iOS-UX-Freeze und die kumulative Basis67ae3548ad956d235c0110b36b702093cbf40a9d sind geprüft und übernommen; die schmale lokale Adapterumsetzung ist erfolgt. Der unabhängige iOS-Adapterreview V2 ist bestanden; Android-Kompatibilitätsprüfung und Geräteabnahme sind getrennte weitere Phasen. Neueste Nutzerreihenfolge: iOS vorziehen, danach Android; eine Android-Veröffentlichung ist keine Startvoraussetzung mehr. Keine erneute grundsätzliche Umsetzungsfreigabe erforderlich. Externe Sprache/Modelle/Konversation, neue KI-Persistenz, DB-/Nativeänderungen sowie Commit/Push/Merge/Build/OTA/Store sind nicht umfasst.

Die gemeinsame [Produktübersicht und Ideensammlung](ANYVO-INTELLIGENCE-PRODUKTPLAN.md) hält ausgewählte Ziele und spätere Möglichkeiten getrennt fest.

## Zuordnung und Belegbasis

Alleiniger technischer Analyseowner: dieser dedizierte Intelligence-Chat gemäß direkter Übergabe aus der Werkstatt. Fester Code-Arbeitsort:
`/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-intelligence-analysis`.
Branch `feat/anyvo-intelligence-analysis`, HEAD `6877011dc9bdc6cce17d42402fe5a2ae65f5e6c2`; Git-Root bestätigt, Arbeitsbaum vor Berichtserstellung sauber. Dies ist eine feste Codepfadzuordnung; eine technische Desktop-Anhangregistrierung wurde nicht durchgeführt oder behauptet.

Übernommene Inventur außerhalb des Worktrees: `../outputs/anyvo-intelligence-analysis/ANALYSE.txt` (SHA256 `c8e0a18aa1184ff2a78f6a8ade4bac6627e8b49ea901ce9e0e1b67597929130c`) und `MANIFEST.json` (SHA256 `b781cf59a08bcf2552f31eb0b9af3384f84146321b8752d0e581b81bc404ffd9`). Beide Hashes und alle 22 gebundenen tatsächlichen Quelldateien erneut geprüft: PASS. Keine Wiederholung der Gesamtinventur.

Kanonische AGENTS.md und relevante aktuelle Status-/Routing-/Koordinationsabschnitte aus `/Users/moyo/canisflow-worktrees/anyvo-main` gelesen. Dort steht teils noch Werkstatt als Inventurwriter; die jüngere direkte Übergabe weist diesen Chat als alleinigen technischen Analyseowner aus. Keine globale Dokumentkorrektur vorgenommen. Historische Handoff-/Taskdateien im eigenen Worktree sind keine aktuelle Releasewahrheit.

Die analysierte Basis ist veröffentlichte iOS55-Homequelle, keine gemeinsame aktuelle Plattformbasis. Der kanonische Status nennt bereits eine spätere iOS-Quelle `6328890822a842cb94cd6819e483cc5e86056ed7`. Aktuelle Android-Audio-/Releasearbeiten sind separat. Keine Live-Releaseprüfung hier; vor Implementation/Integration beide Plattformquellen und Änderungen an allen betroffenen Verträgen neu vergleichen.

## Produktgrenze und Reihenfolge

ANYVO bleibt All-in-One für Hundehalter. Training ist der bereits belegte erste Datenadapter, kein universelles Datenmodell für Gesundheit, Dokumente, Termine oder GPS. Weitere Domänen brauchen jeweils eigenen Scope, Rechte- und Feldvertrag.

Empfehlung: bestehendes deterministisches UX3+4 durch 07 zuerst abschließen. Danach lesenden Kontextadapter und bestätigte Entwürfe auf vorhandenen Verträgen ergänzen. Sprache und optionale sichtbare KI-Unterhaltung erst nach eigener Freigabe. Kein Vektorindex, dauerhaftes KI-Gedächtnis oder Anbieterwechsel als Voraussetzung. Konzeptideen aus der Übergabe gelten als Vorschläge; nicht lesbare Gesprächsinhalte wurden nicht ergänzt.

07 bleibt alleiniger UI-Writer für Historie/Vorlage/Bearbeiten. Neueste direkte Nutzerentscheidung: iOS-UX3+4 vorziehen, danach iOS-Adapter, anschließend Android-Übernahme und Plattformprüfung; 00 koordiniert die konkrete Quellenübergabe. Die beauftragten Adapter folgen dem UX-Freeze; dieser Bericht startet keinen parallelen UI-Strang. Commit- und Releasefreigaben sind nicht umfasst.

## Vorgeschlagene Architekturverträge

Die folgenden Namen beschreiben geplante Schnittstellen, keine vorhandenen exportierten APIs oder DB-Felder.

| Baustein | Eingabe und Ausgabe | Bestehende Basis / Grenze |
| --- | --- | --- |
| Lesender Kontextadapter | Expliziter Account, Hund, Domäne/Sparte, zugelassener Feldumfang, Abfragegeneration → Quellenliste und Vollständigkeitszustand | `services/trainingPreparation.ts`, `relevantUnits`; keine pauschale Accountinventur |
| Quellenreferenz | Quelltyp, Original-ID, Übungs-ID soweit vorhanden, Quelldatum, Ladezeit, Herkunft und Verfügbarkeit | `PreparationUnit.historySource/originalId`; Legacy-Namespace erhalten; keine erfundene dauerhafte DB-Provenienz |
| Deterministisches Wiederanknüpfen | Ausgewählte Quellen/Übungen/offene Schwerpunkte → neue Planung | `planFromHistory`, bestehende Übungsidentitäten und Editor-Wiederverwendung; Quelle unverändert |
| Bestätigter Entwurfsadapter | Validierter Vorschlag und aktuelle Kontextbindung → sichtbarer editierbarer Entwurf | `documentation/draft.ts`, vorhandener Editor; Speichern ausschließlich über `saveIntent.ts` und `trainingDocumentService.ts` |
| Spätere Sprach-/Konversationsgrenze | Bewusster Start, geprüfter Transkripttext bzw. Frage und minimierter Kontext → Vorschlag mit Referenzen | Keine direkte Schreibberechtigung; aktuelle deaktivierte externe Pfade bleiben deaktiviert |

Ein Quellenpaket muss zwischen beobachteten Originaldaten, Nutzerkorrekturen und abgeleiteten Vorschlägen unterscheiden. Jeder behauptete historische Sachverhalt erhält eine nachvollziehbare Quelle und deren Datum. Fehlend, veraltet, begrenzt, offline und Fehler sind getrennte Zustände, keine leere Historie. Wiederholte Abfragen werden dedupliziert; verspätete Ergebnisse dürfen nur bei identischem Account/Hund/Sparte und aktueller Generation angewendet werden. Abbruch des Transportes allein genügt nicht: zusätzlich Kontext nach jedem asynchronen Schritt prüfen.

`loadTrainingPreparation` liest zwei Quellen parallel, normalisiert Legacy-Sessions und liefert maximal 100 Einheiten mit `limited`. Dieser Vertrag darf nicht als vollständiges Hundegedächtnis bezeichnet werden. Bestehende deterministische Notizsuche ist servergestützt und begrenzt, kein Offlineindex und keine semantische Suche. Für vollständige Suche wäre ein gesonderter Pagination-/Sortierungsvertrag nötig.

## Neuer Entwurf und Bestätigung

Zulässig ist eine explizite Auswahl geeigneter Übungsidentitäten, offener Schwerpunkte und Ziele. `planFromHistory` setzt Bewertung/Notizen auf null und performed auf false. Neue Identitäten entstehen über den bestehenden Erstellungsweg; Quell-IDs bleiben Herkunft und werden nicht zur Identität des neuen Ereignisses.

Alte Bewertungen, Ergebnisse, Beobachtungen, Dauer, Medien/Audio, GPS sowie Start-/Endzeiten werden nicht als neue Tatsachen übernommen. Historische Notizen können separat als datierter Quellenhinweis sichtbar sein. Sprachangaben dürfen nur ausdrücklich genannte heutige Beobachtungen vorschlagen; fehlende Angaben bleiben leer. Unbekannte Felder, unpassende Hundzuordnung und widersprüchliche Werte werden verworfen oder zur Klärung angezeigt, nicht still erraten.

Zustandsfolge: Eingabe → validierter Vorschlag → geprüfter/korrigierter Entwurf → ausdrückliche Speicheraktion → bestehender Save-Intent → bestätigtes Serverergebnis. Vorschlagsannahme ist noch kein Speichern. Kein Autosave in Kundeneinträge; bestehende lokale Entwurfsablage ist davon getrennt zu kennzeichnen. Vorschlagsänderungen nach Erstellung eines offenen Save-Intents müssen dessen bestehende Konfliktbehandlung respektieren.

`saveIntent` hält Anfrage, Fingerprint und Request-ID für identische Wiederholung vor. Verlorene Antwort ist kein sicherer Fehlschlag: denselben Intent wiederholen, keine zweite Erstellung. Bestehende atomare RPCs und Owner-Prüfung weiterverwenden; keine parallelen Inserts, eigene Quota-Abbuchung oder nachträgliche Client-Reparatur. Abbruch einer bereits gesendeten Speicherung beweist keinen Rollback.

## Datenzugriff, Einwilligung und Löschung

Vorgeschlagener MVP: nur ausdrücklich gewählter eigener Hund und freigegebene Trainingsquellen. Bestehende Zugriffsrechte sind Voraussetzung, kein neuer Berechtigungsersatz. Geteilte/Trainer-/übertragene Daten, Gesundheit, Dokumentinhalte und Standortdaten sind standardmäßig außerhalb des ersten Adapters. Server muss später Account, Hundzugehörigkeit und erlaubte Quellen selbst prüfen; Client-Filter sind keine Autorisierung. Tatsächliche Live-RLS/Storage-Policies sind hier nicht geprüft.

Einwilligung für externe Verarbeitung muss Zweck, Datenarten, Empfänger und Aufbewahrung verständlich vor dem ersten Export erklären; Mikrofonrecht ist keine Einwilligung für Cloudverarbeitung. Separate Wahl für Sprache/Cloud und dauerhafte Präferenzen vorsehen. Ablehnung erhält manuelle Erfassung und deterministisches Wiederanknüpfen. Keine neuen Einwilligungsfelder oder Tabellen aus diesem Vorschlag ableiten.

Quellenableitung möglichst nur flüchtig halten. Bei Quellenlöschung, Rechteentzug oder Korrektur betreffende Ableitungen invalidieren und vor erneuter Nutzung neu laden. Offline nicht überprüfbare Quellen als solche markieren; keine externe Weitergabe ungeprüfter Cacheinhalte. Entfernte Quelle nicht aus einer Gesprächszusammenfassung wieder als Fakt einführen. Bereits explizit gespeicherte eigenständige Nutzereinträge nicht automatisch löschen oder rückwirkend verändern; Herkunft und Inhalt getrennt behandeln.

Dauerhaftes Hundegedächtnis erst mit gesondertem Vertrag: Einsicht, Korrektur, Einzel-/Gesamtlöschung, Herkunft, Aufbewahrung und vollständige Löschweitergabe an Cache, Index und eventuelle Anbieterzustände. Ein Quelllink allein garantiert keine Anbieterlöschung. Nach Widerruf weitere Verarbeitung stoppen; mögliche vertragliche Aufbewahrung vor Auswahl prüfen. Keine stillschweigende Zusammenführung der lokalen Schwerpunkte mit Server-Snapshots.

## Offline, Account-/Hundwechsel und Servergrenzen

Ohne Netz: vorhandene Editor-/Entwurfsfunktionen respektieren. Nur tatsächlich verfügbare autorisierte lokale Inhalte verwenden; der aktuelle Historienadapter beweist keinen Offlinebestand. Fehlendes Netz verständlich anzeigen, manuelle Erfassung erlauben. Externe KI-Anfragen nicht automatisch nach Wiederverbindung senden; erneute bewusste Aktion und aktuelle Rechte prüfen. Kein neuer universeller Synchronisationsweg.

Bei Accountwechsel: laufende Lese-/Vorschlags-/Sprachvorgänge abbrechen, Generation wechseln, flüchtigen Kontext/Transkript/Antwort verwerfen und keine verspätete Antwort anzeigen. Bestehende accountgebundene Kundendrafts nicht destruktiv löschen. Bei Hund-/Spartenwechsel dieselbe Invalidierung; alter Entwurf bleibt unter seinem ursprünglichen Kontext und wird nie dem neuen Hund zugewiesen. Resume lädt Kontext und Berechtigungen erneut; unterbrochene Aufnahme startet nicht selbständig.

Spätere externe Verarbeitung ausschließlich hinter einem authentifizierten begrenzten Serververtrag. Anbieterschlüssel bleiben serverseitig. Zulässige Felder explizit freigeben, Text-/Audio-/Tokenmengen begrenzen, Zeitlimits und Abbruch behandeln, keine direkten Datenbankwerkzeuge für Modelle. Quelltexte gelten als Daten: eingebettete Anweisungen dürfen weder Datenfreigabe noch Toolausführung bewirken. Modellausgabe gegen typisierten Vorschlagsvertrag prüfen. Keine ungeprüften Rohtexte, Audios, Gesundheits- oder GPS-Daten in Logs; Diagnostik über Fehlerklasse, Laufzeit und Mengen ohne Inhaltskopie.

## Sprache und Interaktion als spätere Stufe

Sprachnotizaufnahme ist keine automatische Transkription. Vorhandener optionaler Recognitionwrapper beweist keine Verfügbarkeit im installierten iOS-/Android-Binary. Vor Implementierung offizielle versionsbezogene Expo-/Native-Dokumentation und tatsächliche Binaryfähigkeiten prüfen; kein Native-/Dependencyauftrag hier.

Bewusster Mikrofonstart, sichtbarer Aufnahmezustand, Stop/Abbrechen und Transkriptkontrolle sind Voraussetzung. App-Wechsel, Sperrbildschirm, eingehender Anruf, Audio-Unterbrechung, Berechtigungsentzug und fehlendes Modul müssen in einen sicheren erklärbaren Zustand führen. Aufnahme nur verarbeiten, wenn Nutzer dies veranlasst; keine Speicherung von Roh-Audio als neuer Standard.

Warme ruhige Stimme und fünf Mintpunkte bleiben optionales Interaktionskonzept. Begrüßung, Zuhören, Vorbereitung, Sprechen und Speicherbestätigung müssen verständliche Textäquivalente haben. Reduced Motion und Screenreader berücksichtigen. Speicherbestätigung ausschließlich nach tatsächlichem Save-Erfolg. Tagesgruß und Android-Audioprioritäten bleiben in fremder Zuständigkeit unverändert.

## Kostenvertrag ohne Anbieterfestlegung

Kein Modell-/Preisbeschluss, keine Anbieter-API, keine Schlüssel gelesen. Vor Auswahl aktuelle offizielle Preise, Verfügbarkeit, Datenregionen, Retention und Löschmöglichkeiten prüfen. Dieser anbieterneutrale Plan enthält keine zeitabhängigen Preis- oder Leistungsbehauptungen.

Budgetmodell: aktive Nutzer × aktive Nutzungstage × Anfragen/Tag × Kosten je begrenzter Anfrage, zusätzlich Sprachminuten × Transkriptionskosten, optionale Synthesedauer sowie Backend/Storage. Ein-/Ausgabetokens, Retries und Abbruchkosten separat einkalkulieren. Vor Pilot Monatsbudget, maximales Anfragebudget, Audiolänge, Ausgabelimit, Parallelität und Retrymaximum konkret beschließen; Zahlen sind noch offen.

Server muss spätere Budgetreservierung vor Aufruf und tatsächliche Abrechnung danach atomar behandeln. Timeout ohne Antwort nicht blind erneut kostenpflichtig starten; bestehende Anfrage-ID nachvollziehen. Harte Tages-/Monatsgrenzen und Rate-Limits durchsetzen, bei Limit manuelle/deterministische Funktion erhalten. Keine Änderung der bestehenden Produkt-/Abo-/Trainingsquota. Nutzungsmetriken aggregiert und ohne Kundeninhalte; Warnschwellen und Abschaltung vor Pilot abnehmen.

## Kleine nächste Pakete und Entscheidungen

1. **UX-Abschluss durch 07 abwarten:** tatsächlichen Task-/Quellenstand und Freigabe von 00 übernehmen. Kein Eingriff in dessen Screens. Vor jedem Produktauftrag aktuelle Plattformbasen vergleichen.
2. **Kontextvertrag, rein deterministisch:** Trainingsquellen, Referenzen, Limit-/Offlinezustände und Wechselinvalidation mit synthetischen Fixtures spezifizieren/implementieren, erst nach konkreter Freigabe. Abnahme: keine Account-/Hundvermischung, keine stillen Vollständigkeitsbehauptungen, Quellenkorrektur/-löschung wirksam.
3. **Entwurfsadapter:** nach UX-Abschluss Auswahl in vorhandenen Entwurfs-/Save-Weg anbinden. Abnahme: keine alten Tatsachen übernommen, Quelle unverändert, Bestätigung erforderlich, Retry identisch. Keine neue Persistenz ohne neuen Vertrag.
4. **Externer Pilotvertrag:** Anbieter, Datenschutz-/Einwilligungsumfang, harte Budgets und Serverzuständigkeit entscheiden; erst danach technische Umsetzung beauftragen. Schutztests nicht einfach entfernen oder alte Edgepfade einschalten. Neuer freigegebener Pfad braucht ausdrücklich überarbeitete Sicherheitsanforderungen und Regressionen.
5. **Sprache, danach optionale Konversation:** Verfügbarkeit und Gerätefälle beider Plattformen nachweisen; Textfluss bleibt vollständig. Dauerhaftes Gedächtnis und weitere Alltagsdomänen jeweils separat priorisieren.

Offene Produktentscheidungen: erster freigegebener Datenumfang, rein flüchtiges oder später dauerhaftes Gedächtnis, Sprachverarbeitung lokal/extern nach Fähigkeitsprüfung, Pilotgruppe und Kostenobergrenzen. Sie blockieren weder diesen Bericht noch den bestehenden deterministischen UX-Auftrag.

## Notwendige spätere Tests und STOP-Bedingungen

Bestehende Tests wiederverwenden: `services/__tests__/trainingPreparation.test.ts`, `services/__tests__/trainingDocumentRetry.test.ts`, `features/training/documentation/__tests__/{model,storage}.test.ts`, `features/training/__tests__/journal-sources.test.ts` und `features/ai/__tests__/ki-removal.test.ts`. Existenz geprüft, hier nicht ausgeführt.

Zusätzlich gezielt absichern: Account-/Hundwechsel während jeder Asyncphase; gleicher Name bei verschiedenen Übungs-IDs; Legacy-/unvollständige Daten; leere/begrenzte/fehlerhafte Historie; gelöschte oder entzogene Quelle; Originalschutz; leere neue Bewertungen/Beobachtungen; doppelte Auswahl; Draft-Restore nach Resume; Doppeltippen; verlorene Save-Antwort; Quota-/Ownerfehler; kein versteckter Export. Später außerdem Schema-/Prompt-Injection-Prüfung, Budgetparallelität, Timeout/Retry, Widerruf und Löschweitergabe. Native Sprache separat auf iOS/Android mit echten Unterbrechungen, Offline, fehlendem Modul und Berechtigungsfällen prüfen. UI: Dark Mode, Screenreader, Reduced Motion, Touchziele und Tastatur.

Bei Produktänderung relevante Tests, Typecheck, ESLint und `git diff --check`; Backendpilot zusätzlich echte autorisierte Rechte-/Isolationstests mit synthetischen Daten und gesonderter Freigabe. Keine Live-Kundendaten als Testfixture.

STOP vor betroffener Implementierung bei unklarer Writerzuordnung, Plattform-/Quellendrift, fehlendem Daten-/Kostenvertrag, benötigter Migration oder Nativeänderung außerhalb Freigabe. STOP vor externem Aufruf ohne Einwilligung und serverseitige Autorisierung/Budgetgrenzen. Kein Produktcode, Dependency, DB, Auth/RLS, Tracking/GPS, Abo-/Quota, Tagesgruß oder Audioverhalten in diesem Auftrag ändern. Kein Commit/Push/Merge/Build/OTA/Store.

## Tatsächlich ausgeführte Prüfung

Gitpfad/Root/Branch/HEAD/Anfangsstatus geprüft; Bericht-/Manifesthash und 22 Sourcehashes PASS. Bestehende Inventur übernommen und nur ausgewählte Adapter-/Save-/Schutztestverträge vertieft. Ausschließlich diesen eigenen Analysebericht erstellt. Produkt-Typecheck, ESLint und Tests nicht ausgeführt, da keine Produktänderung; keine Laufzeit- oder Geräteabnahme behauptet. Keine Live-DB-, RLS-, Storage-, Modell- oder Anbieterabfrage. Abschließende Dokument-/Whitespaceprüfung separat im Chat berichtet.

## Folgeauftrag „ausführen“ — 2026-10-23

Direkte menschliche Anweisung auf die empfohlene Reihenfolge: UX3+4 durch07 abschließen, danach deterministische Quellen- und Entwurfsadapter. Damit sind die deterministischen Folgepakete beauftragt; externe Sprache/Konversation bleiben separat. Keine Freigabe für Commit/Push/Merge/Build/OTA/Store, DB oder Native abgeleitet.

Voraussetzung frisch geprüft: kanonischer Status und tatsächlicher07-Chat melden Android49-Veröffentlichung noch ausstehend; UX3+4 ist nicht als abgeschlossen/freigegeben belegt. Daher keine vorzeitige Produktimplementation auf der alten687-Basis.00 über neuen Auftrag und fertigen Bericht informiert und um Koordination der bestehenden Reihenfolge sowie konkrete Quellenübergabe nach UX-Freeze gebeten. Kein zweiter UI-Writer und kein neuer Worktree.

Arbeitsbaum vor Folgeauftrag: ausschließlich dieser eigene unversionierte Bericht; Branch/HEAD unverändert. Nächster erforderlicher Nachweis: tatsächlicher UX3+4-Freeze samt aktuellem Plattform-/Adaptervertrag. Der Auftrag bleibt zur anschließenden Umsetzung bestehen; keine erneute pauschale Implementierungsfreigabe nötig. Es wurde keine Hintergrundautomation eingerichtet.

## Erneute Ausführungsanweisung — 2026-10-23

Nutzer hat dieselbe annotierte Reihenfolge erneut mit „ausführen“ bekräftigt. Auftrag bleibt gültig. Frische Prüfung von ACTIVE_WORK und tatsächlichem07-Abschluss: Android49 inzwischen hochgeladen und zur Google-Prüfung eingereicht; öffentliche Veröffentlichung noch nicht bestätigt. Der frühere konkrete Push-HOLD ist erledigt und wird hier nicht als aktueller Blocker fortgeschrieben. UX3+4-Freeze und Quellenübergabe weiterhin nicht nachgewiesen.00 um aktive Koordination der bereits beauftragten Folgephasen gebeten; keine neue Grundsatzfreigabe angefordert. Keine vorzeitige Umsetzung auf687 oder Übernahme von07-Screens.

## Neue verbindliche Plattformreihenfolge — 2026-10-23

Direkter Nutzerauftrag: „ios vorziehen danach android“. Die frühere Wartebedingung Android49-Veröffentlichung vor UX3+4 ist damit aufgehoben.07 bleibt alleiniger UX-Writer und soll die iOS-Umsetzung jetzt auf aktueller geprüfter kumulativer iOS-Quelle beginnen; danach11 deterministische Quellen-/Entwurfsadapter auf dessen geprüftem iOS-Freeze. Android-Übernahme und Plattformabnahme folgen anschließend; gemeinsam genutzter Code muss kompatibel bleiben.00 zur Aktualisierung und unmittelbaren Weiterleitung an07 beauftragt. Historische Wartevermerke in diesem Bericht sind durch diese jüngste Entscheidung ersetzt.

Die bereits eingereichte Android49-Veröffentlichung bleibt ein separater bestehender Vorgang und wird nicht abgebrochen oder dupliziert. Keine neue Commit-/Push-/Merge-/Build-/OTA-/Store-, DB-/Native- oder externe KI-/Sprachfreigabe. Der bestehende iOS-UX-Freeze vor Adapterintegration bleibt erforderlich, ohne erneute pauschale Umsetzungsfrage.

## Adaptervorbereitung auf tatsächlichem iOS-UX-Freeze — 2026-10-23

Auf erneuten Nutzerauftrag „weiter“ den tatsächlichen07-Stand read-only geprüft: Worktree `anyvo-training-template-ux-20261023`, Branch `feat/training-template-ux-20261023`, HEAD6328890822a842cb94cd6819e483cc5e86056ed7, uncommitted Ownerpaket. `SOURCE-FREEZE-07.json` SHA3de9ef12a9e29c71a36e8ec60b50d31538ae46f248ef1e2f01043780963820ca bindet20Dateien; alle20 tatsächlichenDateihashes ohneAbweichung bestätigt. GebundenerOwnerstatus:8Suiten126Tests/0skip,Typecheck0,Lint0/0,diff0. Diese Tests hier nicht erneut ausgeführt; unabhängigerReview/Quellenübergabe noch offen.

Neue tatsächliche Wiederverwendungsbasis: `features/training/documentation/template.ts` exportiert `TemplateChoice`, `TemplateHint`, `TemplateContext`, `templateExerciseKey`, `readTemplateHints`, `planTemplate` und `templateEntryContext`. `planTemplate` validiert Account/Hund/Abschluss und konkrete Übungsauswahl; erzeugt Planung über `planFromHistory` mit leeren Beobachtungen. Fokus-Hinweise bleiben getrennte datierte Kontextdaten. BestehenderEditor bindet dies an account-/quellen-/hund-/spartengebundene persistenteEntwürfe und bestehendenSaveweg. DieserTeil des geplantenEntwurfsadapters ist damit bereits durch07 umgesetzt; keine zweiteImplementierung erstellen.

Verbleibender zu prüfender Adapterumfang nachReview: gemeinsamer lesenderQuellenvertrag um bestehendes `loadTrainingPreparation` mit Originalquellenreferenz/Quelldatum/Ladezeit/Limitzustand und expliziterKontextgeneration; Änderungen/Quellenverfügbarkeit vor erneuterVerwendung nachladen. Historie und Snapshot nicht als dauerhaftesHundegedächtnis ausgeben. VorhandenerEditor hat bereits lokale Scope-/Asyncguards: erst konkretenMehrwert und nutzbarenIntegrationspunkt belegen, keine bloße paralleleWrapperbibliothek oder neuenSpeicherweg ergänzen. Offlinefähigkeit nicht aus servergestützterHistorie ableiten. Externer Modell-/Sprachpfad bleibt aus.

00 hat nach Rückfrage bestätigt: Übergabe erst nach unabhängigemReviewPASS;11 übernimmt geprüften kumulativeniOSStand und ergänzt nur belegteLücken. Nutzer hat in07 inzwischen direkt „commit und ota“ beauftragt (tatsächlichenChat gelesen); diese neuere spezifischeFreigabe ersetzt dort den älterenUXSTOP nach erforderlichenGates, erweitert aber nicht automatisch die Adapter-Commit-/Releasefreigabe hier. Keine fremdenWorktrees oderQuellen verändert.

## UX-Review bestanden; konkreter Adapter-Gapplan — 2026-10-23

`../outputs/ux-template-review-01-20261023/INDEPENDENT-UX-REVIEW-01.json` vollständig gelesen; tatsächlicher SHA256 `1cbdbb51bbc4dcaa45039a913f7b967835565a24f6b034342f3fbf60a460dbf3` stimmt mit00Übergabe überein. StatusPASS, keineFindings, drei unabhängigeSuiten/77Tests/0skip aufCopy mitR2. Owner126Tests separat; nicht addieren als einzigartigeGesamttests. Geräte-/Visuell-/ScreenreaderQA weiterhin offen. Review bestanden bedeutet nicht Veröffentlichung.

00 übergibt nach01Integration den genauen sauberen kumulativeniOSCommit und Pfad sowie Übernahmeinstruktion für bestehendenKIWT. Bis dahin nur lesendeVertragsprüfung/eigeneDokumentation. Keine blindeKopie des uncommitteten07Pakets, kein Rückgriff auf687, kein neuerWorktree. Beide eigenenDokumente beim späteren kontrolliertenBasiswechsel erhalten.

| Vertrag | Nach tatsächlichem UX-Code bereits vorhanden | Konkreter nächster Schritt nach Quellenübergabe |
| --- | --- | --- |
| Account/Hund/Sparte, Legacy und Limits | `loadTrainingPreparation` filtert und normalisiert zweiModelle; `historySource/originalId`, `limited`; Tests vorhanden | Keine zweiteHistoryquery. MinimalenQuellenvertrag direkt an diesemLesepfad ergänzen, nur mit tatsächlichemKonsumenten. KeineFullMemoryBehauptung |
| Async/Resume | Editor schützt Sichtbarkeit über `history.scope`, `requestVersion`, Cleanup und lädt bei AppState active erneut | Schutz erhalten; gemeinsamesErgebnis nur kontextgebunden verwenden. Generation ist imEditor bereits vorhanden, keine neueRacebehebung behaupten |
| Quellenhinweise | Datum/Übungsidentität/Originalquelle bereits vorhanden; UI zeigt historischeNotizen getrennt | Geplantes minimiertesKontextpaket: Quelltyp+Original-ID, Datum, Lesezeit, erlaubteNotiz/Übungsreferenz; keineMedien/GPS/ungefragtenGesundheitsdaten. Vollständigkeit explizit |
| Wiederanknüpfen/Entwurf | `planTemplate` und Editor erstellen getrenntenEntwurf; Quelle und historischeTatsachen unverändert | Bereits erfüllt, wiederverwenden. NeueAdapterausgabe nur über diesenBestätigungsweg, keine zweiteDraft-/Speicherstruktur |
| Speichern/Retry | BestehenderSaveIntent/atomarerServervertrag bleibt erhalten | Keine Änderung anSave/Quota/RLS nötig oder ausAuftrag ableiten |
| Offline/Korrektur/Löschung | History ist servergestützt; Fehler propagieren, Resume lädt erneut; Quelle wird vor neuerVorlage geladen | KeinOfflinecache neu erfinden. Nichtverfügbarkeit/abgebrocheneGeneration getrennt behandeln; keineServerfehlermeldung pauschal alsOffline etikettieren. Keine ausCache erfundenenFakten |

Erster kleinerImplementationsteil nachHandoff: konkreten bestehendenLesepfad für einen datensparsamen kontextgebundenenQuellensnapshot festlegen und nur belegteLücken inProvenienz/Vollständigkeit/Invalidierung ergänzen. Bei bereitsvollständig erfülltemEntwurfsvertrag ausdrücklich alsWiederverwendung abnehmen, keinezusätzlicheFunktion nurzurErfüllung einesNamens. Kein isoliertesungenutztesWrappermodul. Änderungen an07Screens nur nachkonkretabgestimmterWriterübergabe.

GezielteAbnahmefälle fürRestumfang: unit/session mitidentischerOriginal-ID bleiben unterscheidbar; minimierterSnapshot enthält keineMedien/Standortfelder; Quellendatum ist nichtLadezeit;100/101Grenze bleibtkorrekt; Account-/Hund-/Spartenwechsel und verspäteteAntwort verwerfen; Queryfehler ist keinleererErfolg; neueVorlage enthält keinealteBewertung/Beobachtung; bestehendeDraft-/Retrytests und KI-Entfernungsschutz bleibenbestehen. DanachTypecheck/ESLint/diff undrelevanteRegressionen, keineLiveKundendaten.

## Lokale iOS-Adapterumsetzung auf kumulativer Quelle — 2026-10-23

**Aktuelles Mapping:** gleicherWorktree `anyvo-intelligence-analysis`, neue eigeneBranch `feat/anyvo-intelligence-adapters-ios-20261023`, HEAD/Basis `67ae3548ad956d235c0110b36b702093cbf40a9d`. AlteAnalysebranch `feat/anyvo-intelligence-analysis` auf687 erhalten. Vor Wechsel ausschließlich die beiden eigenen unversioniertenDokumente; gegenZielbaum aufKollision geprüft, unter `../outputs/anyvo-intelligence-adapters-ios-20261023/pre-switch/` gesichert und danach byteidentisch bestätigt. Kein neuerWorktree, Merge, Reset oderCommit. Release-/07Worktrees nicht verändert.

KumulativeFreezequelle `../outputs/tracking-r2-ux-release-01-20261023/SOURCE-FREEZE.json`, SHA256 `d45c1c817e35de7b7b4e551546d4cec882ea48d0df371922d6dc92cf0dff89bb`: selbstgeprüft;33tatsächlicheiOSDateien undGitblobs stimmen, exakteCLEANQuellevorÜbernahme bestätigt. Die eigeneBasis enthält damit reviewedR2+UX; keinZurückport aufalte687. Veröffentlichung dieserBasis wurde in diesemAdapterauftrag nichtlivegeprüft und ist keineVoraussetzung fürlokaleUmsetzung.

### Tatsächliche Änderung

- Neuer `services/trainingContext.ts`: verwendet vorhandenen `loadTrainingPreparation` fürAccount/Hund/Sparte, Legacyidentitäten und100erLimit. FlüchtigerQuellenkontext enthält nurScope, Ladezeit, Vollständigkeitsflag undReferenzen mitQuelltyp/Original-ID/Ansichts-ID/Quelldatum. Keine neuePersistenz, keinVektorindex. HistorischeOriginaldaten bleiben imvorhandenenLeseergebnis, werden nicht alsneueFakten inQuellenmetadaten kopiert. Metadaten sind keineAnbieterexportfreigabe.
- `prepareTrainingHistoryDraft` lädt dieQuelle vorÜbernahme erneut. Fehlende, gelöschte, mehrdeutige oder nichtmehrindiesembegrenztenKontextverfügbareQuelle wird abgelehnt. Das gilt auchfürbereitsangezeigteHistorie beiNetzfehler: keinstillerRückgriff aufalteDaten. EinFehler wird nicht ohneBeleg alsOfflineklassifiziert.
- Planung delegiert anreviewtes `planTemplate`/`planFromHistory`: neuePlanung unperformed, Bewertung/Notizen leer, keineMedien/Zeit-/Leistungsdatenkopie, Originalunverändert. Fokusauswahl bleibt imvorhandenenVorlagenweg; keinezweiteFokus-/Draft-/Saveimplementierung.
- SchmaleAnbindung nur inbestehender `reuseExercises`-Aktion desEditors. Doppeltippen währendLadevorgang dedupliziert. Owner/Hund/SparteinklusiveSpartenschlüssel, Generation, Navigation, App-Wechsel/Resume undSpeicherstatus werden vorAnwendung geprüft. Abgebrochene alteAnfrage blockiert neueGeneration nicht biszurNetzantwort. Lade-/Fehlerdarstellung verwendetbestehendeHistoryzustände, keineScreenneugestaltung.
- NeuerService-/Editorregressionsschutz; bestehenderKI-Entfernungstest schließt neuenService zusätzlich ein, ohnealteSperren zulockern.

### Umfang und Grenzen

Geänderte/neueProdukt-/Testpfade: `services/trainingContext.ts`, `services/__tests__/trainingContext.test.ts`, `app/unit/document.tsx`, `app/unit/__tests__/document.test.tsx`, `features/ai/__tests__/ki-removal.test.ts`; zusätzlich diese beiden eigenenDokumente. Service verwendet vorhandeneClientrechte undSerververträge, keineÄnderung anAuth/RLS/Quota. KeineTracking-/GPS-/Audio-/Home-/Native-/Dependency-/DBänderung. QuellenlöschungnachbewussterErstellung einesunabhängigenEntwurfs löscht diesen nichtautomatisch. Snapshot ist keinvollständiges oderdauerhaftesHundegedächtnis.

Anbieterfrei: keineModell-/Sprach-/CloudAPI, keineKeys oderKundendaten gelesen/exportiert. Normale vorhandeneHistory-Backendabfragen erfolgen erstbeiNutzeraktion inderApp; lokaleTests verwendenMocks. Wiederübernahme benötigt erfolgreichenRefresh; manuellesErfassen undvorhandeneEntwürfe bleiben verfügbar. Android-Quellenport undGeräte-/Netz-/Screenreaderabnahme stehen noch aus; gemeinsamerTypeScriptCode allein beweist keineAndroidfreigabe.

### Prüfbelege

Unter `../outputs/anyvo-intelligence-adapters-ios-20261023/`: finalegezielteRegressionen `regression-tests.json/.log`; kompletterTypecheck `typecheck.log`; gezieltesESLint `eslint.log`. VorhandeneunveränderteAbhängigkeiten wurden fürausgeführteChecksüberlokalenLink wiederverwendet, keineInstallation oderLockfileänderung. Der finalgebundeneErgebnisstatus folgt nachabgeschlossenenPrüfprozessen in `RESULT.json`; keineGeräte-/Live-/Releaseabnahme darausableiten.

**Abschlussprüfung dieser lokalenUmsetzung:**9Suiten/152Tests bestanden/0übersprungen; vollständiger `tsc --noEmit` exit0; gezieltesESLintfüralle5Produkt-/Testpfade exit0/0Warnungen; `git diff --check` exit0, neueDateien zusätzlich aufWhitespace/Abschlussnewline geprüft. Selbstreview vonQuellen-/Generations-/Doppelklick-/Saveguards durchgeführt. KeinunabhängigerAdapterreview oderGerätetest ausgeführt. KeinCommit/Push/Merge/Build/OTA/Release. LokalerTestlink nachChecks entfernt;Produkt-/Dependencydateien dadurchunverändert.

## Reviewkorrektur V2: Weitergehen verwirft offene Historienübernahme — 2026-10-23

UnabhängigerAdapterreview01: `../outputs/intelligence-adapter-review-01-20261023/INDEPENDENT-REVIEW-01.json`, SHA256 `668d20cf336f6c04c5c6399510eb69efaaf7967a88ebd1dbc225919e02883216`, REQUEST_CHANGES/P2. Eigene86Reviewtests bestanden, zusätzlicher echterUIRepro zeigte dennoch: langsameÜbernahme ausVorbereitung, weitergehen/eigeneÜbung wählen/Zusammenfassung, danachalteAntwort → unerwünschterRücksprung+Planergänzung. Der zuvor dokumentierte lokale152-Teststand war daher keineReviewfreigabe. Bereitsfreigegebene67aeTracking+UXQuelle enthält dieseAdapteränderungen nicht und ist vomFinding nichtbetroffen.

Im eigenenScreenregressionstest zuerstRot reproduziert: VorAntwort ist `trainingFlow.nextTitle` sichtbar, nachAntwort wieder `trainingFlow.observeTitle`. `review-fix-v2/repro-before.json/.log` halten denechtenFehler fest; beimPatternlauf63andereTests ausgeschlossen, keinGesamtsuitenfehler darausableiten.

EngerFix ausschließlich in `app/unit/document.tsx`: bestehender `moveToStep` invalidiert bei offenerÜbernahme synchron derenRequesttoken undGeneration, beendet denveraltetenLadezustand und lässt denbewusstgewähltenSchrittwechsel zu. Übernahmewirkung ist zusätzlich nur inVorbereitungsstufe0 erlaubt. Selbst beiZurückkehrnach0 kann diealteAntwort nichtwiederwirksamwerden; neueÜbernahme bleibt ohneWarten aufdiealteNetzantwort möglich. VorhandeneSave-/Account-/Hund-/Sparten-/Blur-/Resume-Schutzbedingungen bleiben erhalten. KeinneuerSpeicherweg undkeineFooterblockade.

Zwei echteUIRegressionen: (1) Zusammenfassung und eigeneÜbung bleiben nachalterAntwort unverändert,keinungefragtesSpeichern. (2) Vorbereitung→Weiter→Zurück→neueÜbernahme, dannalteAntwort: nurfrischerPlan,keinWiederaufleben deraltenAnfrage. Beide fokussiertenTests bestehen (`review-fix-v2/repro-after.json/.log`,63andereTests nurpatternbedingt ausgeschlossen). Vollständige9Suiten/TSC/ESLint/diff werden danach erneut geprüft; neuergebundenerFreeze `review-fix-v2/RESULT.json`. UrsprünglichesRESULT unddessenBelege bleibenalsV1 erhalten; V2 brauchtNachreview über00. KeineCommit-/Release-/API-/DB-/Nativeaktion.

**V2-Abschluss:** vollständige9Suiten/154Tests PASS,0übersprungen; vollständigerTypecheck exit0; gezieltesESLintfüralle5Produkt-/Testpfade exit0/0Warnungen; diff-check undWhitespace/neueDateien PASS. NeuerFreeze enthält genauzweiProdukt-/Teständerungen gegenüberV1 (Editor+Editorregressionen), dazuDokumentationsfortschreibung; Service unddessenTests sowieKI-Schutztest gegenüberV1 bytegleich. LokalerTestlink danachentfernt. UnabhängigerNachreview angefragt über00, Ergebnisnochoffen; keinCommitoderRelease.

## iOS-Nachreview PASS und lokale Android-Kompatibilitätsprüfung — 2026-10-23

V2-Nachreview01 persönlich vollständig gelesen und tatsächlichenSHA256 geprüft: `../outputs/intelligence-adapter-review-01-20261023/INDEPENDENT-V2-REVIEW-01.json`, `72cafb99e0f9add9febea9ffff3418bf6b86ece2409984916ed1ef75b08550b2`. PASS, keineFindings, P2geschlossen; originaler unabhängigerSummaryrepro unverändert nungrün. Drei unabhängigeSuiten/89Tests/0skip, Owner9Suiten154PASSseparat. Alle7reviewtenQuellhashes gegenlokalenStand vorDokumentfortschreibung nochmals geprüft; Reviewer-Rohbelege gebunden. KeinCommit/Release/Androidnachweis ausdiesemReview ableiten.

Neuester00-Auftrag setzt direkteHumanreihenfolge iOS→Android fort: isoliertePrüfkopien beider bestätigtenaktuellenAndroidbasen, keineProduktwrites inRelease-/07WT undkeinneuerGitWorktree. BasisalteRuntime: `89ee1509f9cec93b266ab54f6b60584d3f5019e3`/1.0.5; Basis49: `81c066682d63bebd1a171410c440f4d2b870b644`/1.0.5-greeting-v1. TatsächlicheHEADs/CLEAN undRuntimekonfigurationen selbstgeprüft.

Prüfablage `../outputs/anyvo-intelligence-android-compat-20261023/`: `BASES.json`, `adapter-v2.patch`, `PORT-SOURCE-CHECK.json`, zweiGitarchive und zweiisolierteKopien ohneGitmetadaten. `git apply --no-index --check` undAnwendung aufbeidenBasen PASS; alle5Produkt-/Testpfade sinddanach bytegleichmitreviewtemiOSV2. AlleanderenGitblobs unverändert (1723alteRuntime/1747Runtime49), einschließlichNative-/Runtime-/Package-/Tracking-/Home-/Audiodateien. KeineAndroidspezifischeProduktkorrektur erforderlich ausdiesemQuellenvergleich. VorhandeneAbhängigkeiten nurfürTests verlinkt; Lockfilehash passtaufbeidenBasen exakt zurTestabhängigkeitsquelle.

Android-JavaScriptprüfungen laufen explizit mitinstalliertem `jest-expo/android` (AndroidResolver/BabelPlatform) und zusätzlichernurinderPrüfkopie liegenderPlatform.OS/Platform.selectAssertion. KeineiOS-Standardpresettests alsAndroidtestetikettieren. Typecheck undgezieltesESLint ebenfallsaufbeidenvollständigenBasiskopien. Runtimewird überunveränderteOriginalkonfiguration geprüft; keinBuild, keinEmulator, keineGeräteabnahme. Endergebnis erstnachabgeschlossenenChecks gesondert einfrieren, dann04-Review über00.

**Android-Kompatibilitätsabschluss:** BeideisoliertenBasen bestehen jeweils10Suiten/155Tests/0skip unter `jest-expo/android`, inklusive nachgewiesenemAndroidResolver+Babelcaller undPlatform.OS/Platform.selectAssertion. Jeweils vollständigerTypecheck exit0, gezieltesESLint5Adapter-/Testpfade+isolierterHarness exit0/0Warnungen, Reverse-Patchcheck mitWhitespacefehlerprüfung exit0. Auch nachChecks1723/1747andereGitblobs unverändert, beideReleaseWTsCLEAN/exaktursprünglicherHEAD. Alle5AdapterpfadebytegleichzuV2Review; zusätzlichePlatformtestdatei liegt ausschließlich inisoliertenPrüfkopien. KeineAndroidspezifischeProduktänderung erforderlich; keinNative-/Store-/OTA-Build, keineInstallation aufGerät, keineIntegration inReleasebranches. Testabhängigkeitslinks nachPrüfung entfernt, nurerwarteteGitdateien+5Adapterpfade+Harness vorhanden.

NeuerAndroid-Kompatibilitätsfreeze `../outputs/anyvo-intelligence-android-compat-20261023/RESULT.json` bindetbeideBasen/Runtime/5Quellhashes/Gitarchive/Patch/Harness/Testergebnisse/Typecheck/Lint undJest-Konfiguration. Einunabhängiger04-Kompatibilitätsreview istüber00 anzufragen; dessenPASS ist nichtvorweggenommen. iOS-Code bleibt unverändertaufreviewtemV2,KIWTweiterauf67ae/Branchfeat/anyvo-intelligence-adapters-ios-20261023; lediglichdiese beiden eigenenDokumente seitReview fortgeschrieben. KeineAdapterCommit-/Push-/Merge-/Build-/OTA-/Releasefreigabe.
