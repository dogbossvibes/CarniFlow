# Live-Share Release — ios55

Isolierter Release auf der frisch gelesenen Production-Basis `aa09a64f7b11c08eb334dc4808d4bda2ee1d2ce1` für ios / Runtime `1.0.5-motion-v4`.

V3-Ownerquelle 32 Dateien und unabhängig geschlossene Sendetakt-Korrektur; kontrollierte Zwei-Dateien-Aktivierung separat von Chat 02 geprüft. Empfang nur serverautorisierte aktuelle Telefonpositionen, keine Hundesensorpositionen. Start bleibt ausdrücklich, kontogebunden und zeitlich begrenzt; eigener Foreground-Watcher, kein Eingriff in GPS-Aufnahme/Background-Tasks. Stoppen bei Hintergrund/Offline/Kontowechsel; dauerhafte ID-only Widerrufsabsicht, keine GPS-Warteschlange. ACK-basierter Sendetakt, alte Antworten und abgelaufene Leases können keine Freigabe reaktivieren.

Alle bisherigen produktspezifischen Änderungen dieser Zielbasis bleiben erhalten. Keine Übertragung fremder nativer Konfiguration oder vollständiger alter App-Rahmen. Der separate unveröffentlichte Qualitätskandidat f115 ist nicht Bestandteil dieses Pakets.

Tests, genaue Quellen, vollständiger Bundle-/Asset-Abgleich, Production-Environment, native und Server-Belege sowie Veröffentlichungsstatus werden außerhalb des Produktbundles unter `outputs/live-share-release-01-20261023/` gebunden. Ein lokaler Kandidat oder Commit ist noch keine ausgelieferte OTA. Geräte-/Feld- und echte HTTP-Abnahme werden nicht als bestanden behauptet. Keine native Build-/Store-/DB-Aktion.
