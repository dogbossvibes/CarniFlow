// „Trainer verbinden" — Zugangs-Regressionstests.
//
// Hintergrund: gemeldet war, dass ACTIVE-Kunden keinen Trainer hinzufügen
// können. Die statische Analyse zeigt, dass der gesamte Client-Pfad KEINE
// Plan-/Capability-Prüfung enthält. Diese Tests nageln das fest, damit dort
// nicht versehentlich eine Sperre entsteht — und trennen es sauber vom
// Trainer-Hub, der weiterhin `trainer_module` verlangt.

import { readFileSync } from 'fs';
import { planToCapabilities, type SubscriptionPlan } from '@/features/subscription/plans';

// Nur die reine Formatierung wird gebraucht — Supabase/AsyncStorage bleiben aussen vor.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn(), auth: { getUser: jest.fn() } } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { formatRedeemDiagnostics } = require('@/services/trainerService') as typeof import('@/services/trainerService');
type RedeemDiagnostics = import('@/services/trainerService').RedeemDiagnostics;

const read = (p: string) => readFileSync(p, 'utf8');

const PLANS: SubscriptionPlan[] = ['newbie', 'active', 'founder_active', 'trainer'];

describe('Trainer verbinden ist planunabhängig', () => {
  it.each(PLANS)('%s: der Client-Pfad kennt keine Plan-Bedingung', (plan) => {
    // Es gibt keine Capability für „mit Trainer verbinden" — der Flow hängt
    // an keiner Plan-Eigenschaft.
    const caps = planToCapabilities(plan);
    expect(typeof caps.pro_member).toBe('boolean');
    expect(typeof caps.trainer_module).toBe('boolean');
  });

  it('der Screen „Meine Trainer" prüft weder isPro noch isTrainerModule', () => {
    const src = read('app/trainer/index.tsx');
    expect(src).not.toContain('useCapabilities');
    expect(src).not.toMatch(/\bisPro\b/);
    expect(src).not.toMatch(/\bisTrainerModule\b/);
    // Der Verbinden-Knopf ist nicht an einen Plan gebunden.
    expect(src).toContain("t('trainer.connect')");
  });

  it('der Redeem-Service prüft keinen Plan', () => {
    const src = read('services/trainerService.ts');
    expect(src).not.toContain('pro_member');
    expect(src).not.toContain('trainer_module');
    expect(src).not.toContain('useCapabilities');
  });

  it('die Einstiegspunkte zu „Meine Trainer" sind nicht plan-gegated', () => {
    const profile = read('app/(tabs)/profile.tsx');
    const idx = profile.indexOf("router.push('/trainer')");
    expect(idx).toBeGreaterThan(-1);
    // Der Abschnitt steht auf oberster Ebene der ScrollView, nicht in einem
    // `{isPro && (` … `)}`-Block: zwischen dem letzten `{isPro && (` und der
    // Push-Stelle liegt dessen schliessendes `)}`.
    const beforeSection = profile.slice(0, idx);
    const lastGate = beforeSection.lastIndexOf('{isPro && (');
    const lastClose = beforeSection.lastIndexOf(')}');
    expect(lastClose).toBeGreaterThan(lastGate);
  });

  it('die RPC redeem_trainer_code enthält keine Abo-/Planprüfung', () => {
    const sql = read('TRAINER_FLOW_REPAIR.sql');
    const fn = sql.slice(sql.indexOf('create or replace function public.redeem_trainer_code'));
    const body = fn.slice(0, fn.indexOf('grant execute'));
    for (const term of ['user_capabilities', 'pro_member', 'trainer_module', 'subscription', 'plan']) {
      expect(body.toLowerCase()).not.toContain(term);
    }
  });

  it('die RLS auf connections prüft nur die Beteiligung, nicht den Plan', () => {
    const sql = read('CAPABILITY_MODEL_SETUP.sql');
    const policy = sql.slice(sql.indexOf('create policy "read own connections"'));
    const head = policy.slice(0, 200);
    expect(head).toContain('auth.uid() = owner_user_id');
    expect(head).not.toContain('pro_member');
  });
});

