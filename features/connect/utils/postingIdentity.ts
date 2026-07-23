import type { Dog } from '@/types';

// Sichtbarer Absender eines CONNECT-Beitrags. Die Identität ist IMMER der
// eingeloggte Halter (userId); ein Hund ist nur das sichtbare Absenderprofil.
// Ein Hund hat NIEMALS einen eigenen Auth-Account.
export type ConnectPostingIdentity =
  | { type: 'user'; userId: string; dogId: null;   displayName: string; avatarUrl: string | null }
  | { type: 'dog';  userId: string; dogId: string; displayName: string; avatarUrl: string | null };

export interface ConnectUserIdentityInput {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

// Ein Hund ist als Absender berechtigt, wenn er dem Nutzer gehört
// (owner_id === userId). RLS bleibt die endgültige Autorisierung.
export function isEligibleDog(dog: Pick<Dog, 'owner_id'>, userId: string): boolean {
  return dog.owner_id === userId;
}

/** Alle wählbaren Absender: Halter zuerst, dann die berechtigten Hunde. */
export function buildPostingIdentities(user: ConnectUserIdentityInput, dogs: Dog[]): ConnectPostingIdentity[] {
  const owner: ConnectPostingIdentity = {
    type: 'user', userId: user.userId, dogId: null,
    displayName: user.displayName, avatarUrl: user.avatarUrl,
  };
  const dogIds = dogs
    .filter(d => isEligibleDog(d, user.userId))
    .map<ConnectPostingIdentity>(d => ({
      type: 'dog', userId: user.userId, dogId: d.id,
      displayName: d.name, avatarUrl: d.photo_url ?? null,
    }));
  return [owner, ...dogIds];
}

/** Stabiler Schlüssel für Persistenz (zuletzt gewählte Identität). */
export function identityKey(id: ConnectPostingIdentity): string {
  return id.type === 'dog' ? `dog:${id.dogId}` : 'user';
}

/**
 * Löst die zuletzt gewählte Identität sicher auf:
 *  - gespeicherter Schlüssel nur, wenn er noch in den (berechtigten) Identitäten liegt
 *    (gelöschte/nicht mehr berechtigte Hunde fallen automatisch heraus),
 *  - sonst der Halter (immer vorhanden, sauberer Fallback ohne Hund).
 */
export function resolvePostingIdentity(
  savedKey: string | null | undefined,
  identities: ConnectPostingIdentity[],
): ConnectPostingIdentity {
  const match = savedKey ? identities.find(i => identityKey(i) === savedKey) : undefined;
  return match ?? identities.find(i => i.type === 'user') ?? identities[0];
}
