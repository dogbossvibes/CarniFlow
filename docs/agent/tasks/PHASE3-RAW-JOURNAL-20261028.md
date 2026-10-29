# Phase3 raw measurements — local foundation, interrupted for startup hotfix

Base d13181bb392c211551c636a86eb1bad35ffed2ca, detached isolated worktree.
No existing tracked files changed. No production activation, commit or release.

Implemented owner/session-scoped local journal plus existing AsyncStorage adapter.
Immutable input snapshots; measurement and reception times remain separate.
Duplicate/out-of-order observations preserved. Serial writes, chunk recovery without
an index, explicit seal, scoped deletion, visible corruption and capacity errors.
Bound:32768 records/session,256 queued writes. No eviction. Writes acknowledged
by storage are recoverable in tests; no hardware fsync/crash atomicity claim.

75 tests passed (3 suites incl existing laySessionRuntime), typecheck PASS;
full lint 0 errors/88 warnings, initial targeted lint PASS. No device/performance test.

Not yet safe to activate: recorder foreground/background ownership and actual source
association, resumed sessions, authenticated identity/account deletion, trace deletion,
quota UI/status, export consent, actual AsyncStorage crash behavior/latency and
storage load tests. Source is not wired into useTrackRecorder or background task.
This is NOT complete raw capture for normal tracks. No filter/angle/LiveShare changes.

User explicitly reprioritized startup fix+commit+OTA. Do not include these files in
that hotfix. Continue Phase3 lifecycle integration after startup delivery.

## Continued 2026-10-28 after Android49 startup OTA

Reproduced two defects in the unactivated foundation with failing tests:
separate handles overwrite concurrent raw observations, and a stale handle can
resurrect records after deletion by another handle. Fixed with shared serialization,
shared failure/queue state and cache revision invalidation per storage adapter and
owner/session. Coordinator contains no location records. This is an in-process
protection, not a lock across separate JavaScript runtimes/native processes.

Validation: 77 tests passed across storage and unchanged laySessionRuntime;
additional shared-storage-failure/seal regression then passed with the storage
suites (19 tests). Typecheck passed; targeted ESLint passed; diff check passed.
No existing tracked product files changed, no production binding or release.
Full lint was started separately; its final result must be read from
/tmp/phase3-full-lint-current.log before claiming it passed.

Remaining: recorder source identity and lifecycle integration, account/track
deletion, retention/capacity UX, actual device crash and performance validation.
Existing SQLite track persistence remains authoritative; this journal must not
become an alternative track-save or synchronization mechanism. Baseline here is
still d13181b; any eventual release must integrate onto freshly verified production
and retain the later startup guard and other approved changes.
Final full lint result: exit 0, 0 errors / 88 existing warnings. Final diff check passed.

## Lifecycle continuation and release blocker

New rawRecordingSession.ts is an isolated account-scoped lifecycle adapter, NOT
wired to production. It shares handles, drains writes before sealing, closes stale
callbacks synchronously before deletion, refuses completion on write failure,
and closes old-account reads/callbacks on revoke. Interrupted unsealed records
can reopen; no synthetic points are created. A second factory/process is not
protected by these in-memory fences. Never present this as complete recorder integration.

Independent Chat01 architecture review confirms AsyncStorage production activation
is unsafe pending design change: installed Android library default is 6MiB shared
with other app data; actual shipped native override remains unverified. 32768
records per track plus chunk rewrites are inappropriate for unlimited raw archives.
Existing local SQLite is authoritative for saved tracks. Do not add raw records
to local_track_points: existing readers and sync semantics must stay unchanged.

### Concrete proposed local SQLite scope (NOT executed or registered)

An additive, versioned migration in anyvo_local.db, with separate tables:
- raw_capture_sessions: owner_id + session_id primary identity; recording generation,
  open/interrupted/complete/deleted state, observation count and format version.
- raw_capture_measurements: monotonic row ID, owner/session/generation reference,
  measured time, received time, actual source, delivery channel, lat/lon/accuracy/
  altitude/speed/heading. Preserve repeated timestamps as separate deliveries.
- Durable deletion tombstone/session state prevents late background writes from
  recreating deleted data. Insert checks matching active generation in the SAME
  SQLite transaction. Finalization and deletion use that same transactional fence.

No edits to historical line/marker tables, no remote schema or raw upload, no
changes to existing tracking thresholds. Logout must revoke the account generation
before background callbacks can write; deletion clears only the authenticated scope.
Recovery uses the existing local session identity, not latest-session heuristics.
Retain explicit interrupted/unknown gaps rather than claim a continuous recording.

