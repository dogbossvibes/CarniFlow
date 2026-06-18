import { Stack, Redirect } from 'expo-router';
import { C } from '@/constants/colors';
import { useCapabilities } from '@/hooks/useCapabilities';

// Navigation-Guard: Trainerbereiche nur mit trainer_module (Plan 'trainer').
// Active/Founder/Trial/Free → Upgrade-Screen. Während des Ladens kein harter
// Redirect (sonst Flackern), aber kein Trainer-Inhalt.
export default function TrainerAreaLayout() {
  const { isTrainerModule, loading } = useCapabilities();

  if (!loading && !isTrainerModule) {
    return <Redirect href="/premium" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
  );
}
