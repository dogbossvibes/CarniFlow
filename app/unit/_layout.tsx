import { Stack } from 'expo-router';
import { C } from '@/constants/colors';

export default function UnitLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown:   false,
        contentStyle:  { backgroundColor: C.bg },
        animation:     'slide_from_right',
      }}
    >
      <Stack.Screen name="start" />
      <Stack.Screen name="[discipline]" />
      <Stack.Screen name="live" />
      <Stack.Screen name="summary" options={{ animation: 'fade' }} />
      <Stack.Screen name="detail" />
      <Stack.Screen name="new-category" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="document" />
    </Stack>
  );
}
