# Canonical tracking integration baseline

Base: `c3c67dda8d2b6e8a0ba549f8802a13439b573c37`
Branch: `release/tracking-canonical-runtime-1.0.2`

The following production capabilities are protected during integration:

- Search trace and full replay route
- Live cursor continuity and self-crossing handling
- Search recovery, pause/resume, and app-switch recovery
- Marker sync and local-first session persistence
- Production QA/diagnostics access and route gate
- QA capture/export v2.1, including live motion evidence
- Voice, haptic, and end guidance with recovery deduplication
- Lay and search recorder lifecycle ownership
- Canonical event projection onto the laid track
- Corner detection, motion evidence, and final-corner handling

Parity evidence is maintained against this base with the final integration
report. No later integration may replace these files with the Build-43 base
(`5d2863f`) or remove their tests and fixtures.
