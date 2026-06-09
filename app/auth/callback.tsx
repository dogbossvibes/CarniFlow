import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { C } from '@/constants/colors';

export default function AuthCallback() {
  const router = useRouter();
  const { code, error: oauthError } = useLocalSearchParams<{
    code?: string;
    error?: string;
  }>();

  // Prevent double-execution: React 19 StrictMode fires effects twice in dev.
  // PKCE codes are single-use — the second call would fail and bounce the user.
  const exchanged = useRef(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Hard fallback: escape the loading screen if nothing resolves within 12s.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!exchanged.current) router.replace('/(auth)/login');
    }, 12_000);
    return () => clearTimeout(t);
  }, []);

  // React when params become available (Expo Router populates them asynchronously).
  useEffect(() => {
    if (exchanged.current) return;

    // OAuth provider sent back an error (e.g. user denied consent).
    if (oauthError) {
      exchanged.current = true;
      router.replace('/(auth)/login');
      return;
    }

    // NATIVE: Der Code wird bereits in services/auth.ts über
    // WebBrowser.openAuthSessionAsync eingelöst. PKCE-Codes sind single-use —
    // ein zweiter exchangeCodeForSession hier würde "invalid flow state"
    // werfen. Also NICHT erneut einlösen; nur auf die Session warten, die
    // auth.ts gleich setzt, und weiterleiten.
    if (Platform.OS !== 'web') {
      exchanged.current = true;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) { router.replace('/(tabs)/home'); return; }
        // Session evtl. noch nicht da → kurz auf das Auth-Event warten.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
          if (s) { subscription.unsubscribe(); router.replace('/(tabs)/home'); }
        });
      });
      return;
    }

    // Params not yet available — wait for the next render.
    if (!code) return;

    exchanged.current = true;

    // WEB: Hier gibt es kein openAuthSessionAsync — der Callback MUSS einlösen.
    // Pass just the authorization code; supabase-js reads the stored
    // code_verifier from storage and exchanges them together.
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setErrMsg(error.message);
        setTimeout(() => router.replace('/(auth)/login'), 2500);
      } else {
        router.replace('/(tabs)/home');
      }
    });
  }, [code, oauthError]); // re-run when params arrive

  return (
    <View style={s.wrap}>
      {errMsg ? (
        <>
          <View style={s.iconWrap}>
            <Ionicons name="alert-circle-outline" size={28} color={C.danger} />
          </View>
          <Text style={s.errText}>{errMsg}</Text>
          <Text style={s.hint}>Redirecting…</Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.hint}>Signing you in…</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex:            1,
    backgroundColor: C.bg,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             16,
  },
  iconWrap: {
    width:           64,
    height:          64,
    borderRadius:    20,
    backgroundColor: C.dangerDim,
    alignItems:      'center',
    justifyContent:  'center',
  },
  errText: { fontSize: 14, color: C.danger, textAlign: 'center', paddingHorizontal: 32 },
  hint:    { fontSize: 13, color: C.muted },
});
