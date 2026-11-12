# Permanent ACTIVE-only access — 2026-10-08

## Auftrag und Ausgangspunkt

Direkter Nutzerauftrag in Chat06: „dann active lebenslang freigeben und so einrichten“.
Ersetzt den früheren Zweijahresauftrag. Ziel ist genau ein administrativ dauerhaftes
ACTIVE-Recht; kein TRAINER, Tester-/Diagnosezugang oder kostenpflichtiger Kauf.
Persönliche Accountkennung und gezielte Grant-SQL bleiben außerhalb dieses Repos.

Isolierter Worktree `anyvo-active-lifetime-access`, Branch `feat/active-lifetime-access`,
Basis `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`. Fremde main-Dokumentationsänderungen
wurden nicht übernommen oder verändert. Commitfreigabe stammt aus dem direkten
MASTER-Nutzerauftrag vom 08.10.2026, offene OTAs vorher sauber zu committen.
Chat01 ist alleiniger Release-Executor; hier kein Push, Merge, OTA oder Nativebuild.

## Änderung

- Additives `active_lifetime` im vorhandenen `user_entitlements`-Modell, ausschließlich
  ACTIVE-Capabilities und `pro_member`; separates `hasActiveLifetimeAccess`.
- Permanente Grants verlangen `expires_at IS NULL`; Widerruf bleibt möglich.
  Bestehendes Voll-Lifetime, echte Storekäufe und TRAINER-Rechte bleiben additiv.
- Serverhelper `is_pro_member` berücksichtigt das neue Recht; interne Execute-Rechte,
  bestehende RLS und TRAINER-Helper bleiben geschützt. Keine Capability-/Profil-/
  Subscription-Spiegelung, keine Änderungen an RevenueCat oder Preisen/Trial.
- Membership zeigt ACTIVE / „Dauerhaft freigeschaltet“. Paywall verhindert einen
  zweiten ACTIVE-Kauf, erlaubt optional echtes TRAINER und behauptet dafür kein
  permanentes TRAINER-Recht. Das bisherige NEWBIE-als-Pro-Verhalten in `getUserAccess`
  wird mit `isPremiumPlan` korrigiert und durch einen Negativtest abgesichert.
- Kontoabhängige Access-/Capability-Abfragen aktualisieren beim Mount und Resume.
  Legacy-Dog-AI-Gate verwendet dieselben effektiven Rechte statt eines einmaligen
  Profilreads. Accountwechsel/Widerruf werden berücksichtigt.

## Belegte Prüfungen

- TypeScript `--noEmit`: PASS, Exit 0.
- ESLint aller geänderten/neuen TS-Dateien: Exit 0, 0 Fehler, 1 bestehende Warnung
  (`IconName` in `app/membership.tsx`). Neue Importwarnungen wurden behoben.
- 11 relevante Jest-Suiten, 127 Tests: PASS (10 Suiten/124 Tests und ergänzend
  Capability-Service/3 Tests). Darunter Entitlements, Serviceauflösung, GetUserAccess,
  Legacy-Plan-Gate, Resume, bestehende Membership/NEWBIE, Phase8 und Webhook.
- Nach abschließendem Paywall-Status-Fix: `premium-newbie.test.ts`, 20 Tests PASS.
  Nach Importkorrektur: Capability-Service und GetUserAccess, 7 Tests PASS.
  Wiederholungen erhöhen die obige Anzahl einzigartiger Tests nicht.
- PostgreSQL17 im eigenen isolierten Dockercontainer, synthetische Fixtures:
  `supabase/local/active_lifetime_access_test.sql` PASS, `ACTIVE_LIFETIME_DB|PASS`,
  abschließendes ROLLBACK. Belegt ACTIVE ohne TRAINER, bestehende bezahlte/Voll-
  Lifetime-Rechte, abgelaufenes Lifetime, RLS-Isolation, keine Client-Schreibrechte,
  kein Clientaufruf des internen Quotahelpers, kein ACTIVE-Trainerprofil-INSERT,
  Accountwechsel, ungültige endliche/Doppelgrants, Storeflag-Refresh und Widerruf.
  Dies ist kein vollständiger Production-Quota-RPC-Integrationstest.
