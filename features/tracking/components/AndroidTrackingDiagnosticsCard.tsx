import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { readAndroidTrackingDiagnostics, type AndroidTrackingDiagnostics } from '@/features/tracking/native/androidTrackingDiagnostics';

const yesNo = (value: boolean | null) => value === null ? 'unbekannt' : value ? 'ja' : 'nein';
const milliseconds = (value: number | null) => value === null ? 'unbekannt' : `${Math.round(value)} ms`;

/** Mounted only inside DiagnosticsRouteGate. No timer, permission prompt or tracking start. */
export function AndroidTrackingDiagnosticsCard() {
  const [snapshot, setSnapshot] = useState<AndroidTrackingDiagnostics | null>(null);
  const [queried, setQueried] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  if (Platform.OS !== 'android') return null;
  const refresh = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const next = await readAndroidTrackingDiagnostics();
      if (alive.current) { setSnapshot(next); setQueried(true); }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const rows: [string, string][] = snapshot ? [
    ['Genauer Standort erlaubt', yesNo(snapshot.fineLocationGranted)],
    ['Ungefährer Standort erlaubt', yesNo(snapshot.coarseLocationGranted)],
    ['Hintergrundstandort erlaubt', yesNo(snapshot.backgroundLocationGranted)],
    ['Bildschirm interaktiv', yesNo(snapshot.screenInteractive)],
    ['Energiesparmodus', yesNo(snapshot.powerSaveMode)],
    ['Gerät im Ruhezustand', yesNo(snapshot.deviceIdleMode)],
    ['Ausnahme von Akkuoptimierung', yesNo(snapshot.batteryOptimizationExempt)],
    ['Standort-Foreground-Service beobachtet', yesNo(snapshot.locationForegroundServiceObserved)],
    ['Precision-Listener gestartet', yesNo(snapshot.precisionListener.nativeListenerStarted)],
    ['Precision-Fixes seit Listenerstart', snapshot.precisionListener.receivedFixCount?.toString() ?? 'unbekannt'],
    ['Letztes Fix-Alter beim Empfang', milliseconds(snapshot.precisionListener.lastFixAgeAtReceiptMs)],
    ['Zeit seit letztem Callback bei Abfrage', milliseconds(snapshot.precisionListener.lastCallbackAgeMs)],
  ] : [];

  return (
    <View style={s.card} testID="android-tracking-diagnostics">
      <Text style={s.title}>Android · aktueller Systemzustand</Text>
      <Text style={s.note}>Momentaufnahme bei Abfrage. Diese Werte gehören zur laufenden App, nicht zu einer gespeicherten Fährte. Ein sichtbarer Dienst belegt keine GPS-Lieferung. Precision-Zähler erfassen ausschließlich den nativen Precision-Listener; der Expo-Pfad ist darin nicht enthalten.</Text>
      <Pressable onPress={() => void refresh()} disabled={busy} accessibilityRole="button"
        accessibilityLabel="Android-Systemzustand abfragen" accessibilityState={{ disabled: busy, busy }}
        style={({ pressed }) => [s.button, pressed && { opacity: 0.7 }]}>
        <Text style={s.buttonText}>{busy ? 'Wird abgefragt …' : 'Systemzustand abfragen'}</Text>
      </Pressable>
      {queried && !snapshot && <Text style={s.note}>Native Diagnose nicht verfügbar. Diese Funktion benötigt den neuen Android-Build.</Text>}
      {rows.map(([label, value]) => <View key={label} style={s.row}>
        <Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text>
      </View>)}
      {snapshot && <Text style={s.note}>Dienstverlauf und Bestätigung des Hintergrundtasks: nicht verfügbar. Eine durchgehende Aufnahme lässt sich aus dieser Momentaufnahme nicht ableiten.</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.trackCard, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: C.trackBorder },
  title: { color: C.trackText, fontSize: 16, fontWeight: '700' },
  note: { color: C.trackTextSec, fontSize: 12, lineHeight: 18 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.accentDim, paddingHorizontal: 12 },
  buttonText: { color: C.accent, fontWeight: '600', fontSize: 14 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  label: { color: C.trackTextSec, flex: 1, fontSize: 12, lineHeight: 18 },
  value: { color: C.trackText, maxWidth: '45%', fontSize: 12, lineHeight: 18, textAlign: 'right' },
});
