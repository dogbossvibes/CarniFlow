# ANYVO — Semantik-/KI-Suche (Supabase pgvector)

Semantische Suche über Trainingsnotizen, Übungsnotizen, Trainerfeedback,
Sprachmemo-Transkripte, Medienbeschreibungen und Fährten-Zusammenfassungen.

## Architektur (an die bestehende ANYVO-Struktur angepasst)

| Bereich | Datei |
|---|---|
| DB-Setup (idempotent) | `AI_EMBEDDINGS_SETUP.sql` |
| Edge: Embedding erzeugen | `supabase/functions/generate-training-embedding/index.ts` |
| Edge: semantische Suche | `supabase/functions/search-training-memory/index.ts` |
| Edge: geteilte Embedding-Logik | `supabase/functions/_shared/embedding.ts` |
| Client: Provider-Interface | `features/ai/services/embeddingProvider.ts` |
| Client: Embedding erzeugen | `features/ai/services/trainingEmbeddingService.ts` |
| Client: Suche | `features/ai/services/semanticSearchService.ts` |
| Hook (React Query) | `features/ai/hooks/useSemanticTrainingSearch.ts` |
| UI Smart Search | `app/analyse/smart-search.tsx` |
| UI Insights | `app/analyse/insights.tsx` |

### Bewusste Abweichungen vom generischen Spec
- **Embedding-Modell:** Default **Supabase `gte-small` (384 Dim)** — kein externer API-Key,
  läuft in der Edge-Runtime. Das Projekt nutzt für KI bereits Anthropic (keine OpenAI-Embeddings).
  OpenAI `text-embedding-3-small` (1536) ist als Provider vorbereitet; dann **überall die
  Vektordimension auf 1536 ändern** (`AI_EMBEDDINGS_SETUP.sql` Tabelle + Index + RPC).
- **Coach-RLS:** über das vorhandene Modell `connections` + `can_view(viewer, owner, 'view_trainings')`
  (status `accepted`). **Keine** erfundenen Tabellen `coach_relationships`/`visibility=coach_shared`.
- **DB-Konvention:** ein idempotentes Root-`*_SETUP.sql` statt `supabase/migrations`
  (so werden alle anderen Schemas im Projekt verwaltet).
- **Screens:** `app/analyse/*` als Stack-Routen (wie `app/track/*`), verlinkt aus dem
  Analyse-Tab — die Tabs sind flache Einzeldateien, kein `(tabs)/analyse/`-Ordner.

## Setup-Schritte

### 1. SQL ausführen
`AI_EMBEDDINGS_SETUP.sql` im Supabase SQL-Editor ausführen (idempotent). Aktiviert
`vector`, legt `training_embeddings` (vector(384)), Indexe, RLS und die RPC
`match_training_embeddings` an.

### 2. (Optional) OpenAI-Key setzen — nur wenn OpenAI statt gte-small genutzt wird
```bash
supabase secrets set OPENAI_API_KEY=dein_key --project-ref axkkhyqrjrtbkumaulta
supabase secrets set EMBEDDING_PROVIDER=openai --project-ref axkkhyqrjrtbkumaulta
# zusätzlich AI_EMBEDDINGS_SETUP.sql auf vector(1536) umstellen und neu ausführen
```
`SUPABASE_URL` und `SUPABASE_ANON_KEY` sind in Edge Functions automatisch verfügbar.

### 3. Edge Functions deployen
```bash
supabase functions deploy generate-training-embedding --project-ref axkkhyqrjrtbkumaulta
supabase functions deploy search-training-memory      --project-ref axkkhyqrjrtbkumaulta
```

## Automatische Embeddings
Nach dem Speichern werden Embeddings **non-blocking** erzeugt (Fehler werden nur geloggt,
Training wird trotzdem gespeichert):
- `finishTrainingUnit` / `createDocumentedUnit` → `training_notes` + `exercise_notes`
- Fährten-Auswertung (`app/track/[id].tsx`) → `track_summary`

Beim Löschen werden Embeddings entfernt: Tracks via FK-Cascade (`training_session_id`),
Units via expliziten Delete über `source_id` in `deleteTrainingUnit`.

## Datenschutz
- RLS strikt: `user_id = auth.uid()` für eigene Daten; Trainer-Lesezugriff nur via
  `can_view(...'view_trainings')` (akzeptierte Connection mit Berechtigung).
- Die RPC ist **nicht** `security definer` → die RLS der aufrufenden Person greift,
  auch bei Coach-Suche (`targetUserId`). Keine fremden Trainings durchsuchbar.

## Backfill (bestehende Trainings nachträglich einbetten)
Optional später: bestehende `training_units`/`training_sessions` durchgehen und
`generate-training-embedding` je Eintrag aufrufen (z. B. einmaliges Skript/Edge-Job).
