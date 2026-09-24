#!/usr/bin/env node

// ANYVO: remote Staging RLS QA for Track Sharing (migration 20260924110000).
// Network-based equivalent of supabase/local/track_sharing_security_cases.sql,
// run against the real Staging schema with real Auth sessions instead of
// synthetic local JWTs. It never creates users, never uses a service-role
// key, and refuses every Supabase ref except the Staging one below.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const EXPECTED_PROJECT_REF = 'cbhrxkjclakzlvajyvfn';
const PRODUCTION_PROJECT_REF = 'axkkhyqrjrtbkumaulta';
const executed = process.argv.includes('--execute');
const keepFixtures = process.argv.includes('--keep-fixtures');
let activeStage = 'STARTUP';
let primaryFailure = null;
let cleanupFailure = null;
let assertionCount = 0;

const REQUIRED_ENV_NAMES = [
  'TRACK_QA_SUPABASE_URL',
  'TRACK_QA_SUPABASE_ANON_KEY',
  'TRACK_QA_OWNER_A_EMAIL',
  'TRACK_QA_OWNER_A_PASSWORD',
  'TRACK_QA_TRAINER_A_EMAIL',
  'TRACK_QA_TRAINER_A_PASSWORD',
  'TRACK_QA_TRAINER_B_EMAIL',
  'TRACK_QA_TRAINER_B_PASSWORD',
  'TRACK_QA_OWNER_B_EMAIL',
  'TRACK_QA_OWNER_B_PASSWORD',
];

function setStage(stage) {
  activeStage = stage;
}

function capturePrimaryFailure(error) {
  if (!primaryFailure) primaryFailure = { stage: activeStage, error };
}

function sanitizeError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  let sanitized = raw;
  for (const [name, value] of Object.entries(process.env)) {
    if (value && /(PASSWORD|KEY|TOKEN|SECRET|AUTH|URL)/i.test(name)) {
      sanitized = sanitized.split(value).join(`[redacted:${name}]`);
    }
  }
  sanitized = sanitized
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|service_role|anon[_-]?key|password)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, '[redacted-token]');
  if (sanitized.startsWith('Missing required QA inputs:')) return sanitized;
  return sanitized.slice(0, 240) || 'Unknown error';
}

function safeAuthError(error) {
  const details = [error?.status, error?.code, error?.name].filter(Boolean).join(' ');
  return details || 'Authentication failed';
}

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  // QA credential names are intentionally dynamic per synthetic role.
  // eslint-disable-next-line expo/no-dynamic-env-var
  const value = process.env[name];
  if (!value) fail(`Missing required QA input: ${name}`);
  return value;
}

function validateRequiredEnvNames() {
  const missing = REQUIRED_ENV_NAMES.filter((name) => !process.env[name]);
  if (missing.length > 0) fail(`Missing required QA inputs: ${missing.join(', ')}`);
}

function projectRefFromUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('TRACK_QA_SUPABASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'https:') fail('Staging URL must use HTTPS');
  const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) fail('Staging URL must use the canonical Supabase project hostname');
  return match[1];
}

function assertStagingConfig() {
  const url = requireEnv('TRACK_QA_SUPABASE_URL');
  const anonKey = requireEnv('TRACK_QA_SUPABASE_ANON_KEY');
  const ref = projectRefFromUrl(url);
  if (ref !== EXPECTED_PROJECT_REF) fail(`Refusing non-Staging target: ${ref}`);
  if (ref === PRODUCTION_PROJECT_REF || url.includes(PRODUCTION_PROJECT_REF)) {
    fail('Production target is forbidden');
  }
  if (process.env.TRACK_QA_SERVICE_ROLE_KEY) {
    fail('Service-role credentials are forbidden in this harness');
  }
  return { url, anonKey };
}

function clientFor(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signIn(url, anonKey, role) {
  const client = clientFor(url, anonKey);
  const email = requireEnv(`TRACK_QA_${role}_EMAIL`);
  const password = requireEnv(`TRACK_QA_${role}_PASSWORD`);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) fail(`Authentication failed for ${role}: ${safeAuthError(error)}`);
  return client;
}

