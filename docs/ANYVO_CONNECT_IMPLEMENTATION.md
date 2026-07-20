# ANYVO CONNECT — Implementierung

Stand: Schritt 1 (Einstieg) + Schritt 2 (Datenmodell, RLS, Typen, Repository,
Privacy-/Entitlement-Services). **Kein Feed/Chat implementiert.** Additiv,
Boot-neutral, hinter Feature-Flag.

## Architektur
- Rein **additiv** in `features/connect/` + eine flag-gated Tab-Route. Keine
  Änderung an Auth, Session, Root-Layout, Native oder bestehenden Tabellen.
- Nutzt bestehende Bausteine: Supabase-Auth/-Client, `dogs`, `useCapabilities`,
  Design-Tokens (`constants/colors.ts`), Logo (`assets/images/icon.png`),
  expo-router-Tabs, React Query.

## Neue Dateien
```
CONNECT_SETUP.sql                                  # additive Migration (nicht ausgeführt)
docs/ANYVO_CONNECT_IMPLEMENTATION.md
features/connect/
  constants/featureFlag.ts                         # CONNECT_ENABLED
  utils/sender.ts                                  # pickConnectSender (rein)
  types/connect.types.ts                           # alle Row-Typen + Enums
  services/connect-entitlements.ts                 # rein (Tier-Logik)
  services/connect-privacy.ts                      # rein (Sichtbarkeit/Sanitizing)
  api/connect.repository.ts                        # Datenzugriffe (limitiert)
  hooks/useConnectSender.ts
  hooks/useConnectEntitlements.ts
  screens/ConnectHomeScreen.tsx
  __tests__/connect.test.ts                        # Flag + Absender
  __tests__/connect-services.test.ts               # Entitlements + Privacy
app/(tabs)/connect.tsx                             # dünne Route
```
Geändert: `app/(tabs)/_layout.tsx` (flag-gated Tab), `.env.example`.

## Neue Tabellen (16)
`connect_profiles`, `connect_dog_profiles`, `connect_friendships`,
`connect_posts`, `connect_post_media`, `connect_post_reactions`,
`connect_post_comments`, `connect_conversations`,
`connect_conversation_members`, `connect_messages`,
`connect_training_events`, **`connect_event_locations`** (separater exakter Ort),
`connect_event_participants`, `connect_blocks`, `connect_reports`,
`connect_privacy_settings`.
Alle mit RLS. `dogs` bleibt Quelle für Name/Bild/Rasse/Geburtsdatum (keine Duplikate).

## RLS-Konzept (rekursionsfrei)
- Jede Tabelle: `enable row level security` + explizite Policies.
- **Keine Policy liest ihre eigene Tabelle direkt.** Sichtbarkeits-Checks laufen
  über **SECURITY-DEFINER-Helfer** (laufen als Owner → umgehen RLS → keine
  Rekursion): `connect_is_blocked`, `connect_are_friends`,
  `connect_is_conv_member`, `connect_event_creator`,
  `connect_is_event_participant`, `connect_dog_owner`, `connect_can_see_post`.
  Alle mit `set search_path = public`, `execute` nur für `authenticated`.
- Kernregeln: eigenes Profil verwalten; private Beiträge nur Autor;
  friends-Beiträge nur bestätigte Freunde; public für alle nicht-geblockten;
  Nachrichten nur Conversation-Mitglieder; Blocks nur für Blockierenden;
  Reports nur für Reporter; **exakter Event-Ort nur Ersteller + bestätigte
  Teilnehmer**; Block wirkt bidirektional.
- **Standortschutz im Datenmodell:** `connect_training_events` enthält nur
  Region/ungefähre Koordinaten (öffentlich); der exakte Treffpunkt liegt in
  `connect_event_locations` mit eigener RLS (statt einer per-RLS nicht
  schützbaren jsonb-Spalte — Abweichung von der Vorgabe zugunsten der Sicherheit).

## Storage-Konzept
Private Buckets `connect-post-media`, `connect-message-media`. Upload/Änderung/
Löschen/Lesen nur im eigenen Pfad `"<user_id>/<random>.<ext>"`
(`(storage.foldername(name))[1] = auth.uid()`). **Kein Public-Read** — Zugriff im
Client über zeitlich begrenzte Signed URLs (wie `SignedImage`). Dateinamen
zufällig, Typ/Größe clientseitig prüfen (Media-Schritt).

## Navigation
Eigener **Connect**-Tab in `app/(tabs)/_layout.tsx`, `href: null` wenn Flag aus
(kein Mount). Verschachtelter CONNECT-Navigator (Feed/Entdecken/Erstellen/Chat/
Profil) folgt in den UI-Schritten.

