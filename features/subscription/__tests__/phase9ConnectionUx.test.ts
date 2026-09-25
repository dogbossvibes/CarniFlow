import { readFileSync } from 'fs';

// ANYVO Customer Release Phase 9 — Trainer Search UI, generic Health "Person
// verbinden", and server-side trainer_profiles entitlement enforcement.

describe('Trainer Connect: "Trainer verbinden" now offers Code AND Search', () => {
  const content = readFileSync('app/trainer/index.tsx', 'utf8');
  it('presents a chooser (setChooser) before either sub-flow, not straight to code entry', () => {
    expect(content).toMatch(/onPress=\{\(\) => \{ tapHaptic\(\); setChooser\(true\); \}\}/);
  });
  it('both paths exist: code entry (existing sheet) and search (new sheet)', () => {
    expect(content).toMatch(/setSheet\(true\)/);
    expect(content).toMatch(/setSearchSheet\(true\)/);
  });
  it('search reuses the existing, already-ungated searchTrainers() — no parallel search backend', () => {
    expect(content).toMatch(/import \{ redeemTrainerCode, redeemTrainerCodeMessage, searchTrainers \} from '@\/services\/trainerService'/);
    expect(content).toMatch(/searchTrainers\(q\)/);
  });
  it('connecting from a search result reuses the atomic redeemTrainerCode RPC, not a direct connections insert', () => {
    expect(content).toMatch(/const connectFromSearch = async \(result: TrainerSearchResult\) => \{/);
    expect(content).toMatch(/await redeemTrainerCode\(result\.code\)/);
    expect(content).not.toMatch(/from\('connections'\)\.insert/);
  });
  it('no capability gate anywhere in this screen — Trainer Connect stays free for every plan', () => {
    expect(content).not.toMatch(/\bisPro\b|pro_member|useCapabilities/);
  });
});

describe('Health Sharing: "Person verbinden" is generic, not routed into Trainer Connect', () => {
  const content = readFileSync('app/dog-health-sharing/[id].tsx', 'utf8');
  it('no longer routes to /trainer', () => {
    expect(content).not.toMatch(/router\.push\('\/trainer'/);
  });
  it('opens an in-screen generic person search instead, using searchAnyvoPeople/connectAnyvoPerson', () => {
    expect(content).toMatch(/import \{ connectAnyvoPerson, searchAnyvoPeople, type AnyvoPersonResult \} from '@\/services\/connectionService'/);
    expect(content).toMatch(/const openConnectionFlow = \(\) => setPersonSearchOpen\(true\)/);
  });
  it('"Person verbinden" remains reachable even once at least one person is already connected (not only in the empty state)', () => {
    expect(content).toMatch(/onPress=\{openConnectionFlow\} accessibilityRole="button" accessibilityLabel=\{t\('health\.shareConnectPerson'\)\}/);
  });
});

describe('Generic person connection vs Trainer connection: isolated, correctly-scoped concepts', () => {
  const connectionService = readFileSync('services/connectionService.ts', 'utf8');
  const trackSharingMigration = readFileSync('supabase/migrations/20260924110000_track_sharing_feedback.sql', 'utf8');
  const lookupMigration = readFileSync('supabase/migrations/20260928080000_generic_person_lookup.sql', 'utf8');

  it('PERSON_CONNECTION_TYPE is a distinct value from trainer_client', () => {
    expect(connectionService).toMatch(/export const PERSON_CONNECTION_TYPE = 'health_contact';/);
  });
  it('connectAnyvoPerson writes PERSON_CONNECTION_TYPE, never trainer_client, and refuses self-connection', () => {
    const fn = connectionService.match(/export async function connectAnyvoPerson[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).toMatch(/connection_type: PERSON_CONNECTION_TYPE/);
    expect(fn).not.toMatch(/'trainer_client'/);
    expect(fn).toMatch(/ownerUserId === personId/);
  });
  it('Track Sharing (can_view_shared_track) still requires connection_type = \'trainer_client\' specifically — a generic connection never grants it', () => {
    expect(trackSharingMigration).toMatch(/c\.connection_type = 'trainer_client'/);
  });
  it('search_anyvo_people never inserts/updates anything — pure read, no side effect that could create an implicit connection or grant', () => {
    const fn = lookupMigration.match(/create or replace function public\.search_anyvo_people[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i);
    expect(fn).toMatch(/language sql/);
    expect(fn).toMatch(/stable/);
  });
  it('search_anyvo_people requires a real query (>=2 chars) — cannot be used to browse/enumerate all profiles', () => {
    const lookupSql = lookupMigration;
    expect(lookupSql).toMatch(/length\(trim\(coalesce\(p_query, ''\)\)\) >= 2/);
  });
  it('search_anyvo_people and get_profile_display_names are both locked to authenticated only, never anon/public', () => {
    expect(lookupMigration).toMatch(/revoke all on function public\.search_anyvo_people\(text\) from public, anon;/);
    expect(lookupMigration).toMatch(/grant execute on function public\.search_anyvo_people\(text\) to authenticated;/);
    expect(lookupMigration).toMatch(/revoke all on function public\.get_profile_display_names\(uuid\[\]\) from public, anon;/);
  });
  it('neither RPC signature can return phone_number/plan/email — structurally, not just by convention', () => {
    expect(lookupMigration).toMatch(/returns table\(id uuid, full_name text, username text\)/);
    // Appears twice: search_anyvo_people and the widened get_profile_display_names.
    expect((lookupMigration.match(/returns table\(id uuid, full_name text, username text\)/g) ?? []).length).toBe(2);
  });
});

describe('Health grant connection source now covers both trainer_client and generic person connections', () => {
  const healthService = readFileSync('services/healthService.ts', 'utf8');
  it('loadHealthGrantConnections merges both connection types, not trainer_client only', () => {
    const fn = healthService.match(/export async function loadHealthGrantConnections[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).toMatch(/listConnections\(user\.id, 'trainer_client'\)/);
    expect(fn).toMatch(/listConnections\(user\.id, PERSON_CONNECTION_TYPE\)/);
  });
});

describe('services/connectionService.ts listConnections: default preserves every existing caller\'s behavior', () => {
  const content = readFileSync('services/connectionService.ts', 'utf8');
  it('default parameter is trainer_client — no behavior change for existing callers that pass no type', () => {
    expect(content).toMatch(/export async function listConnections\(userId: string, connectionType: string = 'trainer_client'\)/);
  });
});

describe('trainer_profiles server-side entitlement (20260928090000)', () => {
  const migration = readFileSync('supabase/migrations/20260928090000_trainer_profiles_entitlement.sql', 'utf8');
  it('adds is_trainer_module(uuid) mirroring the existing is_pro_member() pattern: SQL, stable, security definer, safe search_path', () => {
    expect(migration).toMatch(/create or replace function public\.is_trainer_module\(p_user_id uuid\)/);
    expect(migration).toMatch(/language sql\s*\n\s*stable\s*\n\s*security definer\s*\n\s*set search_path = public/i);
  });
  it('is_trainer_module reads public.user_capabilities.trainer_module — the actual entitlement source, not a client-supplied value', () => {
    expect(migration).toMatch(/select trainer_module from public\.user_capabilities where user_id = p_user_id/);
  });
  it('INSERT is gated on is_trainer_module; UPDATE/DELETE stay ownership-only (existing trainers keep editing/removing their own profile)', () => {
    expect(migration).toMatch(/create policy trainer_profiles_insert[\s\S]*?with check \(user_id = auth\.uid\(\) and public\.is_trainer_module\(auth\.uid\(\)\)\)/);
    expect(migration).toMatch(/create policy trainer_profiles_update[\s\S]*?using \(user_id = auth\.uid\(\)\)/);
    expect(migration).not.toMatch(/create policy trainer_profiles_update[\s\S]{0,200}is_trainer_module/);
    expect(migration).toMatch(/create policy trainer_profiles_delete[\s\S]*?using \(user_id = auth\.uid\(\)\)/);
  });
  it('no destructive statement: no data touched, no row deleted, no table/column dropped', () => {
    const code = migration.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bdelete\s+from\b|\bupdate\s+public\.trainer_profiles\b|\btruncate\b|drop\s+table|drop\s+column/i);
  });
  it('trainer_profiles_select (public trainer directory for authenticated users) has no DDL statement in this migration — mentioned only in prose', () => {
    expect(migration).not.toMatch(/(drop|create|alter)\s+policy\s+trainer_profiles_select/);
  });
});
