# ANYVO – gemeinsamer Produktplan und Ideensammlung

Stand: 24. Oktober 2026. Diese Übersicht hält die besprochenen Ziele und Möglichkeiten dauerhaft fest. **Beauftragt bedeutet weder implementiert noch veröffentlicht.** Neue ausdrückliche Nutzerentscheidungen und der geprüfte Projektstand haben Vorrang.

**Aktuelle Gestaltungsentscheidung:** Der Nutzer hat den „schwebenden Begleiter“ als Einstieg gewählt, ergänzt durch den „Sprachraum“ für längere Gespräche. Beauftragt ist jetzt die lokale Vorbereitung der Umsetzung. Beide Ansichten sollen dasselbe Gespräch verwenden. Maximal **5 CHF zusätzliche KI-Kosten pro Europe/Zurich-Kalendermonat insgesamt**, über alle Nutzer sowie Text und Sprache; bestehende Supabase-Pro-Grundkosten sind nach ausdrücklicher Nutzerklärung ausgeschlossen. Keine Productionänderung oder OTA ohne neue Freigabe. Der konkrete [Umsetzungs- und Abnahmeplan](ANYVO-INTELLIGENCE-COMPANION-PREP-2026-10-24.md) bindet diese Entscheidung an den vorhandenen Client-/Backendvertrag. Frühere Konzeptabschnitte unten sind historische Ausgangspunkte und erweitern diesen Auftrag nicht.

**Nachfolgender ausdrücklicher Auftrag vom 24.10.: lokal umsetzen und unabhängig prüfen lassen – lokal abgeschlossen.** Die [App-Implementierung und ihr Abschluss](ANYVO-INTELLIGENCE-COMPANION-ABSCHLUSS-2026-10-24.md) sind vorhanden: ein Host für beide Ansichten, 337 eigene Tests/22 Suites sowie TypeScript und ESLint bestanden. Chat 01 hat den konkreten Code unabhängig geprüft: 104 eigene Tests in sieben iOS-Suites bestanden, keine bestätigten P1-/P2-Befunde. Die Testzahlen werden nicht addiert. Alle Releasegates bleiben geschlossen, der vollständige 5-CHF-Zusatzkostennachweis und reale Geräte-/Providerabnahme bleiben offen. Kein neuer Provideraufruf, KI-Productionwrite, Build oder KI-OTA aus diesem Auftrag.

**Neuester Folgeauftrag vom 24.10.: KI-/iOS55-OTA bedingt freigegeben und Restpunkte zur Umsetzung beauftragt.** Die bestehende Text-/Servertranskriptionsanbindung ist jetzt auch in der App-Laufzeit verdrahtet: ausschließlich nach allen drei bestehenden Releasegates, mit bestehendem authentifiziertem Supabase-Gateway und bewusst gestarteter Expo-PCM-Aufnahme. Der neue lokale Stand besteht 342 Tests in 23 iOS-Suites, TypeScript, ESLint und Diff-Prüfung. Der unabhängige Nachreview dieses konkreten Deltas bei 01 ist bestanden: keine bestätigten P1-/P2-Befunde, 58 zuletzt je Suite bestandene unabhängige Tests in sieben Suites einschließlich drei neuer Negativfälle und TypeScript0 auf der privaten iOS55-Integration. Ein anfänglicher Routentest-Timeout bestand den unveränderten Nachlauf; es war kein einzelner komplett grüner Prüflauf. Die eigenen und unabhängigen Testzahlen werden nicht addiert. Abschluss: `outputs/anyvo-intelligence-app-wiring-20261024/FINAL-LOCAL-CLOSEOUT.json`. Quellenfreeze `outputs/anyvo-intelligence-app-wiring-20261024/candidate-v1/MANIFEST.json`, SHA256 `5a2f11e0ffa1180bbc385d8b838e102ce49e17c4002c1587b742bc17357f4ddf`; Abschlussbeleg `FINAL-LOCAL-VALIDATION.json` im selben Ordner. 07 hat den Home-Einstieg getrennt lokal ergänzt; sein unabhängiger Review durch 01 ist bestanden. 11 hat Home-Freeze `78047175…`, Review `56811327…`, drei lebende Quelldateien und sämtliche zugehörigen Belegbindungen erneut verifiziert (`HOME-AND-RELEASE-REVALIDATION-20261024.json` im App-Wiring-Output). 11 verändert keine Home-/Trackingdateien. Die echte gemeinsame Produktintegration erfolgt durch 01 nach der laufenden iOS55-Releasesequenz auf frisch bestätigter kumulativer Quelle; eine private Vorschau ist kein Releasekandidat. Alle Releasegates bleiben tatsächlich `false`. Der vollständige 5-CHF-Zusatzkostennachweis, reale Providerabnahme und kumulative OTA-Prüfung sind weiter offen. Konto-/Tokenfragen werden ausschließlich bei 00 gebündelt. Noch keine KI-Aktivierung oder KI-OTA und keine Konto-/Token-/Backendmutation aus diesem Folgeauftrag.

