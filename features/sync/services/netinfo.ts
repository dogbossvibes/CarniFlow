// Defensiver Wrapper um @react-native-community/netinfo. Das Paket lädt beim
// Import das native Modul → fehlt es (Expo Go / veralteter Build), crasht ein
// statischer Import. Daher dynamisch laden (wie speechRecognition/trackRecorder).

// deno-lint-ignore no-explicit-any
let NetInfo: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('@react-native-community/netinfo');
  NetInfo = m?.default ?? m;
} catch { NetInfo = null; }

export const NETINFO_AVAILABLE: boolean = !!NetInfo;

// Ohne natives Modul nehmen wir „online" an (Offline-Features inaktiv, kein Crash).
export async function fetchIsOnline(): Promise<boolean> {
  if (!NetInfo) return true;
  try { const s = await NetInfo.fetch(); return !!s.isConnected && s.isInternetReachable !== false; }
  catch { return true; }
}

export interface NetSnapshot { online: boolean; type: string | null }

export function addNetListener(cb: (snap: NetSnapshot) => void): () => void {
  if (!NetInfo) return () => {};
  try {
    return NetInfo.addEventListener((s: any) =>
      cb({ online: !!s.isConnected && s.isInternetReachable !== false, type: s.type ?? null }));
  } catch { return () => {}; }
}
