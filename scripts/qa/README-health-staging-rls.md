# ANYVO Staging Health RLS QA

This runner is for the existing ANYVO Staging project only. It never creates
users, never uses a service-role key, and refuses every Supabase ref except
`cbhrxkjclakzlvajyvfn`.

## Manual setup

In the Supabase Staging Dashboard, create synthetic email/password users with
auto-confirm enabled:

- `OWNER_TEST`
- `TRAINER_TEST`
- `VET_TEST`
- `FAMILY_TEST`
- `UNRELATED_TEST`

For cross-owner checks, create an additional `OWNER_B_TEST` user.

Do not put passwords in this repository or in chat. Enter them into the local
shell only with `read -s`.

## Local execution

Use only the Staging URL and anon key. The URL is checked against the expected
Staging project ref and the runner rejects service-role credentials.

```bash
export HEALTH_QA_SUPABASE_URL='https://cbhrxkjclakzlvajyvfn.supabase.co'
export HEALTH_QA_SUPABASE_ANON_KEY='[staging anon key from the approved local QA environment]'

read -r -s HEALTH_QA_OWNER_PASSWORD
export HEALTH_QA_OWNER_PASSWORD
read -r -s HEALTH_QA_TRAINER_PASSWORD
export HEALTH_QA_TRAINER_PASSWORD
read -r -s HEALTH_QA_VET_PASSWORD
export HEALTH_QA_VET_PASSWORD
read -r -s HEALTH_QA_FAMILY_PASSWORD
export HEALTH_QA_FAMILY_PASSWORD
read -r -s HEALTH_QA_UNRELATED_PASSWORD
export HEALTH_QA_UNRELATED_PASSWORD

export HEALTH_QA_OWNER_EMAIL='owner-test@example.invalid'
export HEALTH_QA_TRAINER_EMAIL='trainer-test@example.invalid'
export HEALTH_QA_VET_EMAIL='vet-test@example.invalid'
export HEALTH_QA_FAMILY_EMAIL='family-test@example.invalid'
export HEALTH_QA_UNRELATED_EMAIL='unrelated-test@example.invalid'

node scripts/qa/health-staging-rls.mjs --execute
```

Add `--cross-owner` only after setting `HEALTH_QA_OWNER_B_EMAIL` and
`HEALTH_QA_OWNER_B_PASSWORD` interactively. The default run removes only the
synthetic fixture after completion. `--keep-fixtures` is an explicit opt-in
for later device QA and must be reported.

The runner prints only aggregate PASS/FAIL labels. It does not print tokens,
passwords, signed URLs, names, emails, or row contents.
