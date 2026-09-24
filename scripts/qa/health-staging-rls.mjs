#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

const EXPECTED_PROJECT_REF = 'cbhrxkjclakzlvajyvfn';
const PRODUCTION_PROJECT_REF = 'axkkhyqrjrtbkumaulta';
const BUCKET = 'dog-documents';
const STORAGE_FIXTURE_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const executed = process.argv.includes('--execute');
const keepFixtures = process.argv.includes('--keep-fixtures');
const crossOwner = process.argv.includes('--cross-owner');
let activeStage = 'STARTUP';
let primaryFailure = null;
let cleanupFailure = null;

const REQUIRED_ENV_NAMES = [
  'HEALTH_QA_SUPABASE_URL',
  'HEALTH_QA_SUPABASE_ANON_KEY',
  'HEALTH_QA_OWNER_EMAIL',
  'HEALTH_QA_OWNER_PASSWORD',
  'HEALTH_QA_TRAINER_EMAIL',
  'HEALTH_QA_TRAINER_PASSWORD',
  'HEALTH_QA_VET_EMAIL',
  'HEALTH_QA_VET_PASSWORD',
  'HEALTH_QA_FAMILY_EMAIL',
  'HEALTH_QA_FAMILY_PASSWORD',
  'HEALTH_QA_UNRELATED_EMAIL',
  'HEALTH_QA_UNRELATED_PASSWORD',
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

function safeStorageError(error) {
  const message = sanitizeError(error?.message ?? error)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[redacted-uuid]');
  return {
    status: error?.status,
    statusCode: error?.statusCode,
    code: error?.code,
    name: error?.name,
    message,
  };
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
    fail('HEALTH_QA_SUPABASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'https:') fail('Staging URL must use HTTPS');
  const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) fail('Staging URL must use the canonical Supabase project hostname');
  return match[1];
}

function assertStagingConfig() {
  const url = requireEnv('HEALTH_QA_SUPABASE_URL');
  const anonKey = requireEnv('HEALTH_QA_SUPABASE_ANON_KEY');
  const ref = projectRefFromUrl(url);
  if (ref !== EXPECTED_PROJECT_REF) {
    fail(`Refusing non-Staging target: ${ref}`);
  }
  if (ref === PRODUCTION_PROJECT_REF || url.includes(PRODUCTION_PROJECT_REF)) {
    fail('Production target is forbidden');
  }
  if (process.env.HEALTH_QA_SERVICE_ROLE_KEY) {
    fail('Service-role credentials are forbidden in this harness');
  }
  return { url, anonKey };
}

function clientFor(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signIn(url, anonKey, role) {
  const client = clientFor(url, anonKey);
  const email = requireEnv(`HEALTH_QA_${role}_EMAIL`);
  const password = requireEnv(`HEALTH_QA_${role}_PASSWORD`);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) fail(`Authentication failed for ${role}: ${safeAuthError(error)}`);
  return client;
}

async function countRows(client, table, dogId, extra = []) {
  let query = client.from(table).select('id', { count: 'exact', head: true }).eq('dog_id', dogId);
  for (const [column, value] of extra) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) fail(`Read failed for ${table}`);
  return count ?? 0;
}

async function expectCount(label, actual, expected) {
  if (actual !== expected) fail(`${label}: expected ${expected}, received ${actual}`);
}

async function expectDenied(label, operation) {
  const result = await operation();
  if (result?.error) {
    const status = result.error.status;
    const code = result.error.code;
    if (status === 401 || status === 403 || code === '42501') return;
    fail(`${label}: unexpected remote error`);
  }
  if (Array.isArray(result?.data) && result.data.length === 0) return;
  fail(`${label}: unauthorized operation succeeded`);
}

async function storageReadable(client, path) {
  const { data, error } = await client.storage.from(BUCKET).download(path);
  return !error && Boolean(data);
}

