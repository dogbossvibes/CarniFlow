import { Stack } from 'expo-router';
import { C } from '@/constants/colors';

// Customer Release Phase 10 (25.09.2026): this route group mixes CONNECT WITH
// A TRAINER (client-side, free for every plan — app/trainer/index.tsx, "Meine
// Trainer") with BE A TRAINER / professional screens (dashboard.tsx,
// plaene.tsx, plan-neu.tsx, registrieren.tsx, edit.tsx). A blanket capability
// redirect used to live here and gated the ENTIRE group, including index.tsx
// — so NEWBIE/ACTIVE hit /premium the instant they tapped "Meine Trainer",
// even though that screen itself has never checked any capability. Root
// cause: the guard belonged on the individual professional screens, not on
// the shared layout. Each professional screen now carries its own capability
// check (dashboard.tsx, plaene.tsx, edit.tsx already had one; registrieren.tsx
// and plan-neu.tsx gained one in this phase). plan/[id].tsx intentionally has
// none — it is legitimately dual-use (the plan's trainer AND any client it is
// shared_with), and access is already correctly enforced server-side by
// training_plans' RLS. This layout is now a plain Stack wrapper with no
// capability logic at all.
export default function TrainerAreaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
  );
}