- Safari Production-Preflight lesend/ROLLBACK: bestehende Entitlement-Allowlist,
  eigene aktive SELECT-RLS, Update-Trigger und Migrationshistory bestätigt;
  neue Migration noch nicht vorhanden. Kein Live-Schreibvorgang bis hierhin.

## Rollout und verbleibende Abnahme

1. Finales Diff/Whitespace prüfen und nur eigenen Scope committen.
2. Migration `20261008170000_active_lifetime_access.sql` kontrolliert installieren
   und History/Schemabelege prüfen. Sie ist kompatibel mit Altclients; noch keine Grants.
3. Chat01 liefert den Client per autorisiertem OTA auf iOS Runtime1.0.4 aus.
   Alte Clients ignorieren `active_lifetime`; daher kein wirksamer Grant vor Clientrollout.
4. Exakten bereits autorisierten Einzelaccountgrant transaktional/idempotent ausführen,
   Profile/Subscriptions/Capabilities/andere Grants per internen Hashes unverändert prüfen.
5. Unabhängig nach COMMIT: genau ein permanenter unrevokter Grant, Server-Pro=true,
   TRAINER unverändert. Auf iPhone1.0.4 App öffnen/Resume, Membership ACTIVE dauerhaft,
   ACTIVE-Funktion ohne NEWBIE-Quota und professionelles TRAINER weiterhin gesperrt.

Zum Berichtzeitpunkt: keine Migration/Accountfreigabe live ausgeführt, keine Geräte-
oder Kaufabnahme. Release-/DB-Abschlussbelege dürfen diesen Zustand erst nach tatsächlicher
Durchführung ersetzen. Keine persönlichen Adressen/UUIDs in globaler Statusdoku.

## Production-Schema-Nachtrag — 08.10.2026, 17:38 Europe/Zurich

Der Nutzer verlangte nach der konkreten Bestätigungsfrage direkt den Abschluss
(„kannst du es bitte abschliessen?“). Die automatische UI-Prüfung erlaubte daraufhin
die vorbereitete Schemaaktion. Migration und Historyeintrag wurden in einer
Transaktion ausgeführt; Safari zeigte nach COMMIT `ACTIVE_SCHEMA_INSTALLED`.
Die Transaktion prüfte unveränderte RLS-Policies, TRAINER-/Quota-RPC-Definitionen
und Entitlementanzahl. Kein Accountgrant in dieser Transaktion.

Unabhängige Read-only-Nachprüfung am `2026-10-08 15:38:18.459839+00` bestätigt
Historyversion/Name, validierten Permanent-Constraint, erweiterte Allowlist,
ACTIVE-Pro-Helper, gesperrten Client-Execute-Zugriff und aktiviertes RLS.
Production besitzt vorbestehende Supabase-DML-Tabellengrants; eine reine
Tabellenprivilegprüfung ergab deshalb keine Sperre. Entscheidend sind die
bestätigte ausschließlich eigene aktive SELECT-Policy, fehlende Schreibpolicies
und kein `rolbypassrls`/`rolsuper` für anon/authenticated. Diese bestehenden
Privilegien oder Policies wurden nicht verändert. Das lokale Harness wurde
an diese Konfiguration angepasst: INSERT muss an RLS scheitern; UPDATE/DELETE
dürfen trotz DML-Tabellenrechten null Zeilen ändern. Angepasstes Harness erneut
ausgeführt: Exit0, `ACTIVE_LIFETIME_DB|PASS`, ROLLBACK. Keine Appcodeänderung.

Clientrollout und exakter Accountgrant bleiben offen. Safari an MASTER für einen
geordneten Single-Writer-Wechsel freigegeben; kein weiterer Live-Write aus Chat06
ohne erneute abgestimmte Übernahme. Ursprünglicher Report beschreibt den Zustand
vor der Migration und bleibt als Historie erhalten.

## Referenzen

- Architektur: `docs/architecture/ENTITLEMENT_SYSTEM.md`.
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- [React Query React Native / AppState](https://tanstack.com/query/latest/docs/framework/react/react-native).
- [Expo SDK54](https://docs.expo.dev/versions/v54.0.0/).
