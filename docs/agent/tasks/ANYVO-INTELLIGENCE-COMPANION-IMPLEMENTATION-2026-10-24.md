# ANYVO Intelligence – lokale Umsetzung von Begleiter und Sprachraum

Stand: 24.10.2026. Owner: Chat 11. **Lokaler App-Code vorhanden; 337 Tests, TypeScript und ESLint bestanden. Unabhängiger Codereview läuft. Keine Production- oder OTA-Freigabe.** Die vorherige reine Vorbereitung und deren Review werden nicht als Codeabnahme ausgegeben.

## Auftrag und Quelle

Direkter Nutzerauftrag: „Bitte den schwebenden Begleiter und den Sprachraum jetzt lokal umsetzen und unabhängig prüfen lassen. Weiterhin maximal 5 CHF zusätzliche KI-Kosten pro Monat; keine Productionänderungen oder OTA ohne neue Freigabe.“

Geprüfter Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-intelligence-analysis`; Branch `feat/anyvo-intelligence-conversation-ios-20261023`; HEAD `aa09a64f7b11c08eb334dc4808d4bda2ee1d2ce1`. Vorhandene uncommitted Intelligence-Dateien erhalten. Chat 00 hat Chat 11 als alleinigen Clientwriter bestätigt. Keine globale Handoff-/Masterdatei geändert.

Grundlage: geprüfter V2-Plan `ANYVO-INTELLIGENCE-COMPANION-PREP-2026-10-24.md`, Backendvertrag127 SHA256 `038134ed6ec97a2acd2ae8b000b741c68da17106bd9175a78d5d006c0bd84b86`, historischer Client319 und Backend120. Die eingefrorenen Vorbereitungspakete bleiben unverändert.

## Konkret umgesetzt

| Datei | Änderung |
| --- | --- |
| `features/intelligence/IntelligenceAssistantHost.tsx` | Neuer stabiler Modal-Rahmen mit kompakter Begleiterfläche und großem Sprachraum, Mint-Kugel, Hell-/Dunkelmodus, Safe Area, zugänglichen Layout-/Schließen-Aktionen und bestätigtem Verwerfen eines ruhenden Entwurfs. |
| `features/intelligence/assistantCopy.ts` | Zentrale Beschriftungen für den Host, ohne globale Sprachdateien zu ändern. |
| `features/intelligence/IntelligenceConversation.tsx` | Optional eingebettete Darstellung und scrollbarer Kopfbereich; bestehende Session-, Consent-, Transkript-, Audio- und Transportlogik bleibt erhalten. |
| `features/intelligence/IntelligenceRoute.tsx` | Bestehende authentifizierte und releasegesperrte Route verwendet den Host mit derselben Runtime. |
| `features/intelligence/__tests__/IntelligenceAssistantHost.test.tsx` | Neue tatsächliche Komponenten-/Runtimeprüfungen für Darstellung, lokale Entwürfe, Consent, laufende Anfragen, Permission-Races, Aufnahme/Cleanup, Abbruch, Limits und Identitätsgrenzen. |
| `features/intelligence/__tests__/IntelligenceRoute.test.tsx` | Bestehende Routentests auf zentrale Close-Aktion angepasst; zusätzliche Prüfung einer einzigen Runtime und Policyabfrage bei Ansichtswechsel während laufender Antwort. |

Die Conversation bleibt beim Vergrößern/Verkleinern an derselben Stelle im Komponentenbaum gemountet. Kein zweiter Controller und kein neuer Routeraufruf. Verlauf, aktuelle Eingabe und lokal korrigierter Transkripttext bleiben erhalten. Ein laufender Textrequest behält seinen Abbruchkanal und seine Request-ID; ein Layoutwechsel ist kein weiterer Turn.

Layoutwechsel während Permission, Aufnahme, Transkription und Audio-Cleanup sind gesperrt. Die Handler prüfen den aktuellen Adapterzustand nochmals unmittelbar, damit ein alter Buttonhandler aus demselben Ereignisschritt keine Aufnahme übergeht. Echtes Schließen während laufender Arbeit unterbricht sofort; es lässt kein Mikrofon hinter einer Entwurfsbestätigung weiterlaufen. Androids Modal-Zurück-Aktion verwendet denselben Closeweg. Mehrfachtippen auf echtes Schließen löst den Rücksprung nur einmal aus.

Bei einem ruhenden ungesendeten Entwurf gibt es „Weiter im Gespräch“ und „Verwerfen und schließen“. Der Hintergrund ist während dieser Entscheidung für Screenreader verborgen, und die Tastatur wird für die Entscheidung geschlossen. Die Conversation bleibt darunter erhalten. App-Hintergrund schließt den Bestätigungsdialog und verwendet die stärkere vorhandene Runtime-Unterbrechung: Consent und private Gesprächspuffer werden lokal ungültig; Rückkehr startet oder sendet nichts automatisch. Persistierte Widerrufe und Audio-Cleanup werden weiterhin von ihren bestehenden Ownern verwaltet.

Die Kugel ist bewusst statisch und erzeugt keine künstliche Pegelanzeige oder Daueranimation. Text, Eingabe und Zustandsmeldungen bleiben die verständlichen Träger des Gesprächs. Kopfbereich und Inhalt können scrollen; die Layout-/Schließen-Aktionen bleiben am Rahmen. Native Tastatur-/Schriftvergrößerungs-/Screenreader-Darstellung muss weiterhin auf Geräten abgenommen werden.

## Erhaltene Grenzen

- Kein Provideraufruf durch Öffnen, Vergrößern, Verkleinern oder Re-Rendern. Keine automatische Wiederholung, Zusammenfassung, Cloud-TTS, Realtime-Verbindung, Daueraufnahme oder kostenpflichtige Alternative.
- Bestehende Text-/Audioeinwilligung, Serverrevision, Widerrufs-Outbox, JWT-/Scopekontrolle, generationgebundene Antworten und bestätigte lokale Audio-Löschung werden weiterverwendet. Ein Close/Timeout garantiert keine Rücknahme eines bereits gestarteten Provideraufrufs; dessen Reserve bleibt serverseitig gebunden.
- Längere Gespräche bleiben einzelne bestätigte Turns. Die bestehenden 15-Sekunden-Anfrage-, 60-Sekunden-Audio-, Zeichen- und Kontextgrenzen bleiben bestehen. Kein neues Gesamtzeitlimit; 15 Minuten betreffen allein den späteren Testpiloten.
- Die engere Providergrenze von 4.096 UTF-8-Bytes einschließlich Systemtext, Quellen und JSON bleibt unverändert. V1 mit acht Nachrichten/8.000 Zeichen verspricht keine solche Modellkapazität. `UNAVAILABLE` wird ohne erfundene Ursache und ohne Auto-Retry dargestellt, der Entwurf bleibt erhalten.
- Keine neuen Datenquellen oder Schreibaktionen. Aktueller V1-Quellenvertrag bleibt `unit`/`session`; allgemeine Notizen, Termine, Gesundheit, Dokumente, Standort und autonome Kundendatenänderungen sind nicht ergänzt.
- Alle drei `releaseGate.ts`-Schalter bleiben `false`; `appRuntime.ts` bleibt mit dem gesperrten Antwortport und ohne aktivierten Speechport unverändert. Tests verwenden Mocks/Fixtures. Kein versteckter Entwicklungs- oder URL-Schalter zur Aktivierung.
- Keine Home-/Tabbar-/globale Layoutplatzierung, keine GPS-/Tracking-/Abo-/Auth-/RLS-/Datenbankänderung. Der Host ist lokal in die vorhandene eigene Intelligence-Route integriert; der Startseiten-Einstieg wird später mit deren Owner abgeglichen.
- Vorhandene Expo-/React-Native-Module verwendet; keine Abhängigkeit, Nativekonfiguration, Appversion oder Runtime geändert. Das ist noch keine bestätigte native oder OTA-Abnahme von iOS Build 55.

## Kostenstatus

Unverändert maximal **5 CHF zusätzliche KI-Kosten je Europe/Zurich-Kalendermonat global**, über alle Nutzer, Geräte, beide Ansichten, Text und Sprache. Bestehende Supabase-Pro-Grundkosten sind nach Nutzerklärung ausgeschlossen. Zusätzliche Plattform-, Transfer-, Compute-, Providerkosten sowie Gebühren/Steuern/FX gehören weiterhin dazu.

Der gemeinsame Monatsledger und Tageszähler werden nicht erweitert oder umgangen. Der vollständige Kostenbeleg bleibt **INCOMPLETE**: echte Cloudflare-Account-/Subscription-/Free-Modellnachweise, alte KI-Wege und vollständige zusätzliche Kostenattribution/Preisbindung sowie die gesondert freigegebene Live-Abnahme fehlen weiterhin. Keine neue Kontofreigabe, Tokenanlage oder Productionänderung aus diesem lokalen UI-Auftrag ableiten.

## Prüfbelege und Grenzen

Alle Prüfungen werden in einer eigenen vollständigen lokalen Quellkopie mit denselben Intelligence-Dateien ausgeführt; keine Netz-/Provider-/DB-/Gerätetests und keine native Buildaktion. Die Quellen und das Delta werden separat eingefroren, Client319 und Backend120 bleiben als historische Grundlage erhalten.

Letzter vollständiger Durchlauf am aktuellen Code: **337 Tests in 22 Suites bestanden, keine Fehler oder übersprungenen Tests; TypeScript Exit 0; ESLint für alle Intelligence-Dateien Exit 0 ohne Warnungen.** Der anfängliche vollständige Lauf umfasste 335 Tests, danach wurden zwei Regressionen ergänzt. Die anfängliche isolierte Auswahl hatte einmal einen kalten Modul-Ladezeit-Timeout; die vollständigen Wiederholungsläufe waren grün. Initiale Testtypfehler wurden korrigiert. Die zuerst gemeldeten fehlenden Tracking-Dateien stammten aus einem zu breiten Ausschlussmuster beim Kopieren der isolierten Testquelle (`dist*` erfasste auch `distanceScale.ts`); ausschließlich die private Kopie wurde berichtigt, keine Trackingquelle geändert. Anfangslogs bleiben erhalten. Die exakten Test-/Typ-/Lint- und späteren Reviewresultate werden im Abschlussreceipt an den Quellfreeze gebunden.

Unabhängiger Code-/Lifecycle-Review durch Chat 01 ausdrücklich beauftragt. Dessen früherer Dokumentreview ist keine Abnahme dieses neuen App-Codes. Vor endgültigem lokalem Abschluss belegte Befunde beheben und den korrigierten Freeze erneut prüfen lassen. Produktionsinstallation, Aktivierung, Pilot, OTA und Builds bleiben gesondert freigabepflichtig.
