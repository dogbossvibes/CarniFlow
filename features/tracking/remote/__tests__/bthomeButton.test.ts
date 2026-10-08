import { parseBthomeButton, decodeServiceData, createButtonDeduplicator } from '../bthomeButton';
const packet = (id: number | null, button = 1) => parseBthomeButton(Uint8Array.from([0x44, ...(id == null ? [] : [0, id]), 1, 80, 0x3a, button, 0xf0, 1, 0, 0xf2, 0, 1, 2]));
it.each([1, 2, 3, 4, 5, 6, 128])('parses supported button %d with battery and device metadata', button => {
  expect(packet(255, button)).toMatchObject({ ok: true, button, packetId: 255, battery: 80, deviceType: 1 });
});
it.each([[0x45, 0x3a, 1], [0x24, 0x3a, 1], [0x44, 0x3a], [0x44, 0xff, 0x3a, 1], [0x44, 0x3a, 99], [0x44, 1, 101], [0x44, 0, 1, 0, 2]].map(bytes => [bytes] as const))('rejects encrypted/version/truncated/unknown/invalid/duplicate fields without guessing bytes: %j', bytes => {
  expect(parseBthomeButton(Uint8Array.from(bytes)).ok).toBe(false);
});
it('decodes BLE service data strictly', () => {
  expect(Array.from(decodeServiceData('RAABAToB')!)).toEqual([0x44, 0, 1, 1, 0x3a, 1]);
  for (const bad of ['', '***=', 'A===', 'AB==', 'abc', 'AA=A']) expect(decodeServiceData(bad)).toBeNull();
});
it('deduplicates bursts per device while allowing rapid changed IDs, wraparound, restart and expired no-ID payloads', () => {
  const dedup = createButtonDeduplicator();
  const check = (id: number | null, now: number, device = 'a') => { const parsed = packet(id); if (!parsed.ok) throw new Error('fixture'); return dedup.duplicate(device, parsed, now); };
  expect(check(255, 1000)).toBe(false); expect(check(255, 1100)).toBe(true);
  expect(check(0, 1200)).toBe(false); expect(check(1, 1300)).toBe(false); expect(check(1, 1300, 'b')).toBe(false);
  dedup.reset(); expect(check(1, 1400)).toBe(false);
  expect(check(null, 1500)).toBe(false); expect(check(null, 1600)).toBe(true); expect(check(null, 4000)).toBe(false);
  expect(check(null, 1000)).toBe(false); // wall-clock rollback cannot suppress forever
});
