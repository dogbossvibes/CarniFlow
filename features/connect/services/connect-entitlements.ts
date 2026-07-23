// ANYVO CONNECT — zentrale Berechtigungen. KEINE Abo-Prüfungen verteilt in
// Komponenten; alles läuft über diesen Service. Basis sind die bestehenden
// Capabilities (pro_member ⇒ isPro, trainer_module ⇒ isTrainerModule).
//
// Tiers (siehe Vorgabe):
//   Newbie:            Profil, Feed lesen, begrenzte Freunde/Nachrichten.
//   Active/Founder:      + Beiträge, Training teilen, Partner-Suche, Events.
//   Trainer:             + Gruppen, Trainerprofil, Einladungen.
//
// MVP: noch keine harte Paywall. Solange EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS
// nicht "true" ist, wird voller Zugriff gewährt (Testbarkeit), die Tier-Logik
// bleibt aber vorbereitet und aktivierbar.

export interface ConnectEntitlements {
  canViewFeed: boolean;
  canCreatePost: boolean;
  canSendMessage: boolean;
  canCreateEvent: boolean;
  canSearchTrainingPartners: boolean;
  canCreateGroup: boolean;
  canManageTrainerProfile: boolean;
  /** null = unbegrenzt. */
  maxFriends: number | null;
}

export const CONNECT_NEWBIE_MAX_FRIENDS = 25;

export const CONNECT_ENFORCE_ENTITLEMENTS =
  process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS === 'true';

const ALL_ACCESS: ConnectEntitlements = {
  canViewFeed: true,
  canCreatePost: true,
  canSendMessage: true,
  canCreateEvent: true,
  canSearchTrainingPartners: true,
  canCreateGroup: true,
  canManageTrainerProfile: true,
  maxFriends: null,
};

/** Reine Tier-Logik (testbar). */
export function connectEntitlements(caps: { isPro: boolean; isTrainerModule: boolean }): ConnectEntitlements {
  const { isPro, isTrainerModule } = caps;
  return {
    canViewFeed: true,                       // alle CONNECT-Nutzer dürfen lesen
    canCreatePost: isPro,
    canSendMessage: true,                    // begrenzt für Free (siehe maxFriends/Server)
    canCreateEvent: isPro,
    canSearchTrainingPartners: isPro,
    canCreateGroup: isTrainerModule,
    canManageTrainerProfile: isTrainerModule,
    maxFriends: isPro ? null : CONNECT_NEWBIE_MAX_FRIENDS,
  };
}

/** Effektive Entitlements inkl. MVP-Weichzeichnung. */
export function effectiveConnectEntitlements(
  caps: { isPro: boolean; isTrainerModule: boolean },
  enforce = CONNECT_ENFORCE_ENTITLEMENTS,
): ConnectEntitlements {
  return enforce ? connectEntitlements(caps) : ALL_ACCESS;
}

// Die Hook-Variante liegt bewusst separat in hooks/useConnectEntitlements.ts,
// damit dieser Service PUR bleibt (keine supabase-/React-Kette) und testbar ist.
