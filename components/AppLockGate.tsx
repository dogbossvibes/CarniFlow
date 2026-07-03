import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useAppLockSetting } from '@/hooks/useAppLockSetting';

// expo-local-authentication ist nativ → defensiv laden, damit ein Build OHNE das
// Modul nicht schon beim Import crasht (Feature ist dann einfach inaktiv).
let LocalAuth: typeof import('expo-local-authentication') | null = null;
try { LocalAuth = require('expo-local-authentication'); } catch { LocalAuth = null; }
export const APP_LOCK_AVAILABLE = LocalAuth != null;

// Biometrische App-Sperre (iOS + Android). Wenn aktiviert und ein Nutzer
// angemeldet ist, verlangt die App beim Kaltstart und nach jedem Wechsel aus dem
// Hintergrund eine Entsperrung (Face ID / Touch ID / Fingerabdruck / Geräte-Code).
// Rendert im gesperrten Zustand ein deckendes Overlay über der gesamten App.
export function AppLockGate() {
  const { session } = useSession();
  const { enabled, loaded } = useAppLockSetting();
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const authingRef = useRef(false);
  const promptedRef = useRef(false);   // pro Sperre genau einmal automatisch prompten

  const active = APP_LOCK_AVAILABLE && enabled && loaded && !!session;

  const authenticate = useCallback(async () => {
    if (!LocalAuth || authingRef.current) return;
    authingRef.current = true;
    try {
      const res = await LocalAuth.authenticateAsync({
        promptMessage: 'ANYVO entsperren',
        cancelLabel: 'Abbrechen',
        disableDeviceFallback: false,   // Geräte-Code als Rückfall erlaubt
      });
      if (res.success) setLocked(false);
    } catch { /* gesperrt lassen, Nutzer kann erneut versuchen */ }
    finally { authingRef.current = false; }
  }, []);

  // Kaltstart / neues Login: sperren, wenn aktiviert + eingeloggt + verfügbar.
  useEffect(() => {
    if (active) { setLocked(true); promptedRef.current = false; }
  }, [active]);

  // Nur bei ECHTEM Hintergrund→Vordergrund erneut sperren. WICHTIG: der Face-ID-
  // Prompt setzt die App kurz auf 'inactive' (nicht 'background') — das darf NICHT
  // erneut sperren/prompten, sonst Endlosschleife.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (active && prev === 'background' && next === 'active') {
        setLocked(true); promptedRef.current = false;
      }
    });
    return () => sub.remove();
  }, [active]);

  // Genau EINMAL automatisch prompten, sobald gesperrt + Vordergrund. Bei
  // Abbruch/Fehlversuch bleibt es gesperrt; erneut nur über den „Entsperren"-Button.
  useEffect(() => {
    if (locked && active && !promptedRef.current && AppState.currentState === 'active') {
      promptedRef.current = true;
      void authenticate();
    }
  }, [locked, active, authenticate]);

  if (!active || !locked) return null;

  return (
    <View style={s.overlay}>
      <View style={s.iconWrap}>
        <Ionicons name="lock-closed" size={34} color={C.accent} />
      </View>
      <Text style={s.title}>ANYVO ist gesperrt</Text>
      <Text style={s.sub}>Zum Entsperren authentifizieren.</Text>
      <Pressable style={s.btn} onPress={() => void authenticate()}>
        <Ionicons name="finger-print" size={18} color={C.accentText} />
        <Text style={s.btnTxt}>Entsperren</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  overlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: C.accentMid, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title:    { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.4 },
  sub:      { fontSize: 14, color: C.muted, textAlign: 'center' },
  btn:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, height: 50, paddingHorizontal: 26, borderRadius: 14, backgroundColor: C.accent },
  btnTxt:   { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
