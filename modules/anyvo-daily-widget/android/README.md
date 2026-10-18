# Android-Alltagswidget (Owner 04)

Das lokale Expo-Modul ergänzt einen privaten Android AppWidgetProvider. Bestehende
QuickStart-Widget-WIPs, iOS und gemeinsame JS-Dateien bleiben unverändert. Die
Widgetinstallation benötigt einen neuen nativen Build mit der gemeinsamen App-Anbindung.
Der Build-/Releaseauftrag liegt vor; Chat 01 ist alleiniger Publisher.
Es gibt keine neue native Runtime-Abhängigkeit, keine zusätzliche Berechtigung,
keine Netzwerk-/Standortarbeit und keine direkten Datenbankzugriffe.

Gemeinsamer Vertrag und App-Anbindung gehören Chat 03: native ModuleName
`AnyvoDailyWidget`, Android class
`expo.modules.anyvodailywidget.AnyvoDailyWidgetModule`.

- `isAvailable(): boolean`
- `beginSession(ownerId: string | null): string` synchron; neue native Tokenauthority,
  Logout/Ownerwechsel leeren sofort den eigenen abgeleiteten Widgetcache.
- `updateSnapshot(token, sequence, json): Promise<boolean>`
- `updateAvailability(token, sequence, 'offline' | 'error'): Promise<boolean>`

JSON schemaVersion 1 enthält ausschließlich die vereinbarten Epoch-Zeitfelder,
IANA-Zeitzone, Hunde-IDs/-Namen und generische Termin-/Erinnerungsmetadaten. Der
Decoder typisiert/validiert und re-encodiert; andere Felder werden nie gespeichert.
Anzeigen nutzen nur Hundanzahl, Zeiten, Erinnerungsanzahl, Stand und Verfügbarkeit.
Weder Hundenamen noch IDs, Titel, Notizen, Orte oder Gesundheitsdetails werden im
Launcher angezeigt. Der Tap öffnet ausschließlich `anyvo://widgets/today`; die App
prüft die aktuelle Session, ohne Cache-Identitäten aus der URL zu übernehmen.

Frische maximal 15 Minuten, Ablauf maximal sechs Stunden. Offline-/Fehlerstatus
verlängert diese Grenzen nicht. Ablauf, fehlende Session und defekte Daten führen beim nächsten nativen
Render zur neutralen App-Öffnen-/Aktualisieren-Ansicht. Token und strikt steigende Sequenz
verhindern alte Async-Writes; Sitzungstoken werden nicht an JS-Persistenz übergeben.

Der atomare Cache liegt im privaten `noBackupFilesDir`. Systemwidget-Refresh
verwendet den zulässigen 30-Minuten-Takt; App-Updates, Locale-/Zeitzonen-/Datumswechsel
und akzeptierte Veröffentlichungen aktualisieren die Darstellung zusätzlich. Der
Launcher/Android kann Termine und den sichtbaren Ablauf verzögert aktualisieren;
eine exakt zeitgesteuerte Löschung bereits gerenderter Launcher-Views ist damit
nicht garantiert. Der Stand wird angezeigt; dies ist kein Echtzeitdienst.
Sehr kleine Ansicht oder große Schrift fällt auf einen lesbaren App-Schnellzugriff
zurück. Widgets sind ausschließlich für den Homescreen registriert.

Unit-Tests prüfen Decoder/Whitelist, Mehrhund, TTL, Owner-/Logout-/Sequenz-Races,
Offline und Teilansicht. Sie ersetzen weder Launcher-/RemoteViews-Geometrie noch
vollständige App-/Logout-/Offline-Abnahme auf einem echten Gerät.

Jede Widgetinstanz kann eigene Hunde oder „Alle Hunde“ anzeigen. Die native
Konfiguration zeigt Namen nur innerhalb der App. Eine gespeicherte Hundauswahl
besteht ausschließlich aus Owner-/Hund-Digests und ist an eine Widgetbindung
gekoppelt. Gelöschte/fremde Hunde oder verlorene Einstellungen führen zu
„Auswahl nicht verfügbar“, niemals zu einer stillen Erweiterung auf alle Hunde.
Speichern prüft erneut die aktuelle Session und Widgetbindung. Abbrechen speichert
keine ausstehende Auswahl; Widgetlöschung entfernt nur eigene abgeleitete Präferenzen.
Die Einstellungsänderung und die tatsächliche RemoteViews-Veröffentlichung werden
mit Sessionänderungen unter demselben Lock serialisiert.

43 JVM-Tests und die native Modulprüfung sind bestanden. Sie prüfen weder den
vollständigen signierten App-Build noch reale Launcher-/Activity-/Binder-Abläufe.
Prüfnachweis: REPORT-2026-10-14.md. Plattformgrenzen: PARITY-2026-10-14.md.