async function userId(client) {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) fail('Session has no user id');
  return data.user.id;
}

// --- assertion helpers ------------------------------------------------

function record() {
  assertionCount += 1;
}

async function countRows(client, table, column, id, extraEq = []) {
  let query = client.from(table).select('id', { count: 'exact', head: true }).eq(column, id);
  for (const [c, v] of extraEq) query = query.eq(c, v);
  const { count, error } = await query;
  if (error) fail(`Read failed for ${table}`);
  return count ?? 0;
}

async function expectCount(label, actual, expected) {
  record();
  if (actual !== expected) fail(`${label}: expected ${expected}, received ${actual}`);
}

async function expectDenied(label, operation) {
  record();
  const result = await operation();
  if (result?.error) {
    const status = result.error.status;
    const code = result.error.code;
    if (status === 401 || status === 403 || code === '42501') return;
    fail(`${label}: unexpected remote error`);
  }
  if (Array.isArray(result?.data) && result.data.length === 0) return;
  if (result?.count === 0) return;
  fail(`${label}: unauthorized operation succeeded`);
}

async function expectAffected(label, operation, expected) {
  record();
  const { data, error } = await operation();
  if (error) fail(`${label}: unexpected error`);
  const n = Array.isArray(data) ? data.length : 0;
  if (n !== expected) fail(`${label}: expected ${expected} affected rows, received ${n}`);
  return data;
}

async function trackFullyVisible(client, trackId, label) {
  await expectCount(`${label}: session`, await countRows(client, 'training_sessions', 'id', trackId), 1);
  await expectCount(`${label}: points`, await countRows(client, 'track_points', 'session_id', trackId), 2);
  await expectCount(`${label}: markers`, await countRows(client, 'track_markers', 'session_id', trackId), 3);
  await expectCount(`${label}: runs`, await countRows(client, 'track_runs', 'session_id', trackId), 1);
  await expectCount(`${label}: engine_sessions`, await countRows(client, 'track_engine_sessions', 'session_id', trackId), 1);
  record();
  const { data, error } = await client
    .from('training_sessions')
    .select("id, track_data->run->analytics->>trackScore as score")
    .eq('id', trackId);
  if (error) fail(`${label}: analytics read failed`);
  if ((data ?? []).length !== 1 || data[0].score !== '82') fail(`${label}: persisted analytics missing`);
}

async function trackFullyHidden(client, trackId, label) {
  await expectCount(`${label}: session hidden`, await countRows(client, 'training_sessions', 'id', trackId), 0);
  await expectCount(`${label}: points hidden`, await countRows(client, 'track_points', 'session_id', trackId), 0);
  await expectCount(`${label}: markers hidden`, await countRows(client, 'track_markers', 'session_id', trackId), 0);
  await expectCount(`${label}: runs hidden`, await countRows(client, 'track_runs', 'session_id', trackId), 0);
  await expectCount(`${label}: engine_sessions hidden`, await countRows(client, 'track_engine_sessions', 'session_id', trackId), 0);
}

// --- fixture ------------------------------------------------------------

function trackDataFixture() {
  return {
    run: {
      analytics: {
        trackScore: 82,
        analysisConfidenceBand: 'good',
        deviation: { meanM: 1, medianM: 1, p95M: 2, maxM: 3 },
        pace: { avgMps: 2 },
        reacquisition: { completedCount: 1 },
        corners: [],
        objects: [],
      },
    },
  };
}