## Auf einen Blick

| Bereich | Aktueller Geltungsbereich |
| --- | --- |
| Hundegedächtnis, Spracheingabe, Wiederanknüpfen | Vom Nutzer ausgewählte Produktziele; keine pauschale technische Freigabe |
| UX 3+4 → 1+2 → 5+6 | Bereits beauftragte Reihenfolge bei 07, Abhängigkeiten über 00 |
| Quellen- und Entwurfsadapter | Durch „ausführen“ beauftragt, nach tatsächlichem UX3+4-Freeze und Quellenübergabe durch 00 |
| Schwebender Begleiter und Sprachraum | Lokaler App-Code in der gesperrten Intelligence-Route implementiert; unabhängiger Codereview durch 01 bestanden, nicht aktiviert oder veröffentlicht |
| Stimme und Bewegung | Leuchtende Mint-Kugel aus dem gewählten Entwurf; konkrete Stimme/Vorleseprüfung offen, keine Daueraufnahme oder Realtime-Freigabe |
| Tageshinweis, Wochenrückblick, Tagebuch, Wochenplanung, Stilwahl und weitere Domänen | Ideenspeicher; noch nicht beauftragt |
| Cloudflare Free für Text und Sprache | App-Anbindung lokal ergänzt und mit 342 Tests geprüft; unabhängiger Nachreview durch 01 bestanden, Gesamt-Kostennachweis offen, produktiver Client bleibt gesperrt |
| Neue KI-Persistenz, Production/Nativeänderungen und Releases | Durch diese Dokumentation nicht freigegeben; neue ausdrückliche Freigabe nötig |

**Neueste Plattformentscheidung:** „ios vorziehen danach android“.07 beginnt iOS-UX3+4 ohne auf die Android49-Veröffentlichung zu warten; danach folgen hier die iOS-Quellen-/Entwurfsadapter, anschließend Android-Übernahme und Plattformprüfung. Die UX-Reihenfolge 3+4 → 1+2 → 5+6 bleibt bestehen.

**Nächster Schritt:** den bereits beauftragten deterministischen Adapterplan nach geprüftem iOS-UX-Abschluss fortsetzen. Keine erneute pauschale Umsetzungsfrage; der unabhängige UX-Review und die kumulative Quellenübergabe sind erfolgt. Die schmalen iOS-Adapter sind lokal umgesetzt und geprüft:152Tests, TypeScript und ESLint bestanden. Der unabhängige iOS-Adapterreview V2 ist bestanden. Die lokale Android-Kompatibilitätsprüfung ist ebenfalls bestanden; deren unabhängiger Review und Geräteabnahme bleiben offen. Die Übergabe richtet keine Hintergrundautomation ein.

Direkt zu den Themen:

- [Ziel und Persönlichkeit](#1-das-ziel)
- [Drei ausgewählte Kernideen](#2-vom-nutzer-ausgewählte-kernideen)
- [UX-Reihenfolge und Originalschutz](#3-bereits-beauftragte-ux-reihenfolge)
- [Umsetzungsauftrag für Chat 11](#4-was-chat11-bereits-ausdrücklich-umsetzen-soll)
- [Stimme, Mintpunkte und Gesprächsfläche](#5-stimme-und-bewegung--bisher-konzeptvorschläge)
- [Weitere Möglichkeiten](#6-weitere-möglichkeiten--ideenspeicher-noch-nicht-beauftragt)
- [Verlässlichkeit und Datenschutz](#7-verlässlichkeit-und-datenschutz)

Der [technische Architekturbericht](ANYVO-INTELLIGENCE-ANALYSIS.md) beschreibt Verträge, Grenzen und Tests. Diese Produktübersicht ergänzt ihn und ersetzt nicht den kanonischen Gesamtstatus.

## Wofür dieses Dokument da ist
Hier stehen die bisher besprochenen Produktideen gemeinsam an einem Ort. „Beauftragt“ bedeutet nicht „bereits implementiert“ oder „veröffentlicht“. Beispiele sind gewünschtes Verhalten, keine Aussagen über aktuelle Kundendaten. Bei späteren Änderungen gilt die neueste ausdrückliche Nutzerentscheidung und der geprüfte Projektstand.

## 1. Das Ziel
ANYVO soll ein persönlicher, aufmerksamer Begleiter für Menschen und ihre Hunde werden. Hundeverwaltung und Alltag gehören genauso dazu wie Training. Der Nutzer möchte sichtbare Unterhaltung auf Wunsch mit hilfreicher Unterstützung im Hintergrund kombinieren.
Charaktervorschlag: warm, aufmerksam, ruhig, kompetent und gelegentlich humorvoll. ANYVO erinnert sich an freigegebene Informationen, erklärt Vorschläge und lässt die Entscheidung beim Nutzer. Bei fehlender Grundlage sagt es das verständlich. Die Persönlichkeit entsteht durch konsistentes hilfreiches Verhalten; Stimme und Bewegung können sie ergänzen.

## 2. Vom Nutzer ausgewählte Kernideen
Der Nutzer sagte zu „Hundegedächtnis, Spracheingabe und Wiederanknüpfen“: „hört sich gut an“. Damit sind die Produktziele ausgewählt; externe Sprach- oder Modellintegration ist noch kein freigegebener Implementierungsauftrag.

Hundegedächtnis:
- Passende freigegebene Informationen aus eigenen Einträgen für den gewählten Hund wiederfinden.
- Fakten mit Datum und nachvollziehbarer Quelle zeigen, z.B. frühere Trainingsnotizen.
- Originaldaten, persönliche Präferenzen und abgeleitete Vorschläge unterscheidbar halten.
- Nutzer kann sehen, korrigieren und löschen, was gespeichert wird. Dauerhafte neue Erinnerung braucht erst einen geprüften Datenvertrag.
- Keine vollständige Lebensgeschichte behaupten, wenn nur begrenzte Trainingsquellen geladen wurden.

Spracheingabe:
- Auf bewussten Mikrofonstart kann der Nutzer ein Training oder einen anderen später freigegebenen Eintrag erzählen.
- Aus dem Transkript wird ein sichtbarer, korrigierbarer Entwurf.
- Fehlende Angaben bleiben leer. Der Nutzer bestätigt vor dem Speichern.
- Beispiel: „Heute zehn Minuten Unterordnung, Fussarbeit gut, beim Apport unruhig.“ Daraus soll ein vorbereiteter Eintrag entstehen, kein ungeprüft gespeichertes Ergebnis.
- Text bleibt als gleichwertiger Weg verfügbar. Anbieter, Aufbewahrung, Budget und Nativeverfügbarkeit sind noch zu entscheiden.

Wiederanknüpfen:
- Letztes passendes Training mit Übungen, historischen Notizen und offenen Schwerpunkten zeigen.
- Beispiel: „Beim letzten Mal wolltest du an der Ruhe vor dem Start arbeiten. Für heute übernehmen?“
- Daraus eine neue unabhängige Planung erstellen, Quelle unverändert lassen.
- Später kann ANYVO nachfragen: „Was möchtest du dir fürs nächste Mal merken?“

## 3. Bereits beauftragte UX-Reihenfolge
Nutzerentscheidung: zuerst Punkte3+4, danach1+2, danach5+6. Das ist die UX-Reihenfolge, keine Gesamtfreigabe für KI-API oder neue Backendstrukturen. Aktuelle Abhängigkeiten und Android-/Ownerreihenfolge koordiniert00.

Stufe A – Punkte3+4: Training wiederaufnehmen und Bearbeiten vereinheitlichen.
- Letztes passendes Training für gewählten Hund und Sparte mit Übungen, Bewertungen, Notizen und offenen Schwerpunkten zeigen.
- Bestehende Detailansichten und Editor wiederverwenden.
- In bestehender Detailansicht „Als Vorlage übernehmen“ anbieten.
- Auswahl bisheriger Übungen, offener Trainingsschwerpunkte und geeigneter Ziele.
- Neue unabhängige Trainingseinheit vorbereiten, neue Bewertungen leer lassen.
- NICHT als neue Tatsachen übernehmen: Bewertungen/Ergebnisse, alte Beobachtungsnotizen, Dauer, Medien/Audio, GPS, Start-/Endzeiten.
- Historische Notizen dürfen getrennt als datierte Quellenhinweise sichtbar bleiben.
- Herkunft nur soweit bestehendes Datenmodell tragfähig; keine Migration ohne gesonderte Prüfung/Freigabe.
- Bestehende Speicher-, Abo-/Quota-, Rechte- und Syncwege erhalten. Doppelspeichern, App-Wechsel/Entwurfswiederherstellung und Offlinefehler absichern.
- Konsistentes sichtbares „Bearbeiten“ für eigene bearbeitbare Einträge, zuerst Trainingsjournal und Termine; vorhandene andere Editoren inventarisieren statt duplizieren.
- Abbrechen ohne Datenänderung und klare Speicherbestätigung.
- Ausdrücklicher aktueller Auftrag für dieses Paket: KEIN Commit, Push, Merge, Build, OTA oder Release. Kein Tracking/Auth/RLS/Abo/Audioeingriff. Umsetzung bei07.

Stufe B – Punkte1+2: Tagesübersicht und Schnellerfassung.
- Ruhige Startseitenübersicht „Heute mit deinen Hunden“ aus bestehenden Terminen, Erinnerungen und offenen Aufgaben.
- Erledigtes tritt zurück.
- Einheitliches „+ Erfassen“ für Training, Gewicht, Medikament, Termin und Notiz.
- Zuletzt gewählten Hund deutlich anzeigen/vorbelegen; Wechsel ermöglichen.
- Bestehende Formulare und Datenquellen wiederverwenden, keine zweite Datenhaltung.

Stufe C – Punkte5+6: Hilfe und Begrüssungsverhalten.
- Freiwillige Erste Schritte und kurze kontextbezogene Erklärungen direkt am passenden Ort.
- Fährtenablauf Legen – Liegezeit – Absuche – Auswertung verständlich erklären.
- Aussagen zu GPS nur mit belegter Grundlage; keine universellen Genauigkeitsversprechen.
- Home während Begrüssung sofort nutzbar, automatische Begrüssung höchstens einmal täglich, Ton leicht abschaltbar.
- Bestehenden Tagesgruss von rund2Sekunden, Reduced Motion, Screenreader und Audiopriorität erhalten.

## 4. Was Chat11 bereits ausdrücklich umsetzen soll
In Chat11 antwortete der Nutzer auf „UX3+4 durch07 abschliessen, danach Quellenadapter und Entwurfsadapter; externe Sprache und Konversation benötigen einen gesonderten Auftrag“ mit „ausführen“.
- Damit sind die deterministischen Quellen- und Entwurfsadapter nach dem geprüften UX-Abschluss beauftragt.
- Es braucht dafür keine erneute grundsätzliche Umsetzungsfrage.
- Der erforderliche UX-Freeze hat den unabhängigen Review bestanden;00 hat die kumulative iOS-Basis67ae übergeben. Chat11 hat darauf den lesenden Quellenkontext und die erneute Quellenprüfung vor Historienübernahme lokal ergänzt. Vorlagen und Speicherweg werden wiederverwendet; noch keine Adapterveröffentlichung.
- Externe Sprache, freie Konversation, neue KI-Persistenz, Migration, Modell-APIs, Nativeänderungen und Releases sind dadurch nicht freigegeben.

## 5. Stimme und Bewegung – bisher Konzeptvorschläge
Stimme:
- Warm, klar, natürlich, erwachsen; mittleres Tempo, kurze Sätze, dezenter Humor.
- Zunächst verständliches Hochdeutsch; konkrete Stimme später anhand von Hörproben auswählen. Keine Stimme ausgewählt und keine Sprachsynthese implementiert.
- Beispiel: „Wie lief euer Training heute?“ Nach der Eingabe: „Ich habe deine Beobachtungen vorbereitet. Möchtest du noch etwas ergänzen?“
- Hörbare Antwort vorzugsweise bei bewusst gestarteter Sprachunterhaltung; Alltagshinweise zunächst als Text.
- Nutzer kann Ton und Umfang der Begleitung einstellen.

Fünf Mint-Punkte als visuelle Identität im vorhandenen Design:
- Begrüssung: einmalige sanfte Welle.
- Zuhören: dezente Reaktion auf Lautstärke plus sichtbares „Ich höre zu“.
- Vorbereitung: langsam wandernder Lichtimpuls.
- Sprechen: weiche Bewegung im Sprachrhythmus.
- Erfolgreich gespeichert: kurz ein Häkchen, erst nach bestätigtem Save.
- Kleine ruhige Bewegung, Textäquivalente, Reduced Motion und Screenreader.

Möglicher Einstieg:
- Fester leicht erreichbarer Punktbereich öffnet eine kompakte Gesprächsfläche.
- Texteingabe und optional Mikrofon, lesbares Transkript, Stop/Abbrechen und Vorschau vor Speicherung.
- Keine versteckte Daueraufnahme. Kein selbständiger Neustart einer Aufnahme nach Appwechsel.
- Kein neues animiertes Logo/Pfote aus diesem Vorschlag; bestehende Mint-Punktgestaltung weiterentwickeln.

## 6. Weitere Möglichkeiten – Ideenspeicher, noch nicht beauftragt
- „ANYVO denkt mit“: höchstens ein hilfreicher Hinweis mit direkter Aktion auf der Startseite, wenn ein sinnvoller Anlass besteht.
- Persönliche Wochenrückblicke aus dokumentierten Aktivitäten, schönen Momenten und offenen Vorhaben; Fortschritt nur bei passender Datengrundlage behaupten.
- Erinnerungen mit Anschlussaktion: „Jetzt eintragen“ oder „Später erinnern“.
- Hundetagebuch mit Bildern, Erinnerungen und Meilensteinen, bewusst vom Nutzer gepflegt.
- Wochenplanung aus ausdrücklich genannten Zielen und vorhandenen Einträgen als bestätigbarer Vorschlag.
- Situative Hilfe: „Wie übergebe ich diese Fährte?“ mit passendem Einstieg in vorhandene Funktionen.
- Kommunikationsstil nach Wahl: eher sachlich, herzlich oder verspielt; weniger oder mehr Begleitung.
- Später weitere Domänen wie Termine, Gewicht, Gesundheit und Dokumente. Jede Domäne braucht eigenen Rechte-/Feldvertrag; Trainingsfreigabe ist kein pauschaler Zugriff.

## 7. Verlässlichkeit und Datenschutz
- Erkennbar unterscheiden: „Das hast du eingetragen“, „Das fällt auf“, „Das könntest du ausprobieren“.
- Keine erfundenen Erinnerungen, Diagnosen oder automatischen Kundenänderungen.
- Datenminimierung, Besitzer-/Hundtrennung, Quellenkorrektur/-löschung, verständliche Einwilligung und kontrollierbare Aufbewahrung.
- Mikrofonrecht ist keine pauschale Erlaubnis zur Cloudverarbeitung.
- Bestehende manuelle und deterministische Funktionen bleiben ohne generative KI nutzbar.
- Anbieter- und Modellentscheidung erst nach Prüfung aktueller offizieller Leistungs-/Preis-/Datenschutzinformationen. API-Kosten begrenzen; keine unbegrenzte Hintergrundkommunikation.
- Kundendaten, vorhandene Einträge, Quotas und Berechtigungen erhalten. Keine Neuinstallation oder Datenlöschung als Lösungsweg.

## 8. Zuständigkeit und Fundstellen
11 – ANYVO INTELLIGENCE (technische KI-Arbeit): codex://threads/01a16669-f37f-7e62-aad7-123fb27e91d5
Code-Worktree: /Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-intelligence-analysis
Branch feat/anyvo-intelligence-analysis. Anfangsbasis6877011dc9bdc6cce17d42402fe5a2ae65f5e6c2; aktuelle Plattformbasis vor Umsetzung prüfen.
Architekturbericht dort: docs/agent/tasks/ANYVO-INTELLIGENCE-ANALYSIS.md. Kopfzeile und Abschnitt „Folgeauftrag ausführen“ halten den aktuellen begrenzten Umsetzungsauftrag fest.
Erste Inventur: /Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/anyvo-intelligence-analysis/ANALYSE.txt
„ANYVO KI gestalten“: vorhandener ChatGPT-Konzeptchat6ada7df6-065c-83eb-94ea-6e13315d69d4; [geteilter Konzeptchat](https://chatgpt.com/share/6ada805e-d204-83ed-acd5-8978ae2dfc06). Dessen gesamte Assistentenantworten waren nicht zugänglich; dieses Dokument erfindet daraus keine zusätzlichen Entscheidungen.
00 koordiniert;07 implementiert UX3+4 und betreut bestehende UI/Audioarbeit;01 ist alleiniger Publisher. Keine zweite technische KI-Inventur oder paralleleScreenwriter.

## 9. Wie es weitergeht
Dieses Dokument in Chat11 als gemeinsame Produktübersicht übernehmen und bei neuen Entscheidungen bewusst fortschreiben. Architekturbericht und kanonischer Projektstatus bleiben die technischen Belegquellen. Vorschläge erst nach Nutzerentscheidung als beauftragt markieren. Nach UX-Freeze die bereits beauftragten deterministischen Adapter umsetzen und prüfen; externe Sprache/Konversation später konkret planen und freigeben.

## Herkunft und Pflege

Vollständige Werkstattübergabe übernommen aus `outputs/anyvo-intelligence-handover/ANYVO-PLAN-UND-IDEENSAMMLUNG.txt` im Projektmirror. SHA256 der gelesenen Quelle: `b39e49eda28ed280ab2efd0cb43ea95cdec221dfe5c4b26aded28bf7443cc0fb`; vor Übernahme geprüft. Inhalte wurden lesbar gegliedert; die Statustabelle fasst den bestehenden Auftrag zusammen. Keine zusätzlichen Produktentscheidungen oder Freigaben ergänzt.

Pflege durch Chat 11 im zugeordneten Intelligence-Worktree. Bei neuen Entscheidungen den betroffenen Abschnitt und den Geltungsbereich oben zusammen aktualisieren. Globale Statusdokumente bleiben bei 00; Produktplan ist keine zweite Release-Statusliste.

### Technischer Reviewstand der lokalen Adapter

Der unabhängige Review fand einen verspäteten Formularrücksprung bei langsamer Historienübernahme. Dieser ist lokal gezielt korrigiert: Wer währenddessen weiter- oder zurückgeht, verwirft die offene Übernahme. Die Korrektur liegt getrennt von der bereits freigegebenen UX-/Trackingquelle; unabhängiger Nachreview bleibt erforderlich. Keine Erweiterung des Produktumfangs oder der Releasefreigabe.

### Fortschritt nach iOS-Nachreview

Der iOS-Adapter hat den unabhängigen Nachreview bestanden; der Navigationsfehler ist geschlossen. Gemäß „iOS vorziehen, danach Android“ werden nun beide aktuellen Android-Basen in isolierten Kopien geprüft. Der gemeinsame Adapter passt dort unverändert; die Plattformtests werden getrennt dokumentiert. Keine neue Funktions- oder Releasefreigabe daraus ableiten.

**Android lokal geprüft:** Derselbe geprüfte Adapter passt ohne zusätzliche Produktänderung auf beide unterstützten Android-Basen. Jeweils155Tests mitAndroid-Testpreset, TypeScript undESLint bestanden. Es handelt sich umKompatibilitätsprüfungen inisoliertenKopien; dieAdapter sind damitnoch nichtinReleasequellenintegriert oderveröffentlicht. UnabhängigerAndroidreview über00 folgt.
