/** BTHome v2 service data, excluding UUID bytes (ble-plx serviceData format). */
export const BTHOME_SERVICE_UUID = '0000fcd2-0000-1000-8000-00805f9b34fb';
export const BUTTON_EVENTS = {
  1: 'Einfachklick', 2: 'Doppelklick', 3: 'Dreifachklick', 4: 'Langdruck',
  5: 'Doppel-Langdruck', 6: 'Dreifach-Langdruck', 128: 'Gedrückt halten',
} as const;
export type ButtonEvent = keyof typeof BUTTON_EVENTS;
export type BthomeButtonPacket = {
  ok: true; packetId: number | null; battery: number | null; button: ButtonEvent | null;
  deviceType: number | null; fingerprint: string;
} | { ok: false; reason: 'malformed' | 'unsupported-version' | 'encrypted' | 'unsupported-object' | 'unsupported-event' };

export function decodeServiceData(base64: string): Uint8Array | null {
  if (!base64 || base64.length > 1024 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0, bits = 0;
  for (const char of base64.replace(/=+$/, '')) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) return null;
  return Uint8Array.from(bytes);
}

export function parseBthomeButton(bytes: Uint8Array): BthomeButtonPacket {
  if (bytes.length < 1) return { ok: false, reason: 'malformed' };
  if ((bytes[0] >> 5) !== 2) return { ok: false, reason: 'unsupported-version' };
  if (bytes[0] & 1) return { ok: false, reason: 'encrypted' };
  if (bytes[0] & 0x1a) return { ok: false, reason: 'malformed' }; // reserved bits
  let packetId: number | null = null, battery: number | null = null, button: ButtonEvent | null = null, deviceType: number | null = null;
  const seen = new Set<number>();
  for (let i = 1; i < bytes.length;) {
    const object = bytes[i++];
    if (seen.has(object)) return { ok: false, reason: 'malformed' }; // one-button prototype
    seen.add(object);
    const size = object === 0xf0 ? 2 : object === 0xf1 ? 4 : object === 0xf2 ? 3 : [0, 1, 0x3a].includes(object) ? 1 : null;
    if (size == null) return { ok: false, reason: 'unsupported-object' };
    if (i + size > bytes.length) return { ok: false, reason: 'malformed' };
    const value = bytes[i];
    if (object === 0) packetId = value;
    if (object === 1) { if (value > 100) return { ok: false, reason: 'malformed' }; battery = value; }
    if (object === 0xf0) deviceType = value | (bytes[i + 1] << 8);
    if (object === 0x3a && value !== 0) {
      if (!(value in BUTTON_EVENTS)) return { ok: false, reason: 'unsupported-event' };
      button = value as ButtonEvent;
    }
    i += size;
  }
  return { ok: true, packetId, battery, button, deviceType, fingerprint: Array.from(bytes).map(v => v.toString(16).padStart(2, '0')).join('') };
}

/** Diagnostic burst suppression only. Missing packet IDs cannot prove unique clicks. */
export function createButtonDeduplicator(burstMs = 2000) {
  const recent = new Map<string, Map<string, number>>();
  return {
    reset: () => recent.clear(),
    duplicate: (deviceId: string, packet: Extract<BthomeButtonPacket, { ok: true }>, nowMs: number) => {
      const entries = recent.get(deviceId) ?? new Map<string, number>();
      recent.set(deviceId, entries);
      for (const [key, time] of entries) if (nowMs - time > burstMs || nowMs < time) entries.delete(key);
      const key = `${packet.packetId ?? 'missing'}:${packet.fingerprint}`;
      const previous = entries.get(key);
      if (previous != null) return true;
      entries.set(key, nowMs);
      return false;
    },
  };
}