async function insertTrack(owner, ownerId, dogId, suffix) {
  const trackId = randomUUID();
  const { error } = await owner.from('training_sessions').insert({
    id: trackId,
    owner_id: ownerId,
    dog_id: dogId,
    type: 'track',
    status: 'completed',
    title: `QA Track ${suffix}`,
    session_date: new Date().toISOString().slice(0, 10),
    category: 'IGP',
    training_type: 'privat',
    duration_seconds: 120,
    distance_meters: 240,
    weather_condition: 'sunny',
    notes: 'QA fixture note',
    gps_quality_average: 3,
    track_data: trackDataFixture(),
  });
  if (error) fail(`Fixture insert failed for training_sessions (${suffix})`);

  const { error: pointsError } = await owner.from('track_points').insert([
    { session_id: trackId, latitude: 47.1, longitude: 8.5 },
    { session_id: trackId, latitude: 47.11, longitude: 8.51 },
  ]);
  if (pointsError) fail('Fixture insert failed for track_points');

  const { error: markersError } = await owner.from('track_markers').insert([
    { session_id: trackId, marker_type: 'winkel', latitude: 47.1, longitude: 8.5, angle_kind: 'spitz_links' },
    { session_id: trackId, marker_type: 'winkel', latitude: 47.105, longitude: 8.505, angle_kind: 'rechts' },
    { session_id: trackId, marker_type: 'gegenstand', latitude: 47.108, longitude: 8.508, material: 'holz' },
  ]);
  if (markersError) fail('Fixture insert failed for track_markers');

  const { error: runsError } = await owner.from('track_runs').insert({
    session_id: trackId,
    run_points: [
      { lat: 47.1, lng: 8.5, t: 1 },
      { lat: 47.11, lng: 8.51, t: 2 },
    ],
  });
  if (runsError) fail('Fixture insert failed for track_runs');

  const { error: engineError } = await owner.from('track_engine_sessions').insert({
    session_id: trackId,
    engine: 'native_precision',
    platform: 'ios',
    average_accuracy: 3,
    gps_stats: { quality: 'good' },
  });
  if (engineError) fail('Fixture insert failed for track_engine_sessions');

  return trackId;
}

async function createFixture(clients) {
  setStage('FIXTURE_CREATE');
  const suffix = randomUUID().slice(0, 8);
  const fixture = { suffix };
  try {
    fixture.ownerAId = await userId(clients.ownerA);
    fixture.trainerAId = await userId(clients.trainerA);
    fixture.trainerBId = await userId(clients.trainerB);
    fixture.ownerBId = await userId(clients.ownerB);

    fixture.dogId = randomUUID();
    fixture.dogName = `QA Track Dog ${suffix}`;
    const { error: dogError } = await clients.ownerA.from('dogs').insert({
      id: fixture.dogId, owner_id: fixture.ownerAId, name: fixture.dogName,
    });
    if (dogError) fail('Fixture insert failed for dogs');

    fixture.track1 = await insertTrack(clients.ownerA, fixture.ownerAId, fixture.dogId, `1-${suffix}`);
    fixture.track2 = await insertTrack(clients.ownerA, fixture.ownerAId, fixture.dogId, `2-${suffix}`);

    fixture.connectionId = randomUUID();
    const { error: connError } = await clients.ownerA.from('connections').insert({
      id: fixture.connectionId,
      owner_user_id: fixture.ownerAId,
      connected_user_id: fixture.trainerAId,
      status: 'accepted',
      created_by: 'owner',
      connection_type: 'trainer_client',
      connection_name: `QA trainerA ${suffix}`,
    });
    if (connError) fail('Fixture insert failed for connections (TRAINER_A)');
    // TRAINER_B and OWNER_B intentionally get no connection at all.

    return fixture;
  } catch (error) {
    capturePrimaryFailure(error);
    await cleanupSafely(clients, fixture);
    throw error;
  }
}

// --- checks --------------------------------------------------------------

