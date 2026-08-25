# Real-Device-Testplan — Fährtenabsuche: 1-m-Abstand + Off-Track

> GPS-Geometrie, Haptik und Voice sind im Simulator/Emulator NICHT abschließend
> verifizierbar. Dieser Plan ist **release-gated**: ohne bestandene Real-Device-Tests
> keine Freigabe des Off-Track-Increments.
>
> Geräte: mind. 1× iPhone (Core Location) + 1× Android (Location/Raw-GNSS falls aktiv).
> Umgebungen: offene Wiese UND Wald (GPS-Mehrwegeffekte).

## Pro Testfall dokumentieren
| Feld | Wert |
|---|---|
| erwarteter State | on_track / warning / off_track / recovered |
| sichtbarer Hinweis | Banner-Text + Abstand |
| Haptik | einmal / keine |
| Voice | Ansage / keine |
| Fortschritt | eingefroren / läuft |
| Event-Trigger | Winkel/GS/TS/Ende ausgelöst? (soll: nein während off_track) |
| tatsächliches Ergebnis | … |

## Testfälle
- **A. 1-m-Abstand:** Absuche mit 1 m starten → dogProgress = Handler+1; Ansagen/Trigger korrekt.
- **B. 5-m-Abstand:** wie bisher, keine Regression.
- **C. 10-m-Abstand:** wie bisher, keine Regression.
- **D. 3–5 m seitlich abweichen:** erwartet `warning` nach mehreren Fixes, Warn-Banner + 1× leichte Haptik.
- **E. deutlich > 5 m abweichen:** erwartet `off_track`, deutlicher Hinweis + 1× stärkere Haptik + (falls Voice an) „Du weichst von der Fährte ab."
- **F. zurückkehren:** nach mehreren guten Fixes `recovered` + „Wieder auf der Fährte" + 1× positive Haptik.
- **G. einzelner GPS-Ausreißer (10–20 m Sprung):** KEIN off_track, kein Progress-Sprung.
- **H. schlechter GPS-Empfang (accuracy > 20 m):** keine aggressive Off-Track-Warnung; optionaler GPS-Hinweis.
- **I. Wald:** Mehrwegeffekte → keine Fehlalarm-Kaskade.
- **J. offene Wiese:** saubere Warn-/Off-/Recovery-Übergänge.
- **K. Winkel während Abweichung:** während off_track KEINE Winkel-Ansage; nach Recovery kein Nachfeuern.
- **L. GS während Abweichung:** während off_track KEINE GS-Ansage/kein Auto-Fund durch Fehlprojektion.
- **M. parallele/kreuzende Schenkel:** kein Sprung des Fortschritts auf den falschen Schenkel.
- **N. iPhone:** alle obigen Fälle.
- **O. Android:** alle obigen Fälle.

## Zusätzlich
- Stillstand + GPS-Drift im Stand → kein off_track.
- Mehrfaches Verlassen/Zurückkehren → Ereigniszähler & Off-Dauer plausibel.
- Fährtenende während/nach Abweichung → kein doppeltes Ende, keine Trigger-Kaskade.
- Recording/Timer/Karte bleiben während warning/off_track bedienbar (kein modaler Block).

---

# Phase 2 — Banner + Voice/Haptik auf Transitionen (REAL-DEVICE TEST OFFEN / MANUELL ERFORDERLICH)

> Status: **OFFEN — MANUELL ERFORDERLICH.** Commit `bccce35` (feat(tracking): add off-track
> feedback during search) ist auf `origin/feat/track-module-rewrite`. Banner + einmalige
> Voice/Haptik auf echten State-Transitionen sind implementiert; die Wirkung ist im
> Simulator/Emulator NICHT abschliessend verifizierbar (Haptik/Speech/GPS-Rauschen).
> `freezeProgress` bleibt in Phase 2 **ausdrücklich DEAKTIVIERT** (nur Feedback, kein Freeze).
> Screen: `app/track/run.tsx` (Ausarbeiten/Absuche).

## Pro Testfall dokumentieren
| Feld | Wert |
|---|---|
| Übergang | on_track→warning / warning→off_track / →on_track (recovery) |
| Banner | Amber (warning) / Rot (off_track) / Mint (recovery ~2,6 s) / keins |
| Haptik | leicht / stark / positiv / keine — **genau einmal je Transition** |
| Voice (voiceOn) | Ansage / keine — **genau einmal je Transition** |
| Spam | bei gehaltenem State KEIN erneutes Voice/Haptik/Banner-Flackern? |
| Fortschritt | läuft weiter? (Soll: JA — Freeze NICHT aktiv) |
| tatsächliches Ergebnis | … |

## Testfälle Phase 2
- **P2-1 · on_track → warning:** dezentes Amber-Banner „Du entfernst dich von der Fährte"
  wird sichtbar; **1×** leichte Haptik; **1×** Voice (wenn voiceOn). Bei weiterem warning-Fix:
  KEIN erneutes Voice/Haptik, Banner bleibt ruhig stehen (kein Flackern).
- **P2-2 · warning → off_track:** deutlicheres rotes Banner „Du bist neben der Fährte";
  **1×** stärkere Haptik; **1×** Voice. Bei weiterem off_track-Fix: KEIN Spam.
- **P2-3 · off_track → on_track (Recovery):** **1×** positive Haptik; **1×** Voice „Wieder
  auf der Fährte"; grünes Mint-Banner erscheint und verschwindet nach **ca. 2,6 s**
  automatisch; danach KEIN Banner.
- **P2-4 · direktes on_track → off_track:** springt der State direkt (2 Stufen), feuert das
  Off-Track-Feedback (starke Haptik + „Du bist neben der Fährte") **einmalig**.
- **P2-5 · normales on_track:** KEIN Banner, KEINE Off-Track-Haptik, KEINE Off-Track-Voice.
- **P2-6 · GPS-Rauschen / Randbereich der Schwelle:** kein ständiges Flattern
  warning↔off_track, kein Voice-/Haptik-Spam (State-Machine ist debounced; Feedback nur auf
  bestätigter Transition).
- **P2-7 · Recovery-Banner wird unterbrochen:** während das Mint-Banner sichtbar ist, erneut
  abweichen → Recovery-Banner verschwindet sofort, Warn-/Off-Banner übernimmt.
- **P2-8 · voiceOn = aus:** Banner + Haptik funktionieren, aber KEINE Sprachansage.
- **P2-9 · bestehende Guidance:** Winkel-/Gegenstand-/Teilstrecken-Ansagen laufen weiter,
  werden durch Off-Track-Voice nicht dauerhaft verdrängt.
- **P2-10 · freezeProgress bestätigen NICHT aktiv:** während off_track laufen `progressM`,
  Distanz, Hundefortschritt, Timer und Track-Completion normal weiter (Feedback friert
  NICHTS ein). Explizit gegenprüfen.
- **P2-11 · iPhone (Core Location) + Android:** P2-1…P2-10 auf beiden Plattformen.

## Nicht Teil von Phase 2 (Regressions-Check)
- 1-m/5-m/10-m-Suchabstand unverändert (siehe Testfälle A/B/C oben).
- Off-Track-Schwellen und State-Machine (`offTrack.ts`) unverändert.
