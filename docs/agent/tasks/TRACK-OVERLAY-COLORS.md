# TRACK-OVERLAY-COLORS — Multi-Dog Track Overlays V2 (Hundefarben, Sichtbarkeit, Name/Legende)

| Feld | Wert |
|---|---|
| **Worktree / Branch** | `../anyvo-track-overlay-colors-1.0.3` · `feat/track-overlay-colors-1.0.3` |
| **Basis** | `5e7220f` (iOS Production zum Startzeitpunkt; ohne lokalen Build-Commit `272c135`) |
| **Status** | `DONE(committed)` lokal — kein Push/Merge/Build/OTA |
| **Production-Migration nötig** | **JA**, vor einer OTA, die die Farbwahl nutzen soll: `20261005120000_dogs_track_overlay_color_key.sql` |
| **Native Build nötig** | NEIN |

## Audit (vorher)

- Bestehende Architektur, unverändert wiederverwendet:
  - Store `trackReferenceOverlays.ts` (rein)
  - Service `trackReferenceOverlayService.ts` (liest lokal Pending und SQLite)
  - Hook `useActiveTrackOverlays` (lädt nur bei geändertem Registry-Schlüssel, nie pro GPS-Fix)
  - Kartenebene `TrackReferenceOverlayLayer` (react-native-maps, iOS und Android)
  - Control `TrackReferenceOverlayControl` (Chip „Andere Fährten · n“ öffnet ein Sheet mit Schalter)
- Einbindung nur in `app/track/legen.tsx`.
- `dogId` und `dogName` kommen aus `useDogs()` (`select('*')`, `owner_id` = Nutzer) und der Registry.
- Vorheriger Linienstil:
  - Referenzlinie: `C.trackWarning` mit ≈ 32 % Deckkraft, 2,5 pt, zIndex 1, ohne Halo.
  - Label: grauer Text, 9,5 pt.
  - Aktuelle Fährte: Mint, 4 pt (Teilstrecken 6 pt), zIndex 2/3.
- Die bestehende Spalte `dogs.color` ist die **Fellfarbe** (Bereich „Identität“) und passt semantisch nicht.

## Umsetzung

- **Neue Spalte** `dogs.track_overlay_color_key text`:
  - nullable, ohne Default, ohne Backfill
  - CHECK-Constraint mit den Werten orange/violet/pink/yellow/blue/cyan/lime (Projektkonvention wie
    `dogs_registry_type_chk`, kein ENUM)
- **RLS:** Die bestehende Policy `dogs_update` (`owner_id = auth.uid()`, `using` und `with check`) deckt die
  Spalte ab. Es gibt keine spaltengenauen GRANTs. Keine neue Policy nötig.
  - Lokal geprüft mit `supabase/local/dogs_track_overlay_color_cases.sql`: 14 Assertions PASS, danach ROLLBACK.
- **Client:**
  - Palette zentral in `constants/colors.ts` (`TRACK_OVERLAY_COLORS`).
  - Auflösung in `features/tracking/utils/trackOverlayColors.ts`: gespeicherter Key, sonst
    FNV-1a(dogId) über den Auto-Pool orange/violet/pink/yellow/blue.
- **Deploy-Schutz:** Der Profil-Abschnitt erscheint nur, wenn die geladene Hundezeile die Spalte enthält. Das
  Feld wird nur bei Änderung gesendet. Ohne Migration bleibt der Profil-Save intakt, und die Overlays nutzen
  den automatischen Fallback.