async function activeShareAndOwnerChecks(clients, fixture) {
  const { ownerA, trainerA } = clients;
  setStage('OWNER_RLS');
  await expectCount('OWNER_A reads TRACK_1', await countRows(ownerA, 'training_sessions', 'id', fixture.track1), 1);
  await expectCount('OWNER_A reads TRACK_2', await countRows(ownerA, 'training_sessions', 'id', fixture.track2), 1);

  setStage('SHARE_CREATE');
  record();
  const { data: shareData, error: shareError } = await ownerA
    .from('track_shares')
    .insert({ track_id: fixture.track1, owner_user_id: fixture.ownerAId, trainer_user_id: fixture.trainerAId })
    .select('*')
    .single();
  if (shareError || !shareData?.id) fail('OWNER_A create share failed');
  fixture.shareId = shareData.id;

  setStage('TRAINER_ACTIVE_SHARE');
  await trackFullyVisible(trainerA, fixture.track1, 'TRAINER_A shared TRACK_1');
  await trackFullyHidden(trainerA, fixture.track2, 'TRAINER_A TRACK_2 blocked');

  setStage('DISPLAY_NAMES');
  record();
  const { data: display, error: displayError } = await trainerA.rpc('shared_track_display', { p_track_id: fixture.track1 });
  if (displayError) fail('TRAINER_A display name RPC failed');
  const row = display?.[0];
  if (!row || row.dog_name !== fixture.dogName) fail('TRAINER_A limited dog name mismatch');

  setStage('DOG_PROFILE_NOT_BROADENED');
  await expectCount('TRAINER_A dogs table not broadened', await countRows(trainerA, 'dogs', 'id', fixture.dogId), 0);

  setStage('OWNER_REPLY');
  record();
  const { data: ownerReply, error: ownerReplyError } = await ownerA
    .from('track_feedback')
    .insert({ track_share_id: fixture.shareId, author_user_id: fixture.ownerAId, body: 'QA owner reply' })
    .select('*')
    .single();
  if (ownerReplyError || !ownerReply?.id) fail('OWNER_A reply insert failed');
  fixture.ownerFeedbackId = ownerReply.id;

  setStage('OWNER_READS_FEEDBACK');
  await expectCount('OWNER_A reads feedback', await countRows(ownerA, 'track_feedback', 'track_share_id', fixture.shareId), 1);

  setStage('TRAINER_READS_FEEDBACK');
  await expectCount('TRAINER_A reads feedback', await countRows(trainerA, 'track_feedback', 'track_share_id', fixture.shareId), 1);
}

async function negativeChecks(clients, fixture) {
  const { ownerA, trainerA, trainerB, ownerB } = clients;

  setStage('TRAINER_A_NEGATIVE');
  await expectAffected(
    'TRAINER_A cannot modify recording data',
    () => trainerA.from('training_sessions').update({ notes: 'attack' }).eq('id', fixture.track1).select('id'),
    0,
  );
  await expectAffected(
    'TRAINER_A cannot revoke owner share',
    () => trainerA.from('track_shares').update({ revoked_at: new Date().toISOString() }).eq('id', fixture.shareId).select('id'),
    0,
  );
  await expectAffected(
    'TRAINER_A cannot edit OWNER_A reply',
    () => trainerA.from('track_feedback').update({ body: 'attack' }).eq('id', fixture.ownerFeedbackId).select('id'),
    0,
  );
  await expectAffected(
    'TRAINER_A cannot delete OWNER_A reply',
    () => trainerA.from('track_feedback').delete().eq('id', fixture.ownerFeedbackId).select('id'),
    0,
  );

  setStage('TRAINER_B_NEGATIVE');
  await trackFullyHidden(trainerB, fixture.track1, 'TRAINER_B TRACK_1 blocked');
  await expectCount('TRAINER_B feedback hidden', await countRows(trainerB, 'track_feedback', 'track_share_id', fixture.shareId), 0);
  await expectDenied('TRAINER_B feedback insert denied', () =>
    trainerB.from('track_feedback').insert({ track_share_id: fixture.shareId, author_user_id: fixture.trainerBId, body: 'attack' }),
  );

  setStage('OWNER_B_NEGATIVE');
  await trackFullyHidden(ownerB, fixture.track1, 'OWNER_B TRACK_1 blocked');
  await expectCount('OWNER_B feedback hidden', await countRows(ownerB, 'track_feedback', 'track_share_id', fixture.shareId), 0);

  // OWNER_A stays fully intact after the negative battery above.
  setStage('OWNER_UNAFFECTED');
  await expectCount('OWNER_A still reads TRACK_1', await countRows(ownerA, 'training_sessions', 'id', fixture.track1), 1);
}

