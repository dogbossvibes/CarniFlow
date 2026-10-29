import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { routeCopy as copy } from './routeCopy';

// Optional placement component for the Home/navigation owner. Its route is
// guarded independently; adding the entry never activates server or microphone.
export function IntelligenceEntry() {
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel={copy.title} style={styles.entry}
    onPress={() => router.push('/intelligence' as never)}><Text style={styles.text}>{copy.title}</Text></Pressable>;
}
const styles = StyleSheet.create({
  entry: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: C.accent, justifyContent: 'center' },
  text: { color: C.accentText, fontSize: 16, fontWeight: '600' },
});
