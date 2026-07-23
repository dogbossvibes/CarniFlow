// Polyfills must be the very first imports so they patch globals before
// any Supabase / crypto code runs.
import 'react-native-get-random-values';       // patches crypto.getRandomValues
import 'react-native-url-polyfill/auto';        // patches URL constructor
import '@/lib/crypto-polyfill';                 // patches crypto.subtle.digest via expo-crypto
import '@/features/tracking/native/backgroundLocationTask';  // registriert den Fährten-Hintergrund-Task
import '../global.css';                         // NativeWind (Tailwind) — Theme/Tokens

import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from '@/lib/session-context';
import { queryClient } from '@/lib/queryClient';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { initMonitoring, captureError } from '@/lib/monitoring';
import { SyncProvider } from '@/features/sync/components/SyncProvider';
import { AppLockGate } from '@/components/AppLockGate';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';

// Crash-/Error-Reporting initialisieren (no-op ohne DSN oder bei Opt-out).
void initMonitoring();

// Aktive-Fährten-Registry aus dem lokalen Speicher laden (offene Fährten pro Hund
// überleben App-Neustart). Einmalig, unabhängig vom Login — rein lokal, kein Netz.
void useActiveFaehrten.getState().hydrate();

// Globaler Fehler-Fallback: fängt Render-Fehler im gesamten Baum ab,
// meldet sie und bietet einen Neustart-Button (statt Blank-Crash).
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { captureError(error); }, [error]);
  return (
    <View style={eb.wrap}>
      <View style={eb.icon}><Ionicons name="alert-circle-outline" size={40} color={C.accent} /></View>
      <Text style={eb.title}>Etwas ist schiefgelaufen</Text>
      <Text style={eb.text}>Die App hatte einen kurzen Aussetzer. Versuch es nochmal.</Text>
      <TouchableOpacity style={eb.btn} onPress={retry} activeOpacity={0.85}>
        <Text style={eb.btnText}>Erneut versuchen</Text>
      </TouchableOpacity>
    </View>
  );
}

const eb = StyleSheet.create({
  wrap:    { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  icon:    { width: 80, height: 80, borderRadius: 24, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title:   { fontSize: 20, color: C.white, fontWeight: '800' },
  text:    { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  btn:     { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 },
  btnText: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <StatusBar style="light" />
      <SyncProvider />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="dog/[id]" />
        <Stack.Screen name="modal"    options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-dog"  options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-dog"      options={{ presentation: 'modal' }} />
        <Stack.Screen name="training/[id]" />
        <Stack.Screen name="track/index" />
        <Stack.Screen name="track/historie" />
        <Stack.Screen name="analyse/smart-search" />
        <Stack.Screen name="analyse/insights" />
        <Stack.Screen name="analyse/coach" />
        <Stack.Screen name="track/[id]" />
        <Stack.Screen name="track/legen"  options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="sync" />
        {/* ANYVO CONNECT — Stack-Routen. Die Route-Dateien laden ihren Screen nur
            bei aktivem Feature-Flag (sonst Redirect); reine Registrierung ist
            boot-neutral und verursacht keine CONNECT-Abfrage. */}
        <Stack.Screen name="connect/onboarding" />
        <Stack.Screen name="connect/profil" />
        <Stack.Screen name="connect/profil-bearbeiten" options={{ presentation: 'modal' }} />
        <Stack.Screen name="connect/datenschutz" />
        <Stack.Screen name="connect/hunde" />
        <Stack.Screen name="connect/vorschau" />
        <Stack.Screen name="dev/offline-debug" />
      </Stack>
      <AppLockGate />
    </SessionProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