async function feedbackChecks(clients, fixture) {
  const { ownerA, trainerA } = clients;
  setStage('FEEDBACK_CREATE');
  record();
  const { data: trainerFeedback, error: createError } = await trainerA
    .from('track_feedback')
    .insert({ track_share_id: fixture.shareId, author_user_id: fixture.trainerAId, body: 'QA trainer comment', reaction: '👍' })
    .select('*')
    .single();
  if (createError || !trainerFeedback?.id) fail('TRAINER_A feedback create failed');
  fixture.trainerFeedbackId = trainerFeedback.id;

  setStage('FEEDBACK_REACTIONS');
  for (const reaction of ['✅', '👀', '💡']) {
    await expectAffected(
      `TRAINER_A own feedback reaction ${reaction}`,
      () => trainerA.from('track_feedback').update({ reaction }).eq('id', fixture.trainerFeedbackId).select('id'),
      1,
    );
  }
  record();
  const { data: persisted, error: persistedError } = await trainerA
    .from('track_feedback').select('reaction').eq('id', fixture.trainerFeedbackId).single();
  if (persistedError || persisted?.reaction !== '💡') fail('TRAINER_A feedback reaction not persisted');

  setStage('FEEDBACK_OWN_UPDATE_DELETE');
  await expectAffected(
    'TRAINER_A updates own feedback body',
    () => trainerA.from('track_feedback').update({ body: 'QA trainer comment edited' }).eq('id', fixture.trainerFeedbackId).select('id'),
    1,
  );
  await expectAffected(
    'TRAINER_A deletes own feedback',
    () => trainerA.from('track_feedback').delete().eq('id', fixture.trainerFeedbackId).select('id'),
    1,
  );

  // Recreate so downstream owner-reads-feedback / revocation checks have both entries.
  record();
  const { data: retained, error: retainedError } = await trainerA
    .from('track_feedback')
    .insert({ track_share_id: fixture.shareId, author_user_id: fixture.trainerAId, body: 'QA retained feedback' })
    .select('*')
    .single();
  if (retainedError || !retained?.id) fail('TRAINER_A feedback re-create failed');
  fixture.trainerFeedbackId = retained.id;

  setStage('CROSS_AUTHOR_PROTECTION');
  await expectAffected(
    'TRAINER_A cannot edit OWNER_A reply (cross-author)',
    () => trainerA.from('track_feedback').update({ body: 'attack' }).eq('id', fixture.ownerFeedbackId).select('id'),
    0,
  );
  await expectAffected(
    'OWNER_A cannot edit TRAINER_A feedback (cross-author)',
    () => ownerA.from('track_feedback').update({ body: 'attack' }).eq('id', fixture.trainerFeedbackId).select('id'),
    0,
  );

  setStage('OWNER_REPLY_EDIT');
  await expectAffected(
    'OWNER_A edits own reply',
    () => ownerA.from('track_feedback').update({ body: 'QA owner reply edited' }).eq('id', fixture.ownerFeedbackId).select('id'),
    1,
  );

  setStage('OWNER_READS_BOTH');
  await expectCount('OWNER_A reads both feedback entries', await countRows(ownerA, 'track_feedback', 'track_share_id', fixture.shareId), 2);
}

async function revocationCheck(clients, fixture) {
  const { ownerA, trainerA } = clients;
  setStage('REVOCATION');
  await expectAffected(
    'OWNER_A revokes TRACK_1 share',
    () => ownerA.from('track_shares').update({ revoked_at: new Date().toISOString() }).eq('id', fixture.shareId).select('id'),
    1,
  );
  fixture.revoked = true;

  setStage('REVOCATION_IMMEDIATE');
  await trackFullyHidden(trainerA, fixture.track1, 'TRAINER_A after revocation');
  await expectCount(
    'TRAINER_A feedback hidden after revocation',
    await countRows(trainerA, 'track_feedback', 'track_share_id', fixture.shareId),
    0,
  );
  await expectDenied('TRAINER_A new feedback denied after revocation', () =>
    trainerA.from('track_feedback').insert({ track_share_id: fixture.shareId, author_user_id: fixture.trainerAId, body: 'attack' }),
  );

  setStage('OWNER_HISTORICAL_ACCESS');
  await expectCount('OWNER_A still reads TRACK_1 after revocation', await countRows(ownerA, 'training_sessions', 'id', fixture.track1), 1);
  await expectCount('OWNER_A retains historical feedback', await countRows(ownerA, 'track_feedback', 'track_share_id', fixture.shareId), 2);
}

