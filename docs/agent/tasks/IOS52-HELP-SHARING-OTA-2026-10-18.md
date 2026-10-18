# iOS Build 52 – Hilfe und Sharing

Freigegebener Scope: neues Sharing-Design, Hilfe/Erste Schritte und kontextbezogene Hilfe für iOS Runtime1.0.5-motion-v2. Direkte Nutzerfreigabe in Chat07:01a14e17-12a3-7530-aec9-3fe9781b9b3d.

Basis: frisch aktive Production-OTA db69a8c7-d637-4491-b8d7-6558ef77d48c / Commit fe1e383b9f7d13c8ec328e080889f8f1380f9e7d. Isolierter Worktree anyvo-release-ios52-help-sharing, Branch release/ios52-help-sharing.

Geprüfte Help-/Sharing-Freezes von07; alle Produktdateien außer dem minimalen HelpButton-Headermerge und kontrollierter Hilfe-Übersetzungsportierung entsprechen den geprüften Ownerquellen. Bestehende native52-, Motion-, Tracking-R2-, Support-, Gruppen-, Transfer- und Datenerhaltverträge bleiben bestehen. Keine native/dependency/runtime/config/DB-Änderung. Joker/Gummi ist separat und nicht enthalten.

43 relevante Testsuiten sowie TypeScript, ESLint und diff-check im Release-Preflight; vollständiger SourceMap-/Bundle-/Asset-/Production-Manifest-/CDN-Abgleich vor/nach Veröffentlichung Pflicht. Operative Belege: outputs/ios52-help-sharing-01-2026-10-18. Vor Publish exakten Sourcecommit durch00 auf GitHub sichern.

Gerätetests ausdrücklich zurückgestellt, tatsächliche Geräteinstallation noch nicht nachgewiesen. Kein nativer Build, Store-Release oder DB-Write aus diesem Scope.
