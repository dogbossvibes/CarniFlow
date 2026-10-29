# ANYVO Intelligence – schwebender Begleiter und Sprachraum

Stand: 24.10.2026, Europe/Zurich. Owner: Chat 11. **Status: lokale Umsetzungsvorbereitung abgeschlossen; Oberfläche noch nicht als App-Code umgesetzt.** Kein neuer Runtime-, Backend-, Native- oder Release-Freeze. Der bestehende Client319 und Backend120 bleiben unverändert.

## Auftrag und verbindliche Auswahl

Direkter Nutzerauftrag: „Der schwebende Begleiter gefällt mir. Bereite die Umsetzung mit dem Sprachraum für längere Gespräche vor, weiterhin maximal 5 CHF zusätzliche KI-Kosten pro Monat. Keine Productionänderungen oder OTA ohne neue Freigabe.“

Gewählte Gestaltung: schwebende Gesprächsfläche über dem aktuellen ANYVO-Kontext als Einstieg; ausdrücklich aufklappbarer Sprachraum für längere Gespräche. Mint-Akzent, ruhige leuchtende Kugel, gut lesbare Antworten, gleichwertige Texteingabe. „Ähnlich wie Siri“ beschreibt die Bedienidee. Es ist keine Freigabe für Wake Word, Daueraufnahme, Hintergrundmikrofon, systemweite Siri-Integration, Realtime-Streaming oder autonome App-Aktionen.

## Geprüfter Arbeitsstand

- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-intelligence-analysis`.
- Branch: `feat/anyvo-intelligence-conversation-ios-20261023`; HEAD: `aa09a64f7b11c08eb334dc4808d4bda2ee1d2ce1`.
- Bereits vor diesem Auftrag untracked: `app/intelligence.tsx`, `features/intelligence/` sowie Analyse-, Gesprächs- und Produktplandokumente. Nicht als neue Implementierung dieses Auftrags zählen; nichts davon überschreiben.
- AGENTS und Produktplan gelesen; globale Handoff-/Masterdateien im Worktree enthalten ältere Baselines. Sie sind keine frische Productionauskunft. Kein EAS-/Production-Preflight für diese lokale Dokumentation nötig oder durchgeführt.
- Chat 00 bestätigt Chat 11 als alleinigen Clientwriter. Chat 05 besitzt Backend/DB, Chat 01 den unabhängigen Review und spätere Veröffentlichung. Keine parallelen Änderungen an denselben Dateien. Globale Statusdateien bleiben bei 00.

## Vorhandene Bausteine und konkrete Integrationsstellen

| Geprüfte Quelle | Tatsächliches Verhalten | Geplante Verwendung |
| --- | --- | --- |
| `features/intelligence/IntelligenceEntry.tsx` | Optionaler Button führt nach `/intelligence`; im geprüften Worktree kein Aufrufer außerhalb der Route gefunden. Kein Mikrofon-/Providerstart durch den Button. | Später lokaler Launcher; Platzierung zuerst nur auf Home mit dessen Owner abstimmen. Kein ungeprüfter globaler Overlayeinbau. |
| `app/intelligence.tsx`, `IntelligenceRoute.tsx` | Eigene Route; Login, drei Releasegates, eigene Hunde und Serverpolicy werden vor Runtimefreigabe geprüft. | Gate und Identitätsgrenze erhalten; Route als Rückfall-/Direkteinstieg weiter nutzbar. Home-Einstieg und Direktlink müssen dieselben Gates anwenden. |
| `IntelligenceConversation.tsx` | Kontrollierte Oberfläche für Texte, Consent, Audio und Transkript. Beim Unmount werden Aufnahme und Gespräch beendet. Lokaler korrigierter Transkripttext liegt im Component-State. | Controller-/Formularzustand oberhalb der beiden Ansichten halten. Eine Umschaltung darf diese Komponente nicht zweimal mounten oder ihren Cleanup auslösen. |
| `session.ts`, `routeRuntime.ts` | Eine speicherinterne Session pro Account/Hund, Abbruch und Schutz vor verspäteten Ergebnissen; Widerruf und Identitätswechsel sperren/entfernen alte Inhalte. | Ein Runtimeowner für beide Ansichten. Kein zusätzlicher Session-/Gatewayaufbau beim Aufklappen oder Verkleinern. |
| `contract.ts` | V1 mit Text, optional ausgewählten Quellen `unit`/`session`, Serverfehlern und festen Größenlimits. | Unveränderter Drahtvertrag. UI darf keine zusätzlichen Kalender-, Gesundheits-, Dokument- oder Standortfelder senden. |
| `serverSpeechCapture.ts`, `audioCleanup.ts`, `pcmCapture.ts` | Vorbereitete Einmalaufnahme, Transkription und bestätigte lokale Dateilöschung; unklare Löschung sperrt neue Aufnahmen. | Dieselbe Aufnahmeinstanz und Löschsperre in beiden Ansichten; keine zweite Aufnahme für den Sprachraum. |
| `appRuntime.ts`, `releaseGate.ts` | Reale App weiterhin mit `UNAVAILABLE`-Antwortport und ohne Speechport; alle drei Releasegates `false`. Kandidatenadapter existieren separat. | Vorbereitung öffnet diese Sperren nicht. Keine funktionsfähige Kundennutzung allein durch den neuen Launcher. |
| `copy.ts`, `constants/colors.ts` | Text für Tages-/Monatslimit und Fehler sowie bestehende Mint-/Flächentokens. | Wiederverwenden, gut lesbaren Hell-/Dunkelmodus ergänzen; keine neuen globalen Farbwerte. |

## Festgelegter Bedienablauf

1. **Bewusst öffnen:** Ein deutlich beschrifteter Intelligence-Button öffnet den Begleiter. Kein automatisches Begrüßungsgespräch, Mikrofonstart oder kostenpflichtiger Aufruf. Hund und freigegebene Quellen sind sichtbar. Im aktuellen Vertrag wird ein eigener Hund vorausgesetzt; hundeloser Gesprächszugang wäre eine eigene Vertragserweiterung.
2. **Kompakt sprechen oder tippen:** Kleine Mint-Kugel, letzte relevante Antwort, Eingabe und eindeutig beschrifteter Mikrofonbutton. Consent- und Fehlerflächen dürfen mehr Platz beanspruchen; nichts sicherheitsrelevantes wird aus Platzgründen ausgeblendet.
3. **Audio bewusst senden:** Nach separater Audioeinwilligung und Mikrofonrecht startet genau eine begrenzte Aufnahme. „Aufnahme beenden und Text erkennen“ beendet die Aufnahme; Audio geht nur bei gültigen Servergates an den geprüften Transkriptionspfad. Danach korrigierbares Transkript → „Text übernehmen“ → eigene Aktion „Senden“. Übernehmen sendet noch keine Textfrage an die KI. Diese Schritte nicht zu einem automatischen Realtime-Dialog zusammenziehen.
4. **Sprachraum öffnen:** Sichtbarer Button „Gespräch vergrößern“. Derselbe Verlauf, Texteingabe, korrigierter Transkriptentwurf, Hund, Quellenauswahl und Consent bleiben erhalten. Keine neue Request-ID, kein neuer Modellaufruf und keine erneute Zustimmung allein wegen des Layoutwechsels.
5. **Zurück zum Begleiter:** „Verkleinern“ ändert ausschließlich die Darstellung. Der Verlauf bleibt im gleichen laufenden Gespräch erhalten. „Gespräch schließen“ ist eine andere Aktion und beendet es; bei ungesendetem Entwurf klare Bestätigung vor Verwerfen. Kein verstecktes Speichern oder Wiederherstellen über App-Neustart.
6. **Sicher unterbrechen:** Schließen, Account-/Hundwechsel, Widerruf, Routenwechsel und App-Hintergrund stoppen laufende Arbeit über die vorhandenen Owner. Die Audiodatei wird weiter zuverlässig bereinigt. Rückkehr startet keine Aufnahme und sendet keine Anfrage automatisch. Bereits gestartete unklare Kosten bleiben serverseitig reserviert.

Der anfängliche Home-Einstieg wird nicht während einer aktiven Fährte über GPS-/Steuerflächen gelegt. Auf andere Produktmodule wird er erst nach eigener Platzierungsprüfung ausgedehnt. Die bestehenden Audio-Prioritäten und der vorhandene `audioIdle`-Port werden verwendet; Tracking-/Ansagelogik wird nicht dafür geändert.

## Darstellungs- und Lifecyclevertrag

Geplanter lokaler Präsentationszustand: `closed | companion | room`. Fachliche Zustände kommen ausschließlich aus der vorhandenen Session und dem Sprachadapter; keine zweite Kopie von Consent, Policy, Budget oder Aufnahmezustand in der Oberfläche.

| Ereignis | Festgelegtes Verhalten |
| --- | --- |
| Öffnen bei gesperrter Release-/Serverpolicy | Verständlicher gesperrter Zustand; kein Gesprächs-/Quellen-/Audioport wird dadurch aktiviert. Kontodatenschutz bleibt erreichbar. |
| Begleiter ↔ Sprachraum im Leerlauf, bei Texteingabe oder Textantwort | Layout wechseln; gleiche Runtime und gleiche Komponentenidentität; keine Nebenwirkung auf Transport. |
| Wechsel während Transkriptprüfung | Korrigierter lokaler Text bleibt erhalten; Fokus wird sinnvoll auf die entsprechende Überschrift/Eingabe gesetzt. |
| Wechsel während Permission, Aufnahme, Transkription oder Audio-Cleanup | Vergrößern/Verkleinern vorübergehend deaktiviert; „Abbrechen/Schließen“ bleibt verfügbar. Keine verdeckte Aufnahme und keine verschluckte Löschmeldung. |
| Mehrfachtippen auf Öffnen oder Senden | Höchstens ein Host und eine Anfrage; vorhandene Session-/Idempotenzgrenzen bleiben wirksam. |
| Zurück-Taste/Escape/Schließen | Derselbe zentrale Closeweg; Android `onRequestClose` berücksichtigen. Kein Dismiss, das die Cleanupkette umgeht. |
| Serverfehler `DAILY_LIMIT_REACHED` | Gemeinsames Tageskontingent verständlich anzeigen; keine automatische Wiederholung/Providerfallback. Entwurf bei reinem Layoutwechsel erhalten. |
| `BUDGET_EXHAUSTED`, unbekannter Tarif, ungültige Policy oder fehlende Einwilligung | KI-Anfrage gesperrt; vorhandene manuelle Appfunktionen bleiben benutzbar. Kein grünes „bereit“ aus einem UI-Schalter ableiten. |
| Logout/anderer Account oder Hund | Alte Inhalte synchron nicht mehr anzeigen; vorhandene Generation-/Scopeprüfungen erhalten. Keine Konversationsübertragung in den neuen Scope. |

Technische Empfehlung für die spätere Implementierung: ein `IntelligenceAssistantHost` mit genau einer kontrollierten Gesprächskomponente. Die kompakte und große Fläche wechseln Rahmen/Layout innerhalb dieses Hosts. Nicht zwei wechselnde Routerseiten oder zwei unabhängig rendernde Conversation-Komponenten verwenden. Neue Komponenten-/Hooknamen in diesem Absatz sind geplante Dateien, keine vorhandenen APIs. Die Bereinigung im heutigen Conversation-Unmount ist der konkret belegte Grund für diese Struktur.

Der Sprachraum erlaubt mehr aufeinanderfolgende Gesprächsschritte, erweitert aber kein Kontext- oder Kostenlimit. Beibehalten: 2.000 Zeichen je Nachricht, 3.000 Antwortzeichen, maximal acht übertragene Kontextnachrichten und 8.000 Kontextzeichen, 60 Sekunden je Audioaufnahme sowie vorhandene 15-Sekunden-Anfragezeitfenster. Keine unbegrenzte Erinnerung versprechen. Die 15-Minuten-Zulassung betrifft den späteren Testpiloten und ist kein neu eingeführtes Kundenabo- oder Gesprächslimit.

**Engere Providergrenze:** Backend120 `87-cloudflare-free-provider-candidate.mjs` begrenzt den gesamten serialisierten Textrequest auf **4.096 UTF-8-Bytes**, einschließlich Systemanweisung, Hundename, serverseitig geladener Quellen, Nachrichten und JSON-Struktur; zusätzlich muss die konservative Eingabeschätzung zur konfigurierten Tokengrenze passen. Die acht Nachrichten/8.000 Zeichen des V1-Transports sind daher keine garantierte nutzbare Modellkapazität. Bereits ein unter 2.000 Zeichen langer Text mit mehrbyteigen Zeichen oder viele Quellen können vorher abgewiesen werden. Aktuell ergibt das vor Modell-Dispatch `503 UNAVAILABLE`, keinen besonderen „Kontext voll“-Fehlercode.

Vor der späteren UI-Abnahme ausdrücklich ASCII-, Umlaut-/Emoji- und quellenreiche Gesprächsfolgen gegen diesen engeren Pfad prüfen. Die Oberfläche darf bei `UNAVAILABLE` keine Ursache erfinden oder automatisch erneut senden, Quellen entfernen, Inhalte zusammenfassen oder Limits lockern. Entwurf erhalten und die vorhandenen manuellen Wege zum Kürzen, bewussten Quellenwechsel oder neuen Gespräch anbieten. Eine automatische Kontextkürzung wäre ein separates geprüftes Delta; die Client-/Servergrenze lässt sich aus dieser Vorbereitung nicht als bereits nutzbarer langer Chat ausgeben.

**Bewusste Sitzungsentscheidung für das erste UI-Paket:** Keine neue zusätzliche Gesamtsitzungs-Höchstdauer einführen. Der bestehende turnbasierte Vertrag, ausdrückliches Schließen/Unterbrechen, Identitäts-/Consentgrenzen und serverseitige Tages-/Monatslimits bleiben maßgeblich. Das ist keine unbegrenzte Nutzungszusage und keine Behauptung einer serverseitigen Sessionzeitkontrolle. Ein späterer Inaktivitäts- oder Gesamttimer wäre eine eigene UX-Entscheidung und kein Ersatz für Kostenschutz.

**Istzustand und Hostpflicht beim Hintergrundwechsel:** Die heutige Gesprächskomponente allein ruft bei `AppState`-Unterbrechung `speech.cancel()` und `session.interrupt()` auf; `interrupt()` verwirft das Transkript und offene Arbeit, lässt aber Eingabetext und Nachrichten stehen. Der bestehende Routenowner verwendet zusätzlich `runtime.interrupt()`, das über `session.revokeConsent()` auch Eingabe, Nachrichten und Quellenauswahl leert. Beim Quellenwechsel leert `selectSources()` Nachrichten/Transkript und beendet alte Arbeit, erhält aber die aktuelle Eingabe. Diese Wege nicht pauschal gleichsetzen. Ein neuer Overlayhost muss die stärkere Routen-/Privacygrenze bewusst mitführen und separat testen, statt aus der reinen Darstellung einen belegten Löschschutz abzuleiten. Audio-Dateilöschung bleibt ein eigener bestätigungspflichtiger Ablauf.

## Umfang von Aktionen und Datenzugriff

- Allgemeine Unterhaltung über Hundehaltung und Alltag ist Ziel, nicht ausschließlich Training. Inhaltlich darf die Oberfläche nicht den Eindruck einer reinen Trainings-App vermitteln.
- Im ersten UI-Paket nur die tatsächlich geprüften Quellenarten `unit` und `session`; bewusst auswählen, Besitzer-/Hundbezug serverseitig prüfen. Kein automatischer Zugriff auf alle Hundedaten. Keine Modellschulung durch die Quellenauswahl.
- Der vorhandene `trainingNoteDraft()`-Baustein kann ausschließlich den vom Nutzer geprüften aktuellen Text als Trainingsnotizentwurf liefern. Er speichert nicht und ist kein allgemeiner Notiz-/Terminvertrag. Die konkrete Editorübergabe samt Rechte-/Quellenprüfung vor Verdrahtung bestätigen.
- „Notiz diktieren“ und „Termin vorbereiten“ aus dem Design sind gewünschte spätere Aktionen. Allgemeine Gesundheitsnotizen, Kalenderanlage, Push-Erinnerungen oder Änderungen vorhandener Einträge erst nach geprüftem Feld-, Eigentümer-, Zeitzonen-, Quota- und Speichervertrag sowie passendem Umsetzungsauftrag. Bis dahin diese Karten nicht als verfügbare Produktfunktion anzeigen.
- Modelltext ist nie eine Speicheranweisung. „Gespeichert“ erst nach bestätigtem bestehenden Speicherweg. Keine neue KI- oder Audiohistorie in Datenbank oder lokalem Langzeitspeicher in diesem Paket.

## Sprache, Bewegung und Zugänglichkeit

- Leuchtende Mint-Kugel als ausgewähltes Erscheinungsbild, ergänzt durch Zustandswörter. Kein erfundener Lautstärkeausschlag, wenn der native Adapter keinen verifizierten Pegel liefert. Keine dauerhaft laufende dekorative Animation; Reduced Motion ergibt ein ruhiges statisches Bild.
- Große Touchziele (mindestens 44 pt), VoiceOver-/TalkBack-Beschriftungen, lesbare Schriftvergrößerung, klare Zustandsansagen, Safe Area und Tastaturplatz in beiden Ansichten. Fokus nur innerhalb der geöffneten Fläche; nach Schließen zurück zum Launcher. Ein verdeckter Bildschirm darf für Screenreader nicht als zweite aktive Ansicht erscheinen.
- Antwort zunächst immer lesbar. Ein optionaler „Vorlesen“-Knopf ist als separater Adapter-Prüfpunkt vorbereitet. Das vorhandene Paket `expo-speech` ist ein möglicher Weg, aber die tatsächlich in Build 55 enthaltene Fähigkeit, Audiopriorität, Sprachverfügbarkeit und Datenschutz müssen vor Aktivierung belegt sein. Keine kostenpflichtige TTS-API und keine Zusage, dass jede Systemstimme offline arbeitet. Keine neue Stimme durch diesen Auftrag ausgewählt.
- Auf iOS kann System-TTS im Stummmodus schweigen; deshalb bleibt Text gleichwertig. Audioausgabe stoppt bei Aufnahmebeginn, Widerruf, Appwechsel und Schließen. Kein automatisches Abspielen von Alltagsmeldungen oder Gesprächswiederbeginn.
- Nur bestehende RN-/Expo-Abhängigkeiten verwenden; keine neue Nativebibliothek für die Oberfläche. Bestehende SDK54-/RN0.81-Basis erhalten. Daraus folgt noch keine bewiesene OTA-Kompatibilität des späteren Gesamtpakets.

## Gemeinsamer Kostenschutz

**Maximal 5 CHF zusätzliche KI-Kosten je Europe/Zurich-Kalendermonat global**, nicht je Kunde, Gerät, Ansicht, Text- oder Sprachpfad. Enthalten sind zusätzliche Provider-, Plattform-, Übertragungs-, Compute-, Gateway-, Gebühren-, Steuer- und Umrechnungskosten der KI sowie unklare bereits gestartete Reservierungen. Bestehende Supabase-Pro-Grundkosten sind nach direkter menschlicher Klärung ausgeschlossen.

UI-Regeln: keine Anfragen beim Öffnen, Aufklappen, Verkleinern, Re-Rendern oder Hintergrundwechsel; keine Vorschlagsgenerierung, Preloads, versteckte Zusammenfassung, Realtime-Verbindung, automatische Wiederholung oder kostenpflichtige Alternative. Jede zusätzliche Text-/Audioanfrage bleibt an bewusste Aktionen und denselben serverseitigen Ledger gebunden. Ein größerer Gesprächsraum erzeugt kein zweites Budget.

Backend120 bleibt Owner05: Cloudflare Free, zwei fest gebundene Modelle, atomare Tagesreserve und gemeinsamer Monatsledger; unbekannter Tarif oder fehlende Nachweise schließen den Providerweg. Der bekannte GET→POST-Tarifwechsel ist keine atomare Kontosperre und muss im bestehenden Pilot-/Kontobetrieb abgesichert werden. Keine UI-Änderung kann diese Grenze aufheben.

Der aktuelle Receipt126 zeigt Workers Free ohne Zahlungsmethode sowie Supabase Pro mit aktiviertem Spend Cap und freien angezeigten Inklusivmengen. Das ist ein positiver Inventurbefund, **kein vollständiger CHF-5-PASS**. Offen bleiben insbesondere echte Subscription-/Modellnachweise, eindeutige gültige Account-ID/Exklusivität, alte KI-Kostenpfade, zusätzliche Kostenattribution und sichere Live-Abnahme. Die unvalidierte Dashboard-ID nicht ergänzen oder als einsatzfähige Konfiguration übernehmen. Keine neue Safari-Übergabe aus diesem Dokument ableiten.

## Arbeitspakete und Zuständigkeiten

1. **Hier abgeschlossen – Chat 11:** Auswahl im Produktplan festgehalten; Ist-Zustand und Integrationsstellen geprüft; Bedien-/Lifecycle-/Kostenvertrag und Abnahmematrix vorbereitet. Keine Produktcodeänderung.
2. **Nächste lokale Implementierungsstufe – Chat 11:** Host und Darstellungswechsel mit vorhandener Session auf isolierter Quelle umsetzen; Tests mit Fixtures/Mocks. Bestehenden Freeze319 unverändert archiviert lassen, neue UI-Quelle als eigenes Delta binden. Keine realen Endpunkte aktivieren.
3. **Platzierung – über 00 mit Home/UI-Owner abstimmen:** sichtbarer Launcher, Safe-Area-/Tabbar-/Tastaturprüfung, keine Änderungen an globalem Layout/GPS ohne konkreten Scope. Der lokale alte Featurebranch ist nicht unmittelbar die aktuelle Releasequelle.
4. **Backend – Chat 05:** nur bestehende offene Kosten-/Account-/Datenschutznachweise schließen. Falls UI mehr als V1 benötigt, zuerst neuen Backendvertrag reviewen; keine ad-hoc Clientfelder. Dieser Vorbereitungsauftrag ordnet keine Liveaktion an.
5. **Unabhängiger Review – Chat 01:** erst den tatsächlichen neuen UI-Kandidaten prüfen; Layoutwechsel, Autorisierung, Cleanup und Kostenaufrufzahl. Alter Cloudflare-/Clientreview ist kein Review des zukünftigen Hosts.
6. **Separat:** genauer Production-/Token-/Pilotauftrag und nach erfolgreicher Abnahme neue explizite iOS-55-OTA-Freigabe. Android folgt entsprechend der bestehenden Plattformreihenfolge.

## Abnahmematrix für den späteren UI-Kandidaten

| Prüfgruppe | Konkretes Erfolgskriterium |
| --- | --- |
| Darstellung | Begleiter öffnet kompakt; Sprachraum lässt sich bewusst öffnen und verkleinern; dasselbe Gespräch bleibt erhalten. |
| Kein Zusatzaufruf | Spies für Policy-/Consent-/Text-/Audiogateway zeigen beim reinen Layoutwechsel keine neuen Aufrufe; eine laufende Antwort wird nur einmal zugeordnet. |
| Entwürfe | Ungesendete Nachricht und korrigierter Transkripttext überleben Hin-/Rückwechsel; weder Übernehmen noch Aufklappen sendet oder speichert. |
| Audio | Doppeltippen/Permission-Race/Appwechsel/Close/Cleanupfehler: höchstens eine Aufnahme, kein Neustart, bestätigte Löschung oder sichtbare Sperre. |
| Sicherheit | Account-, Hund-, Policywechsel und Widerruf verwerfen alten Kontext; verspätete Ergebnisse werden nicht sichtbar; Releasegates bleiben geschlossen. |
| Kosten/Quota und Kontext | Tageslimit, Monatslimit, unbekannter Tarif und Netzfehler in beiden Ansichten gleich; kein Fallback oder Auto-Retry. Den engeren 4.096-UTF-8-Byte-Providerrequest mit System/Quellen, Mehrbytezeichen und längeren Folgen prüfen; Ablehnung bleibt vor Dispatch ohne erfundenen neuen Fehlercode. Vorhandene Gateway-/Budget-/Consenttests bleiben grün. |
| Plattform/Accessibility | Kleine und große iPhones, Schriftvergrößerung, Hell/Dunkel, Tastatur, VoiceOver, Reduced Motion sowie spätere Android-Zurück-Taste; keine überdeckten wichtigen Controls. |
| Qualität | TypeScript, ESLint, passende Host-/Session-/Route-/Audioregressionen und `git diff --check`; neue Quellen mit Hashmanifest und unabhängiger Prüfung. |

Diese Tabelle ist ein **Prüfauftrag**, kein behauptetes Testergebnis. Gerätesoftwaretests bleiben nach bestehender menschlicher Anweisung zurückgestellt; hier wird keine neue Vorab-Gerätefreigabe erfunden. Offene tatsächlich nicht geprüfte Punkte bei einer späteren Abnahme ausdrücklich ausweisen.

## STOP-Bedingungen und noch offene Freigaben

- Kein Productionwrite, SQL, Token/Secret, Provideraufruf, Commit, Push, Merge, Build oder OTA durch diese Vorbereitung.
- Nicht an alten SQL24-/40-Freigaben anknüpfen; bereits installierte Pakete nicht erneut ausführen. Keine eigenständige Änderung/Sperre von `clever-worker`.
- Nicht freigeben bei unbestätigtem globalem Kostendeckel, ungültigem Tarif-/Modellnachweis, ungeklärtem Datenempfänger, Consent-/Löschfehler, doppeltem Host oder Daten-/Antwortübernahme zwischen Identitäten.
- Keine anderen produktiven Module, Auth/RLS, Abo-/Quotaregeln oder Tracking-/Audioführung für das Design verändern.
- Für die lokale Oberflächenvorbereitung ist keine weitere Nutzerentscheidung nötig. Vor echten Aufrufen fehlen weiterhin geprüfte Konto-/Kostenbedingungen und ein exakt freigegebener Live-Pilot; vor Production und OTA jeweils neue ausdrückliche Freigabe.

## Quellen und Beleggrenzen

- Client319: `outputs/anyvo-intelligence-conversation-20261023/client-cloudflare-daily-319-freeze/MANIFEST.json`, SHA256 `e5850cdbc3814183ef7c7e2a928c16ac9601d6355abda22c2b9f108982de5c50`.
- Backend120: `outputs/ai-gateway-backend-05-20261023/120-cloudflare-free-review-freeze/SOURCE_MANIFEST.json`, SHA256 `2edab3c1a620fea74d10ac6f41ba8b4a7bccc622b97d46c33a88df044054dfeb`.
- Abgestimmter Backend-Vertrag127: `outputs/ai-gateway-backend-05-20261023/127-VOICE-ROOM-BACKEND-CONTRACT-REVIEW.md`, SHA256 `038134ed6ec97a2acd2ae8b000b741c68da17106bd9175a78d5d006c0bd84b86`. In dieser Vorbereitung persönlich gelesen und mit dem UI-Plan abgeglichen: gleiches V1, reiner Layoutwechsel, getrennte Abbruchpfade, engere 4.096-Byte-Providergrenze, keine zusätzliche Produkt-Sitzungshöchstdauer. Keine Backendcodeänderung erforderlich oder durchgeführt.
- Aktueller enger Budget-/Kontobeleg: `outputs/ai-gateway-backend-05-20261023/126-CF-SUPABASE-READONLY-BILLING-20261024.md`; bei späterer Verwendung frisch hashen, weil Owner05 Dokumentationskorrekturen separat pflegt. Keine Account-ID aus dem Bericht als geprüfte Konfiguration verwenden.
- Gewählter interaktiver Entwurf: `/Users/moyo/.codex/visualizations/2026/10/23/01a16669-f37f-7e62-aad7-123fb27e91d5/anyvo-intelligence-assistent.html`; Auswahl „Schwebender Begleiter“ und Ergänzung „Sprachraum“ direkt vom Nutzer bestätigt. Keine visuelle Pixelabnahme einer nativen App daraus ableiten.
- [React Native 0.81 Modal](https://reactnative.dev/docs/0.81/modal), [Accessibility](https://reactnative.dev/docs/0.81/accessibility).
- Expo SDK54-Dokumentation geprüft: Die öffentliche `/versions/v54.0.0/`-Adresse leitet aktuell auf `latest` um. Deshalb vorhandene Versionen im Repository und die offiziellen SDK54-Quellen verwendet, **kein Upgrade** abgeleitet: [LinearGradient SDK54](https://github.com/expo/expo/blob/sdk-54/docs/pages/versions/v54.0.0/sdk/linear-gradient.mdx), [Speech SDK54](https://github.com/expo/expo/blob/sdk-54/docs/pages/versions/v54.0.0/sdk/speech.mdx).

Nur die neue Vorbereitungsdokumentation und die aktuelle Entscheidungszeile im Produktplan wurden in diesem Auftrag geändert. Tests/Hashprüfung dieses Dokumentationsstands sind im separaten lokalen Vorbereitungsreceipt festgehalten; alte 319 Clienttests, 103 Backendtests und 19 Interopprüfungen werden nicht als frisch ausgeführt ausgegeben.
