import * as Crypto from 'expo-crypto';

// Stabile lokale ID (bleibt dauerhaft; remote_id kommt erst nach Sync).
export const newLocalId = (prefix = 'local') => `${prefix}_${Crypto.randomUUID()}`;
export const nowIso = () => new Date().toISOString();
