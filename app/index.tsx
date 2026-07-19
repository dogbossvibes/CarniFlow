import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';

export default function Index() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const [retry, setRetry] = useState(0);

  // Sicherheitsnetz: Der Bootstrap wird bereits im SessionProvider (8s) abgesichert.
  // Sollte `loading` dennoch hängen bleiben, zeigt dieser Screen nach 10s eine
  // sichtbare Karte statt eines endlosen Spinners. „Erneut versuchen" re-armt den
  // Timer (manuell — keine automatische Reload-Schleife).
  useEffect(() => {
    if (!loading) return;
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [loading, retry]);

  if (loading && !timedOut) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (loading && timedOut) {
    return (
      <View style={s.center}>
        <View style={s.card}>
          <Text style={s.title}>ANYVO konnte nicht vollständig gestartet werden.</Text>
          <TouchableOpacity style={s.btn} onPress={() => setRetry(r => r + 1)} activeOpacity={0.85}>
            <Text style={s.btnTxt}>Erneut versuchen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnGhost} onPress={() => router.replace('/(auth)/login')} activeOpacity={0.85}>
            <Text style={s.btnGhostTxt}>Zum Login</Text>
          </TouchableOpacity>
          {__DEV__ && <Text style={s.devHint}>Boot Timeout</Text>}
        </View>
      </View>
    );
  }

  return <Redirect href={session ? '/(tabs)/home' : '/(auth)/login'} />;
}

const s = StyleSheet.create({
  center:      { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { width: '100%', maxWidth: 360, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 24, gap: 12, alignItems: 'stretch' },
  title:       { fontSize: 16, color: C.white, fontWeight: '800', textAlign: 'center', lineHeight: 22, marginBottom: 6 },
  btn:         { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnTxt:      { fontSize: 15, color: C.accentText, fontWeight: '800' },
  btnGhost:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  btnGhostTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  devHint:     { fontSize: 11, color: C.subtle, textAlign: 'center', marginTop: 4 },
});
