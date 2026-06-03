import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';

export default function Index() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return <Redirect href={session ? '/(tabs)/home' : '/(auth)/login'} />;
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
});
