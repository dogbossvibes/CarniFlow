# ANYVO – Datenschutz offen kommunizieren (Vorschlag, Stand 2026-11-28)

Ziel: Datenschutz als Stärke von ANYVO sichtbar machen, in Store, Social Media, Website
und in der App. Hundesportler fragen sich bei einer GPS-App zuerst: «Wer sieht, wo ich
trainiere und wo ich wohne?» Darauf soll ANYVO eine klare, ehrliche Antwort geben.

Dieses Dokument ist nur ein Vorschlag. Es wird **nichts** hochgeladen oder veröffentlicht.
Store-Upload, Posts und Website übernimmt die Nutzerin. Die In-App-Änderung (Abschnitt 6)
braucht zuerst ihre Freigabe des Mockups und danach einen eigenen PR.

Regeln:

- Nur Aussagen, die im Code belegt sind (Abschnitt 1). Keine absolute Sicherheitszusage.
- Keine Namen anderer Apps, keine Vergleiche mit Mitbewerbern.
- Ehrlich bei dem, was **nicht** stimmt (Abschnitt 2). Ein Datenschutzversprechen, das
  sich als falsch herausstellt, schadet mehr als gar keines.
- Anrede «du», Schweizer «ss» wie im übrigen Store-Text.

---

## 1. Belegte Aussagen (Prüfung im Code, 2026-11-28, `main` @ dfb8811)