async function createFixture(owner, clients) {
  setStage('FIXTURE_CREATE');
  const suffix = randomUUID().slice(0, 8);
  const dogId = randomUUID();
  const ids = {
    dog: dogId,
    weight: randomUUID(),
    vaccination: randomUUID(),
    parasite: randomUUID(),
    medication: randomUUID(),
    diagnosis: randomUUID(),
    allergy: randomUUID(),
    intolerance: randomUUID(),
    vet: randomUUID(),
    document: randomUUID(),
    calendar: randomUUID(),
    trainerGrant: randomUUID(),
    vetGrant: randomUUID(),
    familyGrant: randomUUID(),
    customGrant: randomUUID(),
    disposableGrant: randomUUID(),
  };
  const { data: ownerUserData, error: ownerUserError } = await owner.auth.getUser();
  const sessionUser = ownerUserData?.user;
  if (ownerUserError || !sessionUser?.id) fail('Owner session has no user id');
  const ownerId = sessionUser.id;
  const connectionIds = {
    trainer: randomUUID(), vet: randomUUID(), family: randomUUID(),
  };
  let path = null;
  const fixture = { ids, dogId, ownerId, path, connectionIds };

  const insert = async (table, values) => {
    const { error } = await owner.from(table).insert(values);
    if (error) fail(`Fixture insert failed for ${table}`);
  };

  try {
    await insert('dogs', { id: dogId, owner_id: ownerId, name: `QA Health Dog ${suffix}` });
  await insert('dog_health_entries', {
    id: ids.weight, owner_id: ownerId, dog_id: dogId, entry_date: '2026-09-20', weight_kg: 24.5,
  });
  await insert('dog_health_vaccinations', {
    id: ids.vaccination, owner_id: ownerId, dog_id: dogId, vaccine_type: 'qa',
    administered_on: '2026-09-01', next_due_on: '2027-09-01',
  });
  await insert('dog_deworming_entries', {
    id: ids.parasite, owner_id: ownerId, dog_id: dogId, treatment_date: '2026-09-02',
    product: 'QA', next_due_date: '2026-12-02', treatment_type: 'deworming',
  });
  await insert('dog_health_medications', {
    id: ids.medication, owner_id: ownerId, dog_id: dogId, name: 'QA', starts_on: '2026-09-01', is_active: true,
  });
  await insert('dog_health_conditions', [
    { id: ids.diagnosis, owner_id: ownerId, dog_id: dogId, kind: 'diagnosis', name: 'QA', status: 'active' },
    { id: ids.allergy, owner_id: ownerId, dog_id: dogId, kind: 'allergy', name: 'QA', status: 'active' },
    { id: ids.intolerance, owner_id: ownerId, dog_id: dogId, kind: 'intolerance', name: 'QA', status: 'active' },
  ]);
  await insert('dog_vet_appointments', {
    id: ids.vet, owner_id: ownerId, dog_id: dogId, appointment_at: '2026-10-01T10:00:00Z',
    reason: 'QA', status: 'scheduled',
  });

  path = `${ownerId}/${dogId}/${ids.document}.png`;
  fixture.path = path;
  setStage('STORAGE_UPLOAD');
  const pathOwnerId = path.split('/')[0];
  console.log(`owner_matches_session=${ownerId === sessionUser.id ? 'YES' : 'NO'}`);
  console.log(`bucket_match=${BUCKET === 'dog-documents' ? 'YES' : 'NO'}`);
  console.log(`path_owner_match=${pathOwnerId === sessionUser.id ? 'YES' : 'NO'}`);
  const { error: uploadError } = await owner.storage.from(BUCKET).upload(
    path,
    STORAGE_FIXTURE_BYTES,
    { contentType: 'image/png', upsert: false },
  );
  if (uploadError) fail(`Fixture storage upload failed: ${JSON.stringify(safeStorageError(uploadError))}`);
  await insert('dog_documents', {
    id: ids.document, owner_id: ownerId, dog_id: dogId, kind: 'gesundheit', title: 'QA',
    file_url: path, category: 'health', subtype: 'lab',
  });
  await insert('calendar_events', {
    id: ids.calendar, owner_id: ownerId, created_by: ownerId, dog_id: dogId,
    type: 'health_vaccination', title: 'QA', start_at: '2026-10-01T10:00:00Z',
    status: 'scheduled', source_type: 'health_vaccination', source_id: ids.vaccination,
  });

  for (const [role, connectionId] of Object.entries(connectionIds)) {
    setStage('LEGACY_BYPASS');
    const recipientId = (await clients[role].auth.getUser()).data.user?.id;
    if (!recipientId) fail(`Missing ${role} user id`);
    await insert('connections', {
      id: connectionId, owner_user_id: ownerId, connected_user_id: recipientId,
      status: 'accepted', created_by: 'owner', connection_type: 'trainer_client',
      connection_name: `QA ${role}`,
    });
    await insert('connection_permissions', { connection_id: connectionId, view_health: true });
  }

  const grants = [
    [ids.trainerGrant, 'trainer', connectionIds.trainer, 'trainer', {
      can_view_health_summary: true, can_view_weight: true,
    }],
    [ids.vetGrant, 'vet', connectionIds.vet, 'vet', {
      can_view_health_summary: true, can_view_weight: true, can_view_vaccinations: true,
      can_view_parasite_treatments: true, can_view_medications: true, can_view_diagnoses: true,
      can_view_allergies: true, can_view_vet_visits: true, can_view_vet_reports: true,
      can_view_lab_results: true, can_view_health_documents: true, can_view_emergency_info: true,
    }],
    [ids.familyGrant, 'family', connectionIds.family, 'family', {
      can_view_health_summary: true, can_view_weight: true, can_view_parasite_treatments: true,
      can_view_medications: true, can_view_allergies: true, can_view_emergency_info: true,
    }],
  ];
  setStage('GRANT_MANAGEMENT');
  for (const [id, rolePreset, connectionId, role, permissions] of grants) {
    const grantee = (await clients[role].auth.getUser()).data.user?.id;
    await insert('dog_health_access_grants', {
      id, dog_id: dogId, owner_id: ownerId, connection_id: connectionId,
      grantee_user_id: grantee, role_preset: rolePreset, ...permissions,
    });
  }
  await insert('dog_health_access_grants', {
    id: ids.customGrant, dog_id: dogId, owner_id: ownerId,
    grantee_user_id: (await clients.unrelated.auth.getUser()).data.user?.id,
    role_preset: 'custom', can_view_vaccinations: true,
  });
  if (crossOwner) {
    if (!clients.ownerb) fail('OWNER_B credentials are required for --cross-owner');
    const ownerBId = (await clients.ownerb.auth.getUser()).data.user?.id;
    if (!ownerBId) fail('OWNER_B session has no user id');
    const dogB = randomUUID();
    const { error } = await clients.ownerb.from('dogs').insert({
      id: dogB, owner_id: ownerBId, name: `QA Control Dog ${suffix}`,
    });
    if (error) fail('Cross-owner fixture insert failed');
    fixture.dogB = dogB;
  }
  return fixture;
  } catch (error) {
    capturePrimaryFailure(error);
    await cleanupSafely(owner, fixture, clients.ownerb);
    throw error;
  }
}

