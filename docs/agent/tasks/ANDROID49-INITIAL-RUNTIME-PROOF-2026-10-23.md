# Android 49: belegter Initial-Runtime-Override im Release-Werkzeug

## Anlass und Scope

Der tatsächliche Build `008a9051-2e8d-412b-ab27-3b3ead621efb` ist FINISHED: App-Version 1.0.5, Android-Code49, native Runtime `1.0.5-greeting-v1`, Source `f2ed8d78b116310464cb67bcddce58d6179a858b`. Das AAB hat SHA256 `5301f52ba825f3d30a901706dd8863ca5e060726ffc801b262228ef6e45317f0`. Diese Binary-Quelle bleibt unverändert. Kein neuer Build, keine OTA, kein DB-Write für diese Werkzeugkorrektur.

Der zusätzliche Initial-Runtime-Dry-Run verweigerte die Freigabe wegen der pauschalen Gleichsetzung von App-Version und Runtime. Der bereits korrigierte plattformgenaue Runtime-Resolver und das tatsächliche AAB belegen dagegen den expliziten Android-Override. Der fehlgeschlagene reale Dry-Run bleibt in `outputs/android-greeting-native-retry-release-01-2026-10-23/initial-runtime-guard-dry-run.log` erhalten.

## Korrektur

Nur wenn App-Version und Runtime verschieden sind, liest der Initial-Guard die statische app.json vom exakten EAS-Build-Commit. Diese muss die plattformgenaue Runtime und die App-Version des Builds belegen; auch die aktuelle Release-App-Version muss dazu passen. Fehlende, ungültige, unbekannte oder dynamisch überschreibbare native Konfiguration wird abgelehnt und nie ausgewertet. Die bisherigen identischen appVersion-Fälle behalten ihren Vertrag.

FINISHED, ID, Plattform, Runtime, Channel, exakt Profil production, gültiger Source-Hash, Ancestry, Clean-Tree, Environment, gemeinsamer Lock, doppelte Live-Prüfung und Postflight bleiben erhalten. Keine Freigabe anderer Buildprofile; kein Austausch oder Abschwächen der übrigen Guards. Der Guard beweist diese Metadatenbeziehung, ersetzt jedoch keinen vollständigen nativen Kompatibilitäts- und Bundle-Abgleich.

Produkt-JS/TS, Kotlin, native Config, Assets und Datenbankschema bleiben bytegleich zum gebauten Stand f2ed. Diese separate Tooling-Quelle ist nicht als Source des AAB auszugeben.

## Prüfungen und Grenzen

Zwei neue positive Fälle reproduzierten den Fehler am alten Werkzeug;20 negative/unveränderte Fälle bestanden dort bereits. Der neue Guard besteht alle fünf vorhandenen Guard-Suiten und die neue Override-Suite: **6 Suiten/169 Tests PASS,0 übersprungen**. Zusätzliche Fälle sichern die alten Android47/48-Runtimes und malformed native app.json ab. Alle CLI-Fälle laufen in temporären Repositories mit falschem EAS; keine echte Veröffentlichung.

Eine anfängliche Prüfkommando-Liste benannte zwei nicht vorhandene Testdateien.99 Assertions in vier tatsächlich vorhandenen Suiten bestanden, zwei Suite-Ladevorgänge meldeten ENOENT. Dieser Beleg bleibt erhalten; die Abschlussprüfung verwendet die tatsächlich vorhandenen sechs Guard-Suiten. Keine Assertions, Timeout-Grenzen oder Sicherheitsprüfungen wurden abgeschwächt.

Abschließende Zahlen, unabhängiges Review, normaler Quellenbackup und realer Dry-Run werden in den Release-Evidenzen unter `outputs/android49-initial-runtime-guard-fix-01-2026-10-23` gebunden. Geräte-/OEM-/Audio-/Feldtests bleiben ausdrücklich zurückgestellt und sind kein PASS.
