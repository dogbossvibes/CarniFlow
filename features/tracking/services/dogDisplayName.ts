// Anzeigename eines Hundes für die Liegezeit-Live-Activity — aufgelöst über SEINE dogId
// (nie über einen globalen „currentDog"). Reine Darstellungsinformation; Identität bleiben
// dogId + sessionId. Offline/Fehler/Timeout → null (der Aufrufer zeigt dann eine neutrale
// Beschriftung statt „Hund"). Der Dogs-Dienst (Supabase-Client) wird erst beim Aufruf geladen —
// ein fehlender/fehlerhafter Client führt so nur zu null, nie zu einem Import-Fehler des Screens.
export async function resolveDogDisplayName(dogId: string, timeoutMs = 4000): Promise<string | null> {
  if (!dogId) return null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDogById } = require('@/services/dogs') as typeof import('@/services/dogs');
    const res = await Promise.race([getDogById(dogId), timeout]);
    const name = (res as { data?: { name?: unknown } | null } | null)?.data?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
