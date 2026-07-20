import type { Dog } from '@/types';

// Sichtbarer Absender eines CONNECT-Beitrags/Chats.
// WICHTIG: Ein Hund hat NIEMALS einen eigenen Auth-Account. Die Identität bleibt
// immer der eingeloggte Halter (author_user_id); der Hund ist nur das sichtbare
// Absenderprofil (author_dog_id, optional).
export type ConnectSender =
  | { kind: 'dog'; dog: Dog }
  | { kind: 'personal' };

/**
 * Standard-Absender bestimmen (reine Funktion, testbar):
 *   1. zuletzt aktiver Hund (aus laufendem Training),
 *   2. sonst der als Favorit markierte Hund,
 *   3. sonst der erste Hund,
 *   4. ohne Hund → persönliches Halter-Profil.
 */
export function pickConnectSender(dogs: Dog[], activeDogId: string | null): ConnectSender {
  if (!dogs.length) return { kind: 'personal' };
  const activeDog = activeDogId ? dogs.find(d => d.id === activeDogId) : undefined;
  const favorite = dogs.find(d => d.is_favorite === true);
  return { kind: 'dog', dog: activeDog ?? favorite ?? dogs[0] };
}
