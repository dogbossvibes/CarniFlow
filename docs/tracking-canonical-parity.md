# Canonical tracking integration parity

Basis: `c3c67dda8d2b6e8a0ba549f8802a13439b573c37`\
Branch: `release/tracking-canonical-runtime-1.0.2`

| Funktion | c3c67dd | Integrationsstand | Erhalten | Test/Beweis |
|---|---|---|---|---|
| Search Trace / Recorder | vorhanden | vorhanden, Location-Owner-Fix ergänzt | JA | `searchLocationOwnership`, Search-Recorder-Suite |
| Replay / vollständige Route | vorhanden | vorhanden, v3-Analytics und Marker-Taps ergänzt | JA | Replay-Screen, Replay-Route, Track-Replay-Suite |
| Cursor / Self Crossing | vorhanden | unverändert auf c3-Basis | JA | `liveCursorSelfCrossing`, `canonicalArcSelfCrossing` |
| Recovery / Pause / App-Wechsel | vorhanden | erhalten, Sample-Unterbrechungen zusätzlich segmentiert | JA | Recovery-/Pause-/Resume-Suite, v3 gap test |
| Marker-Sync / lokale Daten | vorhanden | erhalten, Analytics ergänzt ohne Markerposition zu ersetzen | JA | Marker-/Sync-/local-track Suites |
| QA-Diagnose-Route | vorhanden | erhalten | JA | QA route/access/export suites |
| QA v2.1 Capture/Export | vorhanden | erhalten, Motion-Log nutzt dieselbe Trailing-Evidenz | JA | `qaTrackExport`, `qaExportV21Motion`, `qaSessionCapture` |
| Voice/Haptic/End Guidance | vorhanden | erhalten | JA | Guidance lifecycle/recovery suites |
| Lay/Search Recorder | vorhanden | erhalten, `5e7507f` semantisch integriert | JA | location ownership + recorder suites |
| Winkel/Motion/Stop-Flush | vorhanden | f8 integriert; Abstandsschutz und Evidenzfenster vereinheitlicht | JA | corner, motion, stop-flush suites |
| Kanonische Eventposition | vorhanden | `eventArcs`/Replay/Analytics getrennt fortgeführt | JA | `run-canonical-arc`, canonicalArc suites |

Die 137 Tracking-/`app/track`-Suites liefen mit 1611 Tests PASS. TypeScript
(`tsc --noEmit`) lief PASS; ESLint lief mit 0 Fehlern und bestehenden Warnungen.
Ein realer Outdoor-/iOS-Sensorlauf ist durch diese Tests nicht ersetzt.