Before implementing/activating the migration: confirm explicit local-schema scope
under the user's earlier STOP rule. Then tests must use real SQLite transactions,
including two concurrent connections, delete-vs-append, finalize-vs-append,
rollback, partial initialization, reopen, owner switch and disk full. Complete
retention/capacity UX and device latency/kill tests. No production OTA of the
current AsyncStorage foundation, even though general OTA authorization exists.

Final local validation for continuation: 85 tests / 4 suites passed, typecheck
passed, targeted ESLint and diff check passed. Review then identified partial-data
loss when a chunk was missing: loader compared headers with array position rather
than stored key index. Corrected and tested: valid later observations remain
readable while state stays corrupt (never a repaired complete recording).
Latest storage/lifecycle suite: 27 tests passed (one additional test), lint passed.
No production wiring, commit, push or OTA. Explicit local-schema scope needed next.

## Independent lifecycle review follow-up
Chat01 found stale finish success after remove/revoke and revoke returning before
an in-flight seal. Three regression cases failed before correction, then all 30
storage/lifecycle tests passed. Lifecycle guard now precedes the cached finish
promise. revoke drains accepted writes, reads, finalization and deletion, after
synchronously closing access. Multi-factory/process guards remain insufficient:
production still needs durable SQLite generation/tombstone transactions. No OTA.

## User approved local schema; satellite diagnostics added to scope

User explicitly approved the local database extension, then instructed implementation
of platform-appropriate satellite diagnostics. Supersedes earlier schema-permission
block only; does not waive testing or authorize an untested release.

SQLite: additive migration13 registered locally, new rawCaptureSchema/repository
and existing Expo exclusive-transaction adapter. Durable account generations,
session leases, deletion tombstones, pagination, bounded input batches and explicit
owner capacity. Repeated/reversed timestamps preserved. Local wipe removes raw
coordinates and revokes callbacks, retaining tombstones. No raw records are inserted
into line/marker/sync tables. Recorder/auth lifecycle integration still NOT activated.
Real SQLite tests use two file connections, rollback and lock contention. Migration
upgrade fixtures now explicitly expect version13 and validate original data retention.

Satellite: optional Android GnssStatus.constellations payload aggregates system,
observed/used counts, observed frequencies. Native Kotlin change requires a new
Android binary, NOT OTA-only. Existing binaries remain compatible and display
unavailable details honestly. iOS reports no public satellite/raw measurement feed.
UI/bridge normalization has no influence on filters or recording thresholds and
never enables raw measurement capture. Added NavIC mapping. No claim that more
signals or frequencies necessarily improve accuracy.

Combined tests: 73 passed / 8 suites (storage/lifecycle/realSQLite/migration upgrades/
GNSS normalization/position diagnostics/source fallback). Native Android compilation
and device validation NOT executed (no local gradle/kotlinc command found). Neither
platform released. Split native and OTA source freezes before release; current
worktree is a mixed development candidate, NOT a release worktree. Older d131
base must not replace later startup/subscription fixes.

## 2026-10-29 continuation — completeness and data preservation

Reproduced two failing SQLite regression tests before repair: capacity-rejected
append could be followed by a successful complete close; reopening an unfinished
session could likewise claim completeness despite unknown interruption. Repository
now remembers incomplete leases, prevents completion while writes await commit
acknowledgement, and treats reopened captures conservatively as incomplete. Reads
retain every committed row; interrupted captures remain accessible. No detector,
GPS input, line, marker or LiveShare processing changed.

The unactivated schema's previous RAW_CAPTURE_WIPE hook would delete raw records.
Replaced it with RAW_CAPTURE_REVOKE: invalidate callbacks and mark open captures
interrupted while retaining records. This follows the user's explicit customer-data
preservation requirement. Test fixtures are temporary databases only; no actual
customer database opened or edited. Existing old-base general developer DB-clear
button remains a separate legacy risk, reported to Chat01; do not activate this
archive as a workaround or ship the mixed development worktree.

Validation: 35 tests across real SQLite, recording lifecycle and migration upgrade
suites PASS; targeted lint PASS. Final typecheck result is in
/tmp/phase3-preserve-ts.log. Production recorder/auth binding, storage-capacity UX,
real-device termination/latency tests and independent review remain outstanding.
This archive is still NOT enabled and NOT part of maps/chronological-QA OTA55/56.

## 2026-10-29 SQLite lifecycle adapter

Added openSqliteRawRecording as a separate, unactivated adapter to the durable
repository. It serializes writes, snapshots caller input, caps pending writes,
closes new callbacks synchronously before finish, drains acknowledged writes and
never deletes records. Queue/storage failures and recovered sessions cannot claim
complete. Account revocation errors remain contained. Three real-SQLite adapter
regressions added; 18 SQLite tests pass. This is not yet a production recorder
binding: authoritative actual provider on each foreground/background delivery,
auth lifecycle and capacity UX must be connected on a fresh release base, with
independent review/device interruption tests before activation.