## Feature-Flag
`EXPO_PUBLIC_FEATURE_CONNECT_ENABLED=true` → `CONNECT_ENABLED`. Aus → kein Tab,
keine CONNECT-Init/-Abfrage beim Start. Statisch (Build-Zeit), keine
Laufzeitkosten.

## Datenschutz / Standortschutz
- `connect-privacy.ts`: `canSeePost` (spiegelt RLS), `sanitizeTrainingForShare`
  (**Whitelist** — GPS-Track, exakter Start, Trainerkommentar, Gesundheit,
  private Notizen, Kundendaten werden nie gelesen), `hasSensitiveTrainingKeys`
  (Guard), `roundApproxCoord` (Region-Anonymisierung ≈1 km).
- Standortberechtigung wird **nie beim Start** angefragt; kein Hintergrundstandort;
  kein `ACCESS_BACKGROUND_LOCATION`.

## Berechtigungen / Abologik
`connect-entitlements.ts` (zentral, rein): `canViewFeed/CreatePost/SendMessage/
CreateEvent/SearchTrainingPartners/CreateGroup/ManageTrainerProfile`, `maxFriends`.
Basis: `isPro` (pro_member), `isTrainerModule`. **MVP: keine harte Paywall** —
solange `EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS` ≠ `true` gilt Vollzugriff; die
Tier-Logik ist vorbereitet und per Flag aktivierbar.

## Bekannte Einschränkungen
- Kein Feed/Chat/Events-UI (Schritt 5–7). Repository deckt bisher Fundament ab
  (Profil, Privacy, Hund-Profil, Freundschaften, Blocks, Reports).
- Group-Visibility/Gruppen-Chats: noch nicht (MVP = direct/friends/public/private).
- DM-Block-Feinheit (Nachricht an Person, die einen blockiert hat) wird im
  Chat-Schritt ergänzt; Datenmodell (`connect_blocks`) ist vorbereitet.

## Test-SQL / Testplan (RLS-Verifikation, im Staging ausführen)
Als eingeloggte Nutzer A/B (echte Sessions oder `set request.jwt.claims`):
```sql
-- 1) Privater Beitrag von A ist für B unsichtbar
--    (als B):
select count(*) from connect_posts p
 where p.author_user_id = '<A>' and p.visibility = 'private';   -- erwartet 0

-- 2) friends-Beitrag nur mit akzeptierter Freundschaft sichtbar
--    ohne Freundschaft (als B): 0; nach accepted: >0
select count(*) from connect_posts where author_user_id='<A>' and visibility='friends';

-- 3) Block verhindert Sichtbarkeit: A blockt B → B sieht A-Beiträge/-Profil nicht
insert into connect_blocks(blocker_user_id, blocked_user_id) values ('<A>','<B>');
--    (als B): 0
select count(*) from connect_profiles where user_id='<A>';

-- 4) Nachrichten nur für Conversation-Mitglieder
--    (als Nicht-Mitglied): 0
select count(*) from connect_messages where conversation_id='<C>';

-- 5) Exakter Event-Ort nur Ersteller/bestätigte Teilnehmer
--    (als Fremder): 0
select count(*) from connect_event_locations where event_id='<E>';
--    Event selbst (Region) bleibt sichtbar:
select region_label from connect_training_events where id='<E>';   -- Region ok, kein exakter Ort

-- 6) Nur eigenes Profil bearbeitbar (als B):
update connect_profiles set bio='hack' where user_id='<A>';        -- 0 rows / verweigert

-- 7) Keine Rekursion: EXPLAIN der Feed-Query terminiert normal
explain analyze select * from connect_posts order by created_at desc limit 20;
```
Client-seitige reine Logik ist durch Jest abgedeckt (`connect-services.test.ts`):
canSeePost (friends/blocked/private/deleted), Sanitizing (entfernt sensible
Werte), Entitlements-Tiers, Feature-Flag-Default AUS.

## Rollback
Migration ist idempotent und additiv. Vollständiges Rollback: der `ROLLBACK`-Block
am Ende von `CONNECT_SETUP.sql` (drop der `connect_*`-Tabellen + Helferfunktionen;
Storage-Buckets separat). App-seitig: `EXPO_PUBLIC_FEATURE_CONNECT_ENABLED=false`
blendet CONNECT sofort und vollständig aus.

## Nächste Ausbaustufen
Schritt 3 (Profil/Privacy/Absender/Mehrhunde-UI) → Schritt 4 (Freunde/Blocks/
Reports-UI) → Schritt 5 (Feed/Beiträge/Reaktionen/Kommentare/Training teilen) →
Schritt 6 (Chat) → Schritt 7 (Trainingspartner/Events + Standortschutz) →
Schritt 8 (Performance/Tests/Plattform/Doku).
