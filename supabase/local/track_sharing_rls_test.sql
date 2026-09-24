-- Local Docker test entrypoint. Cases run in a rollback-only transaction.
\set ON_ERROR_STOP on
\ir track_sharing_security_cases.sql
