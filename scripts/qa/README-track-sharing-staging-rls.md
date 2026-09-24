# ANYVO Staging Track Sharing RLS QA

This runner is for the existing ANYVO Staging project only. It never creates
users, never uses a service-role key, and refuses every Supabase ref except
`cbhrxkjclakzlvajyvfn`. It is the network equivalent of
`supabase/local/track_sharing_security_cases.sql`: same fixture shape and
assertions, run over real Auth sessions against the real Staging schema
instead of synthetic local JWTs.

## Manual setup

In the Supabase Staging Dashboard, create synthetic email/password users with
auto-confirm enabled:

- `OWNER_A_TEST`
- `TRAINER_A_TEST`
- `TRAINER_B_TEST`
- `OWNER_B_TEST`

Do not put passwords in this repository or in chat. Enter them into the local
shell only with `read -s`.

## Local execution

Use only the Staging URL and anon key. The URL is checked against the expected
Staging project ref and the runner rejects service-role credentials.

```bash
export TRACK_QA_SUPABASE_URL='https://cbhrxkjclakzlvajyvfn.supabase.co'
export TRACK_QA_SUPABASE_ANON_KEY='[staging anon key from the approved local QA environment]'

read -r -s TRACK_QA_OWNER_A_PASSWORD
export TRACK_QA_OWNER_A_PASSWORD
read -r -s TRACK_QA_TRAINER_A_PASSWORD
export TRACK_QA_TRAINER_A_PASSWORD
read -r -s TRACK_QA_TRAINER_B_PASSWORD
export TRACK_QA_TRAINER_B_PASSWORD
read -r -s TRACK_QA_OWNER_B_PASSWORD
export TRACK_QA_OWNER_B_PASSWORD

export TRACK_QA_OWNER_A_EMAIL='owner-a-test@example.invalid'
export TRACK_QA_TRAINER_A_EMAIL='trainer-a-test@example.invalid'
export TRACK_QA_TRAINER_B_EMAIL='trainer-b-test@example.invalid'
export TRACK_QA_OWNER_B_EMAIL='owner-b-test@example.invalid'

node scripts/qa/track-sharing-staging-rls.mjs --execute
```

Running the script without `--execute` only prints a dry-run notice and exits
0 — use that to sanity-check the command before supplying real credentials.

`--keep-fixtures` is an explicit opt-in for later device/dashboard QA and must
be reported; the default run removes every fixture row it created (OWNER_A's
QA dog, both QA tracks and their points/markers/runs/engine rows, the
TRAINER_A connection, the share, and all feedback) even if an assertion fails
partway through. It never touches the four Auth users themselves — remove
those from the Dashboard manually if they are no longer needed.

## What it checks

Same coverage as the local suite: OWNER_A owns TRACK_1 and TRACK_2; TRAINER_A
has an accepted `trainer_client` connection and, once shared, full read access
to TRACK_1's session/points/markers/runs/engine rows, persisted analytics and
limited dog/owner display name, but zero access to TRACK_2; TRAINER_B and
OWNER_B (no connection, no share) are blocked from everything including
feedback; feedback create/update (all four reactions)/delete is scoped to its
author with cross-author edits denied; and revoking the share immediately cuts
off TRAINER_A's read and feedback-write access while OWNER_A keeps historical
access. The script prints `TRACK_SHARING_STAGING_RLS|PASS|assertions=<n>` on
success or `...|FAIL` plus the failing stage/assertion on the first violation,
and always attempts cleanup in a `finally` block.

This validates deployed Staging RLS policies only — it is not evidence of
device UI behavior or of anything about Production.
