import { ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '@/hooks/useSession';

// Generic calendar entry only. No trusting persisted event/dog IDs, automatic
// recording, completion, dose entry or customer data modification from a widget.
export default function TodayWidgetRoute() {
  const { session, loading } = useSession();
  if (loading) return <ActivityIndicator accessibilityLabel="ANYVO" />;
  return <Redirect href={session ? '/training-hub' : '/(auth)/login'} />;
}
