# P1 – enger Android-Hookport

## Auftrag und Quelle

Chat 01 hat nach der direkten MASTER-Freigabe `01a15988-5dec-7ed0-a2b9-c44877ef7222`
den kleinsten gleichwertigen Android-Port beauftragt. Chat 02 ist alleiniger
Writer dieses Ports. Release, GitHub-Sicherung und OTA bleiben bei 01/MASTER.

- Eigener Worktree: `anyvo-tracking-line-ema-p1-android`.
- Branch: `fix/tracking-line-ema-p1-android`.
- Basis Android 1.0.5: `b272f1f41b829aa6d199ae1a2fff1600f35a27aa`.
- Zweites vorgesehenes Ziel Android 1.0.4: `1e13b50745e696e461af2f11d48492d6d9031031`.
- `useTrackRecorder.ts` ist in beiden Basen bytegleich, SHA256
  `ba9627ae8263323d3711594d8a6be1693f74e59251e2414dc9f4f6ab6dc88262`.
- Beide Android-Basen enthalten keinen `layProcessingSession.ts`. Ein reiner
  Session-Processor-Port hätte dort keine Wirkung.
- Die älteren iOS-Ziele e8fe260/a3d5dab verwenden dagegen bereits den gegenüber
  49a5784 unveränderten Session-Processor. Dort ist der bestehende P1-Delta
  unmittelbar am Processor anzuwenden, kein alter Hookport nötig.

## Änderung

Einzige Produktdatei: `features/tracking/hooks/useTrackRecorder.ts`.
Der 17-Zeilen-Delta entspricht semantisch exakt dem geprüften Processor-Fix
57a6c5e: Bei einem durch den aktuellen zugelassenen Detektor-Fix erkannten
Zonenwechsel wird die Linien-EMA vom Zustand **vor** diesem Rohfix neu berechnet.
Gate und EMA benutzen dadurch dieselbe aktuelle Zone; keine Doppelglättung.

Warmup, Pause, Start-Lock und Accuracy-/Sprung-Ablehnungen behalten ihren Verlauf.
BUILD40 bleibt bei EMA 0,4. Distanzkette, Detektor, Puck, Schwellen, Qualitätsgates,
Winkelausschluss, Fusion, Joker/Gummi und Speichervertrag werden nicht verändert.
Keine Session-Engine-, Background-, Continuity- oder native Migration.

## Tests und Review

`useTrackRecorder.androidP0.test.tsx` erweitert den vorhandenen echten Hook-Test
um vier Fälle: Links, Rechts, BUILD40 sowie Pause/Accuracy-/Sprung-Ablehnungen.
Positionsquelle und Persistenz sind gemockt; Detektor und Kurvenzonenfunktion
laufen tatsächlich. Die Zonenfunktion wird nur beobachtet, nicht ersetzt.
Prüfung der gespeicherten Linienpunkte nach den aktuellen Zonenübergängen.

Vor Änderung: beide CURRENT-Richtungsfälle FAIL am ersten Kurvenübergang,
BUILD40 PASS. Nach Änderung: alle vier neuen Fälle und die übrigen Hookfälle PASS.
Insgesamt **10 Suites / 155 Tests PASS**: Hook, Android-Background-/Lifecycle-
Schutz, Start/Warmup, Android-Diagnostik, kanonische Distanz, vorhandene reale
Gate-/Fusion-Fixtures, Short-Leg sowie Gegenstands-/Joker-/Score-Regressionen.
Die realen Fixtures sind vorhandene Wiedergaben, keine neue Geräteabnahme.

TypeScript, ESLint und `git diff --check` werden im gebundenen Abschlussmanifest
mit ihren tatsächlichen Ergebnissen dokumentiert. Keine Änderungen an
Abhängigkeiten oder nativer Konfiguration. Der iOS-Processor-Vergleich mit elf
realen Streams ist separat dokumentiert; er wird nicht als Android-Gerätetest
ausgegeben. Frühere synthetische CURRENT-Klassifikationsänderung rechts →
spitz_rechts bleibt eine mögliche Timingwirkung, keine neue Feldgarantie.

## Übergabe

Review-Freeze und Patch unter
`outputs/tracking-line-ema-p1-android-2026-10-20/`.
Genau zwei Code-/Testdateien und dieser eigene Bericht; keine globalen Dateien.
Chat 01 übernimmt den geprüften Delta auf die frischen Android-Releasequellen,
prüft Commit/Runtime/Native-/Environment-/Ancestry und veröffentlicht selbst.
Von Chat 02 kein Commit, Push, OTA, Build, Store-, main- oder DB-Schritt.
Reale Geräte-QA ist vom Nutzer zurückgestellt.
