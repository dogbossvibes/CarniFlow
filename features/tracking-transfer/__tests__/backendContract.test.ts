import fixture from './fixtures/backend-v1.json';
import { parseTransferOffer } from '../service';
import { createTrackTransferImportPlan, parseTransferReceipt } from '../importPlan';
import { parseTrackTransferReference } from '../reference';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
it('accepts the actual synthetic PostgreSQL offer and receipt without changing original fields', () => {
  const offer = parseTransferOffer(fixture.offer.transfer), receipt = parseTransferReceipt(fixture.accept.receipt);
  const reference = parseTrackTransferReference(fixture.accept.reference);
  expect(receipt.transferId).toBe(offer.transferId);
  expect(receipt.referenceDigest).toBe(fixture.accept.referenceDigest);
  expect(reference).toEqual(fixture.accept.reference);
  const plan = createTrackTransferImportPlan(receipt, reference);
  expect(plan.receipt.recipientUserId).toBe(offer.recipientUserId);
  expect(plan.statements).toHaveLength(2 + reference.points.length + reference.markers.length);
  expect(fixture.accept.quota.success).toBe(true);
});
