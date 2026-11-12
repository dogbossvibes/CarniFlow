/** Conservatively serialize BLE diagnostics and external GPS ownership. */
export type BleOperationOwner = 'external-gps' | 'shelly-diagnostics';
export interface BleOperationLease { owner: BleOperationOwner; release(): void }
let current: BleOperationLease | null = null;
export const getBleOperationOwner = () => current?.owner ?? null;
export function acquireBleOperationLease(owner: BleOperationOwner): BleOperationLease | null {
  if (current) return null;
  const lease: BleOperationLease = { owner, release: () => { if (current === lease) current = null; } };
  current = lease;
  return lease;
}
