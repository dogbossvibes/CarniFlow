# Local Track Sharing RLS verification

Validated against `supabase_db_anyvo-digital-health-record` through its local
Docker Unix socket. No linked-project, Dashboard or remote database commands.

## Why the schema was incomplete

The existing local database had the Health baseline and migrations (including
`training_sessions`, profiles, dogs, connections and capabilities), but lacked
all four canonical Track child tables. Those tables are created by repository
root setup SQL rather than by the numbered Health migrations. The local history
also did not contain `20260913220000` (the marker constraint extension).

## Preparation performed

First verified that `track_points`, `track_markers`, `track_runs`,
`track_engine_sessions` and `track_shares` did not exist. Then executed these
unchanged canonical sources, in order, using `ON_ERROR_STOP=1` and a transaction:

1. `TRACK_MODULE_SETUP.sql`
2. `TRACK_MARKER_ANGLE.sql`
3. `TRACK_MARKER_MATERIAL.sql`
4. `TRACK_ENGINE_DATA_SETUP.sql`
5. `supabase/migrations/20260913220000_track_markers_contract.sql`
6. `supabase/migrations/20260924110000_track_sharing_feedback.sql`

**Do not rerun `TRACK_MODULE_SETUP.sql` on existing Track tables:** it contains
DROP statements. Here all their targets were verified absent before execution.
No database reset, historical migration editing or migration-history repair was
used. Files were applied directly as SQL; local migration bookkeeping was not
rewritten. `FAEHRTE_SUCHE_SETUP.sql` is obsolete for this path: it targets
`track_sessions`; canonical search geometry is `track_runs.run_points`.

## Repeat only the tests

From this worktree, run:

```sh
docker exec -i supabase_db_anyvo-digital-health-record \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
  < supabase/local/track_sharing_security_cases.sql
```

The `track_sharing_rls_test.sql` entrypoint also includes these cases when run
with filesystem access to both SQL files. Do not stream that entrypoint alone
into a container: its relative include needs the sibling file.

Expected: `TRACK_SHARING_RLS|PASS|assertions=123`, then `ROLLBACK`.
Assertions execute as `authenticated`, with synthetic JWT subjects; fixture
setup alone uses the local database administrator. Unexpected SQL/FK errors
fail the test. An unauthorized INSERT must raise `insufficient_privilege`;
zero affected rows are tested explicitly for forbidden UPDATE/DELETE.

Coverage: two owner tracks; exact shared-track read access to sessions, points,
normal/sharp/object markers, runs/search geometry, engine data and persisted
analytics; accepted-connection enforcement; unrelated trainer/owner denial;
owner replies; all four reactions; own-author edit/delete; cross-author denial;
share identity protection; connection withdrawal; revocation; historical owner
feedback access. All test identities and data roll back.

## Security corrections in the still-unreleased migration

- Feedback and share reads/writes now also require the accepted connection.
- Share/feedback identities cannot be retargeted by UPDATE; revoked shares
  cannot be resurrected. Owner revocation works after a connection ends.
- Helper calls are bound to `auth.uid()` and unavailable to anonymous users.
- No new SELECT policy on dogs or profiles. `shared_track_display` returns only
  the exact shared track's dog/owner names. The share service and trainer detail
  consume those names without expanding access to complete profile/dog rows.

RLS is enabled on all seven Track/sharing tables. Fixture cleanup was checked:
zero track QA users, shares and feedback remained. These are local security
results, not evidence of deployed Staging policies or device UI testing.
Replay remains a follow-up; no recording, analytics or replay generation code
was changed.
