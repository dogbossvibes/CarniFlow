# ANYVO iOS Build 55 — GitHub Cloud-EAS-Preflight (nur lesend)

**Status: VORBEREITET, NICHT LIVE BESTANDEN, KEINE OTA-FREIGABE.**
Dieser Infrastruktur-Branch basiert auf `main` (ohne `main` zu verändern); er ist **nicht** die App-Releasequelle. Der für die Prüfungen fest gebundene iOS55-Quellcommit ist `5bec4417fc85f79e67f387126386617536992df3`, Runtime `1.0.5-motion-v4`, App 1.0.5 / Build 55.

## 1. Einmalige Einrichtung durch die Repository-Eigentümerin

Die GitHub-Anbindung dieses Chats kann **keine Environments oder Secrets** einrichten. Zugangsdaten niemals im Chat, in GitHub-Dateien, in PR-Kommentaren oder Screenshots offenlegen.

1. Auf dem iPhone **Safari** verwenden, bei GitHub mit dem Repository-Owner anmelden und `https://github.com/dogbossvibes/CarniFlow` öffnen. Ein 404 auf `/settings/environments` bei nicht angemeldeter Sitzung ist **kein Repo-Verlust**. Falls nötig „Desktop-Website anfordern“. Auf der Repository-Seite: **Settings → Environments → New environment**.
2. Umgebung exakt **`anyvo-ios55-eas-preflight`** erstellen. **Deployment branches: Selected branches and tags → Branch `main`**; nicht „alle Branches“.
3. **Required reviewers** aktivieren und einen berechtigten GitHub-Reviewer festlegen. „Prevent self-review“ nur aktivieren, wenn eine zweite prüfberechtigte Person die Freigabe tatsächlich übernehmen kann. Wo verfügbar, das Umgehen der Regeln durch Admins deaktivieren.
4. In Expo unter `https://expo.dev/settings/access-tokens` einen gesonderten, möglichst eng berechtigten **Expo-Zugangstoken** für den bereits verbundenen ANYVO-EAS-Projektzugriff erstellen (Projekt/Account-Berechtigung prüfen).
5. Unter **Environment secrets** der Umgebung (NICHT Repository secrets) einen Secret-Eintrag `EXPO_TOKEN` anlegen und den Wert **ausschließlich dort** einsetzen. Kein Personal Access Token von GitHub, keine Supabase-Schlüssel, kein Passwort. Wert niemals per Screenshot versenden.
6. Sichere Kette vor manueller Ausführung: Workflow als CI-only PR begutachten, dessen gesondertes Merge nach `main` ausdrücklich genehmigen, prüfen, dass Umgebungsschutz und Geheimnis vorhanden sind. **Keine Appcode- oder Release-Branch-Merges.**

## 2. Manuelles Prüfen vom iPhone

Erst **nach** der gesondert freigegebenen Integration dieses CI-Workflows nach `main`: In GitHub → Actions → **ANYVO iOS55 Live EAS Preflight (NO OTA)** → Run workflow → Branch **main** → Run. Falls GitHub die Umgebung blockiert, auf „Review deployments“ die richtige Umgebung freigeben. Die Ausführung verwendet kein Auto-Publish.

Der Workflow bricht ab, wenn die Umgebung keinen Required Reviewer oder keine Einschränkung auf ausgewählte Branches hat, das Secret fehlt oder der eingefrorene Release-Source-/Runtime-Check nicht passt. Er liest mit dem bestehenden `scripts/update-production.mjs --dry-run` den aktuellen EAS Production-Stand, das Environment und die Ancestry, ohne `eas update` auszuführen oder Werte von Environment-Secrets auszugeben.

**Ein grüner Live-EAS-Preflight autorisiert noch keine Veröffentlichung.** Vor einer OTA: unabhängiger Review von PR #8, normal-auth/RLS-Gerätetest, frischer Preflight direkt vor Publish, unabhängiger Release-Lock über Geräte/CI hinweg, exakte Source-Backups, Bundle-/Asset-/CDN-Postflight. Der vorhandene Repo-Wrapper hat nur den gemeinsamen lokalen Git-Lock; **ein CI-Runner teilt diesen Lock nicht mit dem Mac**. Production-Release daher bis zu einem gesondert geprüften cloudweiten Publisher-Konzept gesperrt.

## 3. Verbindlicher Status

- Diagnose-Quell-PR [#8](https://github.com/dogbossvibes/CarniFlow/pull/8) ist Draft/Review-only. Nicht mergen, nicht veröffentlichen.
- [QA-Lauf 40855671976](https://github.com/dogbossvibes/CarniFlow/actions/runs/40855671976): 6'394/6'394 Tests, Typecheck und Lint bestanden (Lint-Warnungen). Das belegt keine normale iPhone-RLS-Abfrage.
- Installierte letzte iOS55-OTA auf dem Gerät laut Nutzernachweis: `01a186b3-1ae2-7d35-a4a0-15474b7eb19e`. Neue OTA **nicht** veröffentlicht.
- Diese CI-Konfiguration darf nur lesende Live-EAS-Abfragen ausführen. Keine Deploy-, Build-, DB-, Account-, Merge- oder Release-Aktion.

Offizielle Anleitung: `https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments` und `https://docs.expo.dev/accounts/programmatic-access/`.
