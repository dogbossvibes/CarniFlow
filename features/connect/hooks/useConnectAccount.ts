import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { CONNECT_ENABLED } from '@/features/connect/constants/featureFlag';
import * as repo from '@/features/connect/api/connect.repository';
import { connectErrorMessage } from '@/features/connect/api/connect.repository';
import { DEFAULT_CONNECT_PRIVACY } from '@/features/connect/services/connect-privacy';
import type {
  ConnectProfile, ConnectPrivacySettings, ConnectDogProfile,
} from '@/features/connect/types/connect.types';
import type { Dog } from '@/types';

type EligibleDog = Pick<Dog, 'id' | 'owner_id' | 'name' | 'breed' | 'birth_date' | 'photo_url' | 'is_favorite'>;

// Zentraler Lade-/Speicher-Hook für den CONNECT-Account (Profil, Datenschutz,
// sichtbare Hunde). Bei DEAKTIVIERTEM Flag wird NICHTS abgefragt — kein Fehler,
// auch wenn die CONNECT-Migration im Backend fehlt. Alle Aufrufe laufen zusätzlich
// serverseitig durch RLS.
export function useConnectAccount() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ConnectProfile | null>(null);
  const [privacy, setPrivacy] = useState<ConnectPrivacySettings | null>(null);
  const [dogs, setDogs] = useState<EligibleDog[]>([]);
  const [dogProfiles, setDogProfiles] = useState<ConnectDogProfile[]>([]);

  const load = useCallback(async () => {
    if (!CONNECT_ENABLED || !userId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [p, pr, dg, dp] = await Promise.all([
        repo.getMyConnectProfile(userId),
        repo.getMyConnectPrivacySettings(userId),
        repo.listMyEligibleDogs(userId),
        repo.listMyConnectDogProfiles(userId),
      ]);
      const firstErr = p.error || pr.error || dg.error || dp.error;
      if (firstErr) setError(connectErrorMessage(firstErr));
      setProfile(p.data ?? null);
      setPrivacy(pr.data ?? null);
      setDogs(dg.data ?? []);
      setDogProfiles(dp.data ?? []);
    } catch (e) {
      setError(connectErrorMessage({ message: (e as Error)?.message }));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const saveProfile = useCallback(async (patch: Partial<ConnectProfile>) => {
    if (!userId) return { error: 'Kein Konto.' };
    const exists = !!profile;
    const res = exists
      ? await repo.updateMyConnectProfile(userId, patch)
      : await repo.createMyConnectProfile(userId, patch);
    if (res.error) return { error: connectErrorMessage(res.error) };
    setProfile(res.data ?? null);
    return { error: null };
  }, [userId, profile]);

  const savePrivacy = useCallback(async (patch: Partial<ConnectPrivacySettings>) => {
    if (!userId) return { error: 'Kein Konto.' };
    const res = await repo.updateMyConnectPrivacySettings(userId, patch);
    if (res.error) return { error: connectErrorMessage(res.error) };
    setPrivacy(res.data ?? null);
    return { error: null };
  }, [userId]);

  const setDogVisible = useCallback(async (dogId: string, visible: boolean) => {
    if (!userId) return { error: 'Kein Konto.' };
    const res = visible
      ? await repo.upsertMyConnectDogProfile(dogId, userId, { is_visible: true })
      : await repo.disableMyConnectDogProfile(dogId);
    if (res.error) return { error: connectErrorMessage(res.error) };
    setDogProfiles(prev => {
      const next = res.data;
      if (!next) return prev;
      const rest = prev.filter(d => d.dog_id !== dogId);
      return [...rest, next];
    });
    return { error: null };
  }, [userId]);

  // Teil G: CONNECT-Profil deaktivieren — Sichtbarkeit auf privat, nicht auffindbar.
  // KEINE Datenlöschung. Reaktivierbar durch erneutes Setzen der Sichtbarkeit.
  const deactivate = useCallback(async () => {
    if (!userId) return { error: 'Kein Konto.' };
    const res = await repo.updateMyConnectProfile(userId, {
      visibility: 'private', discoverable: false,
    });
    if (res.error) return { error: connectErrorMessage(res.error) };
    setProfile(res.data ?? null);
    // Alle Hunde aus der öffentlichen Sichtbarkeit nehmen (keine Löschung).
    await Promise.all(dogProfiles.filter(d => d.is_visible).map(d => repo.disableMyConnectDogProfile(d.dog_id)));
    setDogProfiles(prev => prev.map(d => ({ ...d, is_visible: false })));
    return { error: null };
  }, [userId, dogProfiles]);

  const isDogVisible = useCallback(
    (dogId: string) => dogProfiles.some(d => d.dog_id === dogId && d.is_visible),
    [dogProfiles],
  );

  return {
    userId, loading, error, reload: load,
    profile, privacy, effectivePrivacy: privacy ?? DEFAULT_CONNECT_PRIVACY,
    dogs, dogProfiles, isDogVisible,
    saveProfile, savePrivacy, setDogVisible, deactivate,
  };
}
