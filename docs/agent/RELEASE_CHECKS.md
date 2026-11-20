# Pflichtprüfungen vor einer Production-OTA

Stand: 2026-11-20. Ergänzt die Release-Regeln in `AGENTS.md`; ersetzt sie nicht.
Alles läuft lokal und nur lesend gegenüber EAS: keine Veröffentlichung, kein Build,
keine CI-Minuten.

## Ablauf je Plattform

1. Release-Worktree auf den Kandidaten bringen (aktive Production plus freigegebener
   Stand von `main`), sauber committet.
2. Pflichtprüfungen am exakten Commit:

   ```bash
   npm run release:check -- --platform ios --base <aktiver Production-Commit> --evidence <Belegordner>
   ```

   Führt aus: Typecheck, ESLint (geänderte Dateien seit `--base`), `git diff --check`,
   Jest (App-Verzeichnisse, Zeitzone Europe/Zurich), OTA-Abdeckung (`--live`).
   Schreibt Logs und `checks.json` in den Belegordner. Exit 1, wenn etwas nicht besteht.
3. Unabhängige Review in `<Belegordner>/review.md` (Zeile 1 `reviewer: independent-agent`,
   Zeile 2 `sourceCommit: <voller SHA>`, letzte Zeile `VERDICT: PASS`).
4. Nachweis bauen:

   ```bash
   npm run release:receipt -- --platform ios --runtime <Runtime> --scope "<Inhalt>" --evidence <Belegordner>
   ```

   Verweigert, wenn eine Prüfung nicht bestanden ist, `checks.json` oder `review.md`
   zu einem anderen Commit gehören oder das Urteil nicht `PASS` ist.
5. Veröffentlichen nur über `scripts/update-production.mjs` mit
   `--quality-evidence <Belegordner>/quality-receipt.json` und nur nach Freigabe der
   Nutzerin für die konkrete Charge.

`--base` immer frisch aus EAS lesen, nie aus der Statusdoku.

## OTA-Verzeichnis

- `docs/agent/ota-ledger.json` nach jeder OTA-Charge auffrischen
  (`npm run release:refresh:ota-ledger`, als Doku-/Chore-PR). Ist es alt, fragt die
  Abdeckungsprüfung jede neuere OTA einzeln bei EAS ab und wird langsam.
- Jeder EAS-Aufruf der Abdeckungsprüfung hat ein Zeitlimit von 120 s
  (`OTA_COVERAGE_EAS_TIMEOUT_MS`). Läuft es ab, endet die Prüfung mit STOP statt zu hängen.

## Grenzen

- Belege liegen ausserhalb des Repos (z. B. `outputs/`), nie committen.
- Die Prüfungen ersetzen keinen Gerätetest (Tracking/GPS, Mitteilungen, Kamera, Bezahlung).
- Emulator und Simulator nie von zwei Sitzungen gleichzeitig benutzen.