// --- cleanup ---------------------------------------------------------------

async function cleanup(clients, fixture) {
  const { ownerA } = clients;
  if (!fixture) return;
  if (fixture.shareId) {
    await ownerA.from('track_feedback').delete().eq('track_share_id', fixture.shareId);
    await ownerA.from('track_shares').delete().eq('id', fixture.shareId);
  }
  for (const trackId of [fixture.track1, fixture.track2].filter(Boolean)) {
    await ownerA.from('track_engine_sessions').delete().eq('session_id', trackId);
    await ownerA.from('track_runs').delete().eq('session_id', trackId);
    await ownerA.from('track_markers').delete().eq('session_id', trackId);
    await ownerA.from('track_points').delete().eq('session_id', trackId);
    await ownerA.from('training_sessions').delete().eq('id', trackId);
  }
  if (fixture.connectionId) await ownerA.from('connections').delete().eq('id', fixture.connectionId);
  if (fixture.dogId) await ownerA.from('dogs').delete().eq('id', fixture.dogId);
}

async function cleanupSafely(clients, fixture) {
  setStage('CLEANUP');
  try {
    await cleanup(clients, fixture);
  } catch (error) {
    cleanupFailure = { stage: 'CLEANUP', error };
  }
}

// --- main --------------------------------------------------------------

async function main() {
  if (!executed) {
    console.log('Track Sharing Staging RLS harness is dry-run only. Re-run with --execute after manual QA account setup.');
    return;
  }
  setStage('ENV_VALIDATION');
  validateRequiredEnvNames();
  setStage('PROJECT_REF_GUARD');
  const { url, anonKey } = assertStagingConfig();

  setStage('OWNER_A_AUTH');
  const clients = { ownerA: await signIn(url, anonKey, 'OWNER_A') };
  setStage('TRAINER_A_AUTH');
  clients.trainerA = await signIn(url, anonKey, 'TRAINER_A');
  setStage('TRAINER_B_AUTH');
  clients.trainerB = await signIn(url, anonKey, 'TRAINER_B');
  setStage('OWNER_B_AUTH');
  clients.ownerB = await signIn(url, anonKey, 'OWNER_B');

  let fixture = null;
  try {
    fixture = await createFixture(clients);
    try {
      await activeShareAndOwnerChecks(clients, fixture);
      await negativeChecks(clients, fixture);
      await feedbackChecks(clients, fixture);
      await revocationCheck(clients, fixture);
    } catch (error) {
      capturePrimaryFailure(error);
      throw error;
    }
    console.log(`TRACK_SHARING_STAGING_RLS|PASS|assertions=${assertionCount}`);
  } finally {
    if (!keepFixtures && fixture) await cleanupSafely(clients, fixture);
  }
  if (cleanupFailure) throw cleanupFailure.error;
}

main().catch((error) => {
  capturePrimaryFailure(error);
  const failure = primaryFailure ?? { stage: activeStage, error };
  console.error('TRACK_SHARING_STAGING_RLS|FAIL');
  console.error(`assertions_passed=${assertionCount}`);
  console.error(`primary_stage=${failure.stage}`);
  console.error(`primary_error=${sanitizeError(failure.error)}`);
  if (cleanupFailure) {
    console.error('cleanup=FAIL');
    console.error(`cleanup_stage=${cleanupFailure.stage}`);
    console.error(`cleanup_error=${sanitizeError(cleanupFailure.error)}`);
  } else if (primaryFailure) {
    console.error('cleanup=PASS');
  }
  process.exitCode = 1;
});
