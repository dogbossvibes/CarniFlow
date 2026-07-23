jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { hasStorePackageForProduct, type PurchasePackage } from '@/lib/purchases';
import {
  isTrainerClientForTrainer,
  isTrainerConnectionForClient,
} from '@/services/connectionService';
import {
  normalizeCode,
  redeemTrainerCodeMessage,
} from '@/services/trainerService';
import { PRODUCT_IDS, PLAN_META } from '@/features/subscription/plans';
import type { ConnectionView } from '@/types/connection';

const connection = (over: Partial<ConnectionView> = {}): ConnectionView => ({
  id: 'c1',
  created_at: '2026-01-01T00:00:00Z',
  owner_user_id: 'client',
  connected_user_id: 'trainer',
  status: 'accepted',
  created_by: 'owner',
  connection_type: 'trainer_client',
  connection_name: null,
  myRole: 'connected',
  counterpartId: 'client',
  counterpartName: 'Client',
  ...over,
});

const pkg = (productId: string): PurchasePackage => ({
  id: `$rc_${productId}`,
  offeringId: 'default',
  title: productId,
  priceString: 'CHF 15.00',
  packageType: 'MONTHLY',
  productId,
  tier: /trainer/i.test(productId) ? 'trainer' : 'pro',
  raw: {},
});

describe('Trainer-Code: kanonisches Profilformat', () => {
  it('normalisiert alle Eingaben auf CANIS-XXXX', () => {
    expect(normalizeCode('canis-4827')).toBe('CANIS-4827');
    expect(normalizeCode('CANIS4827')).toBe('CANIS-4827');
    expect(normalizeCode(' 4827 ')).toBe('CANIS-4827');
  });

  it('verwendet verständliche Statusmeldungen statt roher DB-Fehler', () => {
    expect(redeemTrainerCodeMessage('invalid_code')).toBe('Code nicht gefunden.');
    expect(redeemTrainerCodeMessage('already_connected')).toBe('Du bist bereits mit diesem Trainer verbunden.');
    expect(redeemTrainerCodeMessage('self_connection')).toBe('Du kannst dich nicht mit dir selbst verbinden.');
  });
});

describe('Trainer-Kundenliste: nur trainer_client-Verbindungen', () => {
  it('zeigt verbundene Kunden und offene Anfragen des Trainers', () => {
    expect(isTrainerClientForTrainer(connection({ status: 'accepted' }))).toBe(true);
    expect(isTrainerClientForTrainer(connection({ status: 'pending' }))).toBe(true);
  });

  it('blendet abgelehnte, blockierte und ANYVO-Connect-Beziehungen aus', () => {
    expect(isTrainerClientForTrainer(connection({ status: 'declined' }))).toBe(false);
    expect(isTrainerClientForTrainer(connection({ status: 'blocked' }))).toBe(false);
    expect(isTrainerClientForTrainer(connection({ connection_type: 'connect_friend' }))).toBe(false);
  });

  it('Kundenseite sieht denselben Verbindungstyp in Gegenrichtung', () => {
    expect(isTrainerConnectionForClient(connection({ myRole: 'owner', counterpartId: 'trainer' }))).toBe(true);
    expect(isTrainerConnectionForClient(connection({ myRole: 'connected' }))).toBe(false);
  });
});

describe('RevenueCat Package-Mapping', () => {
  it('Trainer-Kauf wird nur vorbereitet, wenn das zentrale Trainer-Produkt geladen ist', () => {
    expect(PLAN_META.trainer.productId).toBe(PRODUCT_IDS.trainerMonthly);
    expect(hasStorePackageForProduct([pkg(PRODUCT_IDS.trainerMonthly)], PLAN_META.trainer.productId)).toBe(true);
    expect(hasStorePackageForProduct([pkg(PRODUCT_IDS.activeMonthly)], PLAN_META.trainer.productId)).toBe(false);
  });
});
