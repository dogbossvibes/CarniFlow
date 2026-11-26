import AsyncStorage from '@react-native-async-storage/async-storage';
import { GROUP_CODE_LENGTH, parseGroupCode } from '@/features/tracking-exchange/groups/joinService';

// Beitrittscode aus einem QR-Code/Link, der ohne Anmeldung geöffnet wurde.
// Nach Anmeldung (und Einführung) öffnet die App «Gruppe beitreten» damit wieder.
// Nur der Code wird gemerkt (kein Personenbezug); er gilt ohnehin höchstens 24 Stunden.
const KEY = 'anyvo.groups.pendingJoinCode.v1';
export const PENDING_GROUP_JOIN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function savePendingGroupJoin(code: string, nowMs: number = Date.now()): Promise<void> {
  const normalized = parseGroupCode(code);
  if (normalized.length !== GROUP_CODE_LENGTH) return;
  try { await AsyncStorage.setItem(KEY, JSON.stringify({ code: normalized, savedAtMs: nowMs })); } catch { /* best effort */ }
}

/** Liest den gemerkten Code genau einmal und entfernt ihn. null = keiner oder zu alt. */
export async function takePendingGroupJoin(nowMs: number = Date.now()): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    const value = JSON.parse(raw) as { code?: unknown; savedAtMs?: unknown };
    if (typeof value.code !== 'string' || typeof value.savedAtMs !== 'number') return null;
    if (nowMs - value.savedAtMs > PENDING_GROUP_JOIN_MAX_AGE_MS || value.savedAtMs > nowMs + 60_000) return null;
    const code = parseGroupCode(value.code);
    return code.length === GROUP_CODE_LENGTH ? code : null;
  } catch {
    return null;
  }
}
