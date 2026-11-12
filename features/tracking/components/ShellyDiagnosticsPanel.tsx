import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { shellyDiagnostics } from '../remote/shellyDiagnostics';
import { BUTTON_EVENTS } from '../remote/bthomeButton';

export function ShellyDiagnosticsPanel() {
  const state = useSyncExternalStore(shellyDiagnostics.subscribe, shellyDiagnostics.getSnapshot, shellyDiagnostics.getSnapshot);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); shellyDiagnostics.stop(); };
  }, []);
  const scanning = state.status === 'scanning' || state.status === 'starting';
  const stopping = state.status === 'stopping';
  const stopFailed = state.stopRetryRequired;
  const selected = state.devices.find(d => d.id === state.selectedId);
  return <View style={s.card}>
    <Text style={s.title}>Shelly · Empfangsdiagnose</Text>
    <Text style={s.note}>Nur im Vordergrund. Klicks erzeugen hier keine Fährtenmarker. Empfang bei gesperrtem Bildschirm ist noch nicht nachgewiesen.</Text>
    <Pressable style={s.button} disabled={stopping} accessibilityRole="button" accessibilityState={{ disabled: stopping }} accessibilityLabel={scanning || stopFailed ? 'Bluetooth-Diagnose stoppen' : 'Bluetooth-Diagnose starten'} onPress={() => scanning || stopFailed ? void shellyDiagnostics.stop() : void shellyDiagnostics.start()}>
      <Text style={s.buttonText}>{stopping ? 'Diagnose wird gestoppt …' : scanning || stopFailed ? 'Diagnose stoppen' : 'Diagnose starten'}</Text>
    </Pressable>
    {state.error ? <Text accessibilityRole="alert" style={s.error}>{state.error}</Text> : null}
    {state.devices.map(device => <Pressable key={device.id} style={[s.button, device.id === state.selectedId && s.selected]} accessibilityRole="button" accessibilityState={{ selected: device.id === state.selectedId }} onPress={() => shellyDiagnostics.select(device.id)}>
      <Text style={s.line}>{device.name} · {device.id === state.selectedId ? 'ausgewählt' : 'auswählen'}</Text>
    </Pressable>)}
    <Text style={s.line}>Zuletzt empfangen: {selected ? `${Math.max(0, (now - selected.lastReceivedAt) / 1000).toFixed(1)} s` : 'noch kein ausgewähltes Gerät'}</Text>
    <Text style={s.line}>Batterie: {selected?.battery == null ? 'unbekannt' : `${selected.battery}%`}</Text>
    <Text style={s.line}>Pakete / Duplikate / unlesbar: {state.packetCount} / {state.duplicateCount} / {state.invalidCount}</Text>
    <Text style={s.line}>Letzter Klick: {state.lastEvent ? BUTTON_EVENTS[state.lastEvent.button] : 'noch keiner'}</Text>
    <Text style={s.note}>Der Zeitpunkt bezeichnet den Empfang am Telefon. Ohne Paket-ID sind identische Klicks und wiederholte Aussendungen nicht sicher unterscheidbar. Ein selten sendendes Gerät bleibt ohne Verbindungsaussage sichtbar.</Text>
  </View>;
}
const s = StyleSheet.create({ card: { backgroundColor: C.card, padding: 16, borderRadius: 16, marginBottom: 16 }, title: { color: C.trackText, fontWeight: '700', marginBottom: 8 }, note: { color: C.trackTextSec, marginVertical: 8 }, line: { color: C.trackText, marginVertical: 4 }, button: { minHeight: 48, padding: 12, justifyContent: 'center', borderWidth: 1, borderColor: C.borderLight, borderRadius: 12, marginVertical: 4 }, selected: { borderColor: C.accent }, buttonText: { color: C.accent, fontWeight: '600' }, error: { color: C.danger, marginVertical: 8 } });
