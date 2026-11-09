/**
 * T-183 — Store-Verlängerung vor Periodenbeginn (INVALID_PROVIDER_DATE, 2026-11-04).
 *
 * Fall: Apple verlängert bis 24 h vor Periodenende. RevenueCat V1 meldet dann schon die
 * NEUE Periode (purchase_date in der Zukunft, neues Ablaufdatum), V2 noch die laufende
 * Periode mit auto_renewal_status `has_already_renewed` und ends_at = neues Ende.
 * Vorher brach der Normalisierer ab; der Webhook antwortete 503 und nichts wurde gespeichert.
 */
import { normalizeAuthority, MAX_RENEWAL_LEAD_MS } from '../_shared/normalizer.ts';
import { canonicalizePendingRenewal, canonicalizeProviderTimes } from '../_shared/provider-time.ts';
import { planOwnership, type Receipt, type Account } from '../_shared/ownership.ts';
import { catalog } from '../_shared/provider.ts';

const H = 60 * 60 * 1000;
const uid = '11111111-1111-4111-8111-111111111111';
const product = 'anyvo_active_monthly_10';
const now = Date.parse('2026-11-04T07:36:00Z');            // Webhook-Zeitpunkt
const oldStart = Date.parse('2026-10-04T14:27:34Z');       // laufende Periode
const newStart = Date.parse('2026-11-04T14:27:34Z');       // = altes Ende, in der Zukunft
const newEnd = Date.parse('2026-12-04T14:27:34Z');

function v1(purchase: number, expires: number, store = 'app_store') {
  return {
    request_date_ms: now,
    subscriber: {
      subscriptions: { [product]: { store, is_sandbox: false, purchase_date: new Date(purchase).toISOString(), expires_date: new Date(expires).toISOString(), period_type: 'normal', unsubscribe_detected_at: null, refunded_at: null, grace_period_expires_date: null } },
      entitlements: { [product]: { product_identifier: product, expires_date: new Date(expires).toISOString(), grace_period_expires_date: null } },
    },
  };
}

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    project: catalog.project, app: 'app8ff9cf8027', store: 'app_store', environment: 'production', id: 'sub_1', owner: uid,
    product, entitlement: product, periodStart: oldStart, periodEnd: newStart, endsAt: newEnd, status: 'active',
    renewal: 'has_already_renewed', graceEnd: null, givesAccess: true, fetchedAt: now, expectedRevision: 0, ...over,
  };
}

describe('Normalisierer: Kaufdatum in der Zukunft', () => {
  it('akzeptiert eine Verlängerung bis zur erlaubten Vorlaufzeit', () => {
    const s = normalizeAuthority(v1(newStart, newEnd), now);
    expect(s.plan).toBe('active');
    expect(s.purchaseAt).toBe(new Date(newStart).toISOString());
    expect(s.expiresAt).toBe(new Date(newEnd).toISOString());
  });
  it('bleibt bei unplausibel weit in der Zukunft liegendem Kauf fail-closed', () => {
    expect(() => normalizeAuthority(v1(now + MAX_RENEWAL_LEAD_MS + H, newEnd + 40 * 24 * H), now)).toThrow('INVALID_PROVIDER_DATE');
  });
  it('verhält sich bei normalem Kauf in der Vergangenheit unverändert', () => {
    const s = normalizeAuthority(v1(oldStart, newStart), now);
    expect(s.purchaseAt).toBe(new Date(oldStart).toISOString());
  });
});

describe('Abgleich mit V2 (has_already_renewed)', () => {
  const snap = () => normalizeAuthority(v1(newStart, newEnd), now);

  it('legt V1 auf die laufende V2-Periode, Werte aus V2', () => {
    const s = canonicalizePendingRenewal(snap(), [receipt()], uid);
    expect(s.purchaseAt).toBe(new Date(oldStart).toISOString());
    expect(s.expiresAt).toBe(new Date(newEnd).toISOString());
  });
  it.each([
    ['anderer Besitzer', { owner: '22222222-2222-4222-8222-222222222222' }],
    ['ohne Zugang', { givesAccess: false }],
    ['nicht verlängert', { renewal: 'will_renew' }],
    ['anderes Ende', { endsAt: newEnd + 24 * H }],
    ['neue Periode beginnt nicht am alten Ende', { periodEnd: newStart - 24 * H }],
    ['anderer Store', { store: 'play_store', app: 'appb5d35dd723' }],
  ])('ändert nichts bei %s', (_label, over) => {
    const s = canonicalizePendingRenewal(snap(), [receipt(over as Partial<Receipt>)], uid);
    expect(s.purchaseAt).toBe(new Date(newStart).toISOString());
  });
  it('ändert nichts bei zwei passenden Belegen (nicht eindeutig)', () => {
    const s = canonicalizePendingRenewal(snap(), [receipt(), receipt({ id: 'sub_2' })], uid);
    expect(s.purchaseAt).toBe(new Date(newStart).toISOString());
  });

  it('Ownership-Planer akzeptiert den abgeglichenen Stand (vorher V1_V2_DISAGREE)', () => {
    const r = receipt();
    const raw = snap();
    const account = (s: typeof raw): Account => ({
      uid, version: 'v1', lease: 'lease-1', fetchedAt: now, complete: true, aliases: [],
      v1Plan: s.plan, v1Product: s.productId, v1Store: s.store,
      v1PurchaseAt: s.purchaseAt === null ? null : Date.parse(s.purchaseAt),
      v1ExpiresAt: s.expiresAt === null ? null : Date.parse(s.expiresAt),
    });
    expect(() => planOwnership([account(raw)], [r], [], catalog, now)).toThrow('V1_V2_DISAGREE');
    const fixed = canonicalizeProviderTimes(raw, [r], uid);
    const plan = planOwnership([account(fixed)], [r], [], catalog, now);
    expect(plan.accounts).toEqual([uid]);
    expect(plan.receipts).toHaveLength(1);
  });
});