| Aussage | Beleg im Repo |
|---|---|
| Fährten sind privat. Andere sehen eine Fährte nur, wenn du sie gezielt teilst. | RLS «owner via session» in `TRACK_MODULE_SETUP.sql` (Punkte, Marker, Läufe nur für Besitzer:in) |
| Teilen mit dem Trainer geht nur pro Fährte, nur an eine bestätigte Trainer-Verbindung, und ist jederzeit widerrufbar. | `supabase/migrations/20260924110000_track_sharing_feedback.sql` (Policy `track_shares_*`, `revoked_at`, Prüfung in RLS, nicht nur in der App) |
| Es gibt keine öffentliche Fährtenkarte und kein öffentliches Profil mit Fährten. | Keine öffentliche Lese-Policy auf Fährtentabellen gefunden |
| Heimzone: Bereiche rund um dein Zuhause werden aus geteilten Kopien und Exporten entfernt. Wo die ganze Fährte weitergehen muss, warnt ANYVO vorher; «Abbrechen» ist Standard. | `features/home-zone/` (`sharedCopy.ts`, `trainerShare.ts`, `confirm.ts`) |
| Die Heimzonen selbst bleiben nur auf deinem Gerät. | `features/home-zone/store.ts` (Entscheid Issue #115) |
| Daten liegen in der EU (Supabase, Region Irland). | `app/privacy.tsx` Abschnitt 4 |
| Absturzberichte werden in der EU verarbeitet und lassen sich im Profil abschalten. | `lib/monitoring.ts` (`crash_reporting_enabled`), `app/privacy.tsx` Abschnitt 4 |
| Keine Werbung, keine Werbe-Tracking- oder Analyse-SDKs. | `package.json` (keine Ads-/Analytics-SDKs), `app/privacy.tsx` Abschnitt 2 |
| Smart Analyse und Coach rechnen ohne externe KI. Trainingsdaten gehen nicht an einen KI-Anbieter. | App ruft nur die Edge Functions `track-weather` und `notify-comment` auf; Embeddings sind deaktiviert (`features/ai/services/embeddingProvider.ts`). Die Edge Function `generate-coach-summary` existiert, wird aber von der App nicht aufgerufen. |
| Sprachsteuerung: ANYVO speichert weder Audio noch erkannten Text. | `app/privacy.tsx` Abschnitt 3 |
| Fährtenwetter nutzt nur einen auf etwa 1 km gerundeten Standort, ohne Konto und IP-Adresse beim Wetterdienst. | `features/track-weather/`, `app/privacy.tsx` Abschnitt 3 |
| Zugriff ist serverseitig auf dein Konto beschränkt (Row-Level Security). Alle Verbindungen sind verschlüsselt. | SQL-Policies, `app/privacy.tsx` Abschnitt 9 |
| Konto samt allen Daten in der App selbst löschen. | `app/konto-loeschen.tsx` |
| Betreiberin sitzt in der Schweiz; es gilt das Schweizer Datenschutzgesetz, für EU-Nutzer zusätzlich die DSGVO. | `app/privacy.tsx` Abschnitt 1 |

## 2. Was wir NICHT sagen dürfen

| Nicht sagen | Warum |
|---|---|
| «Server in Deutschland» oder «Server in der Schweiz» | Die Daten liegen in Irland (EU). Richtig: «Daten in der EU». |
| «Keine US-Anbieter» | Supabase, RevenueCat, Expo und Sentry sind US-Firmen (mit EU-Speicherung bzw. Standardvertragsklauseln). |
| «Ende-zu-Ende-verschlüsselt» | Stimmt nicht. Verschlüsselt ist die Übertragung (TLS). |
| «Lokale Daten verschlüsselt auf dem Gerät» | Im Code nicht belegt (keine SQLCipher-/Schlüsselkonfiguration gefunden). **Achtung:** `app/privacy.tsx` Abschnitt 7 sagt das heute. Bitte prüfen und die Datenschutzerklärung gegebenenfalls korrigieren (eigener PR). |
| «Deine Daten jederzeit exportieren» (als App-Funktion) | Einen Gesamtexport gibt es in der App nicht. Fährten lassen sich einzeln als PDF/GPX exportieren; alles andere auf Anfrage per E-Mail. |
| «100 % sicher», «niemand kann deine Daten sehen» | Keine absolute Zusage (AGENTS.md). |
| «Ohne KI» ganz allgemein | Spracherkennung läuft je nach Gerät bei Apple/Google. Richtig: «Deine Trainingsdaten gehen an keinen KI-Anbieter.» |

## 3. Kernbotschaft

Drei Varianten, je nach Platz:

1. **Kurz (Slogan):** «Deine Fährten gehören dir.»
2. **Mittel:** «Deine Fährten bleiben privat, bis du sie teilst. Rund um dein Zuhause schneidet ANYVO die Strecke beim Teilen ab.»
3. **Lang:** «Deine Fährten bleiben privat. Du entscheidest, wer sie sieht, und kannst jede Freigabe zurücknehmen. Rund um dein Zuhause schneidet ANYVO die Strecke beim Teilen ab. Deine Daten liegen in der EU, ohne Werbung und ohne KI-Anbieter.»

Variante 1 eignet sich für Bildüberschriften, Variante 2 für den Store-Werbetext und
Posts, Variante 3 für Beschreibung und Website.

Das Alleinstellungsmerkmal ist die **Heimzone**: Sie schützt den Ort, der Hundesportlern
am wichtigsten ist, nämlich die eigene Wohnadresse. Diese Funktion gehört in jede
Datenschutz-Botschaft.

## 4. Store

### 4.1 Neuer Abschnitt in der Beschreibung (ersetzt «DEINE DATEN» in `STORE_AUFTRITT_2026-11.md`)

Deutsch, ca. 470 Zeichen:

> DEINE DATEN GEHÖREN DIR
> • Deine Fährten sind privat. Andere sehen sie nur, wenn du sie teilst, und du kannst jede Freigabe zurücknehmen
> • Heimzone: Rund um dein Zuhause schneidet ANYVO die Strecke beim Teilen und Exportieren ab
> • Daten in der EU, keine Werbung, kein Werbe-Tracking
> • Deine Trainingsdaten gehen an keinen KI-Anbieter
> • Einträge werden zuerst auf dem Gerät gespeichert und später synchronisiert
> • Konto und alle Daten jederzeit selbst in der App löschen

Englisch (Entwurf):

> YOUR DATA STAYS YOURS
> • Your tracks are private. Others only see them if you share them, and you can revoke any share
> • Home zone: ANYVO cuts the area around your home from shared and exported tracks
> • Data stored in the EU, no ads, no ad tracking
> • Your training data is never sent to an AI provider
> • Entries are saved on the device first and synced later
> • Delete your account and all data yourself, right in the app

«Mehrere Hunde in einem Konto» aus dem alten Abschnitt passt besser in den ersten Absatz
oder zu «TRAINING DOKUMENTIEREN».

### 4.2 Werbetext (App Store, max. 170, ohne Review änderbar)

Alternative zum bisherigen Werbetext, 162 Zeichen:

> Fährte, Unterordnung, Schutzdienst und Gesundheit in einer App. Deine Fährten bleiben privat, und rund um dein Zuhause schneidet ANYVO die Strecke beim Teilen ab.

### 4.3 Screenshot

Zusätzliches Bild für Platz 5 oder 6 der Screenshot-Reihenfolge:
Heimzone-Bildschirm mit Kreis um ein (erfundenes) Zuhause.
Überschrift: «Dein Zuhause bleibt privat.»
Nur Testkonto, keine echte Adresse.

### 4.4 Datenschutz-Angaben der Stores

App-Store-«Privacy Nutrition Label» und Google-Play-«Datensicherheit» vor dem Upload mit
dieser Liste abgleichen (Standort, Gesundheitsdaten des Hundes, Fotos/Audio,
Diagnosedaten, Käufe; «nicht zum Tracking verwendet»). Die Angaben dort müssen zur
Botschaft passen, sonst wirkt sie unglaubwürdig.

## 5. Social Media und Website

### 5.1 Post «Dein Zuhause bleibt privat» (Instagram)

> Du trainierst Fährte gleich hinter dem Haus? Dann soll das niemand auf einer Karte sehen.
>
> Mit der Heimzone in ANYVO legst du einen Bereich um dein Zuhause fest. Teilst du eine Fährte mit deinem Trainer oder exportierst sie, schneidet ANYVO diesen Teil ab. Die Heimzone selbst bleibt nur auf deinem Handy.
>
> Deine Fährten gehören dir. 🐾
>
> #fährtenhund #hundesport #igp

Bildidee: Karte mit Fährte, der Teil am Haus ausgegraut, Text «Dein Zuhause bleibt privat».

### 5.2 Post «Wer sieht meine Fährten?» (Karussell, 4 Bilder)

1. «Wer sieht eigentlich deine Fährten?»
2. «Niemand, bis du sie teilst. Es gibt keine öffentliche Karte.»
3. «Du teilst gezielt mit deinem Trainer und kannst die Freigabe jederzeit zurücknehmen.»
4. «Daten in der EU. Keine Werbung. Kein KI-Anbieter. ANYVO – deine Fährten gehören dir.»

Begleittext:

> Bei einer GPS-App ist die wichtigste Frage: Wer sieht, wo ich trainiere? In ANYVO bist das nur du, bis du etwas teilst. Link in der Bio.

### 5.3 Website / FAQ «Wer sieht meine Daten?»

> **Wer sieht meine Fährten?**
> Nur du. Deine Fährten sind privat. Teilst du eine Fährte mit deinem Trainer, sieht er genau diese eine Fährte, so lange, bis du die Freigabe zurücknimmst. Eine öffentliche Fährtenkarte gibt es nicht.
>
> **Was ist die Heimzone?**
> Du legst einen Bereich um dein Zuhause fest. Beim Teilen und Exportieren schneidet ANYVO die Strecke in diesem Bereich ab. Muss eine Fährte vollständig weitergegeben werden, zum Beispiel bei einer Übergabe im Gruppentraining, fragt ANYVO vorher nach. Die Heimzone selbst bleibt nur auf deinem Gerät.
>
> **Wo liegen meine Daten?**
> In der EU (Irland), bei unserem Datenbankanbieter Supabase. Absturzberichte werden ebenfalls in der EU verarbeitet und lassen sich im Profil abschalten. ANYVO wird aus der Schweiz betrieben; es gelten das Schweizer Datenschutzgesetz und für EU-Nutzer die DSGVO.
>
> **Nutzt ANYVO KI mit meinen Daten?**
> Smart Analyse und Coach rechnen ohne externen KI-Anbieter. Deine Trainingsdaten gehen an keinen KI-Dienst. Für die freiwillige Sprachsteuerung nutzt ANYVO die Spracherkennung deines Handys; ANYVO speichert dabei weder Audio noch Text.
>
> **Gibt es Werbung?**
> Nein. Keine Werbung und kein Werbe-Tracking.
>
> **Kann ich alles löschen?**
> Ja. Unter Profil → «Konto löschen» entfernst du dein Konto und alle Daten selbst.

## 6. In der App (Vorschlag, zuerst Mockup)

Oben in **Profil → Datenschutz** (`app/privacy.tsx`) ein Kasten «Auf einen Blick» vor der
ausführlichen Erklärung:

> **Auf einen Blick**
> 🔒 Deine Fährten sind privat, bis du sie teilst.
> 🏠 Heimzone: Dein Zuhause wird beim Teilen abgeschnitten. *(Link «Heimzone einrichten»)*
> 🇪🇺 Daten in der EU. Keine Werbung.
> 🤖 Deine Trainingsdaten gehen an keinen KI-Anbieter.
> 🗑️ Konto und Daten jederzeit selbst löschen.

- Nur Text und ein Link zur vorhandenen Heimzone, keine neue Logik, keine Datenwirkung.
- Per OTA auslieferbar (kein natives Modul). Testweg «Nachher».
- Umsetzung erst nach Freigabe des Mockups, als eigener PR.
- Optional später: derselbe Kasten einmalig nach der ersten gespeicherten Fährte, wenn noch keine Heimzone eingerichtet ist.

## 7. Offene Punkte für die Nutzerin

1. Abschnitt 7 der Datenschutzerklärung («verschlüsselt auf deinem Gerät») prüfen lassen; im Code nicht belegt.
2. Entscheiden, ob «Daten in der EU (Irland)» reicht oder ob ein Umzug der Datenbank in die Schweiz/nach Deutschland gewünscht ist (grosses Vorhaben, Migration nur mit Sicherung und Freigabe).
3. Mockup Abschnitt 6 freigeben oder ändern.