async function runChecks(clients, fixture) {
  const { owner, trainer, vet, family, unrelated } = clients;
  const { dogId, ids, path } = fixture;
  setStage('OWNER_RLS');
  await expectCount('owner weight', await countRows(owner, 'dog_health_entries', dogId), 1);
  await expectCount('owner vaccination', await countRows(owner, 'dog_health_vaccinations', dogId), 1);
  setStage('TRAINER_RLS');
  await expectCount('trainer weight', await countRows(trainer, 'dog_health_entries', dogId), 1);
  await expectCount('trainer vaccination denied', await countRows(trainer, 'dog_health_vaccinations', dogId), 0);
  await expectCount('trainer medication denied', await countRows(trainer, 'dog_health_medications', dogId), 0);
  await expectCount('trainer diagnosis denied', await countRows(trainer, 'dog_health_conditions', dogId, [['kind', 'diagnosis']]), 0);
  await expectCount('trainer document denied', await countRows(trainer, 'dog_documents', dogId), 0);
  setStage('VET_RLS');
  await expectCount('vet conditions', await countRows(vet, 'dog_health_conditions', dogId), 3);
  setStage('FAMILY_RLS');
  await expectCount('family allergy/intolerance', await countRows(family, 'dog_health_conditions', dogId, [['kind', 'allergy']]) + await countRows(family, 'dog_health_conditions', dogId, [['kind', 'intolerance']]), 2);
  await expectCount('family diagnosis denied', await countRows(family, 'dog_health_conditions', dogId, [['kind', 'diagnosis']]), 0);
  setStage('CUSTOM_GRANT');
  await expectCount('custom vaccination', await countRows(unrelated, 'dog_health_vaccinations', dogId), 1);
  setStage('UNRELATED_RLS');
  await expectCount('custom medication denied', await countRows(unrelated, 'dog_health_medications', dogId), 0);
  await expectCount('custom document denied', await countRows(unrelated, 'dog_documents', dogId), 0);
  setStage('STORAGE');
  if (!(await storageReadable(owner, path))) fail('Owner storage access denied');
  if (await storageReadable(trainer, path)) fail('Trainer storage access granted unexpectedly');
  if (!(await storageReadable(vet, path))) fail('Vet storage access denied');
  if (await storageReadable(unrelated, path)) fail('Unrelated storage access granted unexpectedly');

  const ownerCreateId = randomUUID();
  setStage('OWNER_RLS');
  const ownerCreate = await owner.from('dog_health_vaccinations').insert({
    id: ownerCreateId, owner_id: fixture.ownerId, dog_id: dogId,
    vaccine_type: 'owner-crud', administered_on: '2026-09-01',
  });
  if (ownerCreate.error) fail('Owner INSERT failed');
  const ownerUpdate = await owner.from('dog_health_vaccinations').update({ vaccine_name: 'owner-crud-updated' }).eq('id', ownerCreateId);
  if (ownerUpdate.error) fail('Owner UPDATE failed');
  const ownerDelete = await owner.from('dog_health_vaccinations').delete().eq('id', ownerCreateId);
  if (ownerDelete.error) fail('Owner DELETE failed');

  for (const [role, client] of [['trainer', trainer], ['vet', vet], ['family', family], ['unrelated', unrelated]]) {
    setStage('WRITE_PROTECTION');
    await expectDenied(`${role} grant INSERT`, () => client.from('dog_health_access_grants').insert({
      dog_id: dogId, owner_id: fixture.ownerId, grantee_user_id: fixture.ownerId, role_preset: 'custom',
    }));
    await expectDenied(`${role} health INSERT`, () => client.from('dog_health_vaccinations').insert({
      id: randomUUID(), owner_id: fixture.ownerId, dog_id: dogId,
      vaccine_type: 'attack', administered_on: '2026-09-01',
    }));
  }

  await owner.from('dog_health_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', ids.trainerGrant);
  setStage('TIME_BOUND_GRANTS');
  await expectCount('revoked trainer weight', await countRows(trainer, 'dog_health_entries', dogId), 0);
  await owner.from('dog_health_access_grants').update({ revoked_at: null }).eq('id', ids.trainerGrant);
  await owner.from('dog_health_access_grants').update({ starts_at: new Date(Date.now() + 86400000).toISOString() }).eq('id', ids.trainerGrant);
  await expectCount('future trainer weight', await countRows(trainer, 'dog_health_entries', dogId), 0);
  await owner.from('dog_health_access_grants').update({ starts_at: new Date(Date.now() - 86400000).toISOString(), expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', ids.trainerGrant);
  await expectCount('expired trainer weight', await countRows(trainer, 'dog_health_entries', dogId), 0);
  await owner.from('dog_health_access_grants').update({ starts_at: new Date(Date.now() - 86400000).toISOString(), expires_at: null }).eq('id', ids.trainerGrant);

  await owner.from('dog_health_access_grants').update({ can_view_health_documents: true, can_view_lab_results: true }).eq('id', ids.customGrant);
  setStage('CUSTOM_GRANT');
  await expectCount('custom document after grant update', await countRows(unrelated, 'dog_documents', dogId), 1);
  if (!(await storageReadable(unrelated, path))) fail('Custom document storage access denied');
  await owner.from('dog_health_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', ids.customGrant);
  await expectCount('revoked custom document', await countRows(unrelated, 'dog_documents', dogId), 0);

  if (fixture.dogB) {
    setStage('CROSS_OWNER');
    await expectDenied('cross-owner health INSERT', () => owner.from('dog_health_entries').insert({
      id: randomUUID(), owner_id: fixture.ownerId, dog_id: fixture.dogB,
      entry_date: '2026-09-01', weight_kg: 99,
    }));
    await expectDenied('cross-owner grant INSERT', () => owner.from('dog_health_access_grants').insert({
      dog_id: fixture.dogB, owner_id: fixture.ownerId,
      grantee_user_id: fixture.ownerId, role_preset: 'custom',
    }));
  }

  return { checked: true, ids };
}

async function cleanup(owner, fixture, ownerb) {
  const { ids, dogId, dogB, path, connectionIds } = fixture;
  if (path) await owner.storage.from(BUCKET).remove([path]);
  for (const table of ['calendar_events', 'dog_health_access_grants', 'dog_documents', 'dog_vet_appointments', 'dog_health_conditions', 'dog_health_medications', 'dog_deworming_entries', 'dog_health_entries']) {
    await owner.from(table).delete().eq('dog_id', dogId);
  }
  for (const connectionId of Object.values(connectionIds)) {
    await owner.from('connection_permissions').delete().eq('connection_id', connectionId);
    await owner.from('connections').delete().eq('id', connectionId);
  }
  await owner.from('dogs').delete().eq('id', dogId);
  if (dogB && ownerb) await ownerb.from('dogs').delete().eq('id', dogB);
  return ids;
}

async function cleanupSafely(owner, fixture, ownerb) {
  setStage('CLEANUP');
  try {
    await cleanup(owner, fixture, ownerb);
  } catch (error) {
    cleanupFailure = { stage: 'CLEANUP', error };
  }
}

async function main() {
  if (!executed) {
    console.log('Health Staging RLS harness is dry-run only. Re-run with --execute after manual QA account setup.');
    return;
  }
  setStage('ENV_VALIDATION');
  validateRequiredEnvNames();
  setStage('PROJECT_REF_GUARD');
  const { url, anonKey } = assertStagingConfig();
  setStage('OWNER_AUTH');
  const clients = { owner: await signIn(url, anonKey, 'OWNER') };
  setStage('TRAINER_AUTH');
  clients.trainer = await signIn(url, anonKey, 'TRAINER');
  setStage('VET_AUTH');
  clients.vet = await signIn(url, anonKey, 'VET');
  setStage('FAMILY_AUTH');
  clients.family = await signIn(url, anonKey, 'FAMILY');
  setStage('UNRELATED_AUTH');
  clients.unrelated = await signIn(url, anonKey, 'UNRELATED');
  if (crossOwner) {
    setStage('CROSS_OWNER');
    clients.ownerb = await signIn(url, anonKey, 'OWNER_B');
  }
  let fixture = null;
  try {
    fixture = await createFixture(clients.owner, clients);
    setStage('OWNER_RLS');
    try {
      await runChecks(clients, fixture);
    } catch (error) {
      capturePrimaryFailure(error);
      throw error;
    }
    console.log('HEALTH_STAGING_RLS|PASS');
  } finally {
    if (!keepFixtures && fixture) await cleanupSafely(clients.owner, fixture, clients.ownerb);
  }
  if (cleanupFailure) throw cleanupFailure.error;
}

main().catch((error) => {
  capturePrimaryFailure(error);
  const failure = primaryFailure ?? { stage: activeStage, error };
  console.error('HEALTH_STAGING_RLS|FAIL');
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