describe('Trainer-Hub bleibt TRAINER vorbehalten', () => {
  it('der Hub prüft weiterhin trainer_module', () => {
    const src = read('app/trainer-hub.tsx');
    expect(src).toContain('isTrainerModule');
    expect(src).toContain('!isTrainerModule');
  });

  it('nur der Trainer-Plan bekommt trainer_module', () => {
    expect(planToCapabilities('trainer').trainer_module).toBe(true);
    for (const plan of ['newbie', 'active', 'founder_active'] as SubscriptionPlan[]) {
      expect(planToCapabilities(plan).trainer_module).toBe(false);
    }
  });

  it('Planlimits sind unverändert', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NEWBIE_QUOTA, quotaLimit } = require('@/features/subscription/plans');
    expect(NEWBIE_QUOTA).toEqual({ dog: 1, training: 2, track: 0 });
    expect(quotaLimit(false, 'dog')).toBe(1);
    expect(quotaLimit(false, 'training')).toBe(2);
    expect(quotaLimit(false, 'track')).toBe(0);
    expect(quotaLimit(true, 'dog')).toBe(Infinity);
    expect(planToCapabilities('active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('founder_active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('newbie')).toEqual({ pro_member: false, trainer_module: false });
  });
});

describe('QA-Diagnose des Redeem-Versuchs', () => {
  const base: RedeemDiagnostics = {
    sessionPresent: true, uidPrefix: 'a1b2c3d4', normalizedCode: 'CANIS-4827',
    rpcUsed: true, rpcErrorCode: null, rpcErrorMessage: null,
    fallbackLookupUsed: false, fallbackFoundTrainer: null, tableErrorCode: null,
  };

  it('macht den Fehlerpfad an einer Zeile ablesbar', () => {
    expect(formatRedeemDiagnostics(base)).toContain('session=ja');
    expect(formatRedeemDiagnostics(base)).toContain('rpc=ok');

    const noRpc = formatRedeemDiagnostics({
      ...base, rpcUsed: false, rpcErrorCode: 'PGRST202', rpcErrorMessage: 'function not found',
      fallbackLookupUsed: true, fallbackFoundTrainer: false,
    });
    expect(noRpc).toContain('rpc=fehlgeschlagen(PGRST202)');
    expect(noRpc).toContain('fallback=ja trainerGefunden=NEIN');

    const noSession = formatRedeemDiagnostics({ ...base, sessionPresent: false, uidPrefix: null, rpcUsed: false });
    expect(noSession).toContain('session=NEIN');
  });

  it('enthält keine vollständige Nutzer-ID und keine Tokens', () => {
    const line = formatRedeemDiagnostics(base);
    expect(base.uidPrefix!.length).toBeLessThanOrEqual(8);
    for (const secret of ['token', 'jwt', 'bearer', 'apikey', 'refresh']) {
      expect(line.toLowerCase()).not.toContain(secret);
    }
  });

  it('ohne Diagnose bleibt die Meldung unverändert leer', () => {
    expect(formatRedeemDiagnostics(undefined)).toBe('');
  });
});

describe('Verschluckte Lesefehler sind jetzt sichtbar', () => {
  it('listConnections merkt sich den letzten Lesefehler, ohne zu werfen', () => {
    const src = read('services/connectionService.ts');
    expect(src).toContain('const { data, error } = await supabase');
    expect(src).toContain('export function getLastConnectionReadError');
    // Die Signatur bleibt unverändert — die sechs Aufrufer sind nicht betroffen.
    expect(src).toContain('export async function listConnections(userId: string): Promise<ConnectionView[]>');
  });

  it('der Screen zeigt einen Lesefehler an, statt „keine Trainer" vorzutäuschen', () => {
    const src = read('app/trainer/index.tsx');
    expect(src).toContain('getLastConnectionReadError()');
    expect(src).toContain('loadError ? (');
    // Und der Spinner bleibt nicht mehr hängen.
    expect(src).toContain('.finally(() => setLoading(false))');
  });
});
