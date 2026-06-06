import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import {
  BLE_AVAILABLE,
  connectDevice,
  disconnectDevice,
  startScan,
  useExternalGps,
} from '@/lib/externalGps';

type Source = 'iphone' | 'extern';

export function GpsSourcePicker() {
  const ble = useExternalGps();
  const [source, setSource] = useState<Source>('iphone');

  const waehleIphone = () => {
    setSource('iphone');
    if (ble.connectedId) disconnectDevice();
  };
  const waehleExtern = () => {
    setSource('extern');
    if (BLE_AVAILABLE && !ble.connectedId && !ble.scanning) startScan();
  };

  return (
    <View>
      <Text style={s.label}>GPS-QUELLE</Text>
      <View style={s.row}>
        <Chip aktiv={source === 'iphone'} onPress={waehleIphone} icon="phone-portrait-outline" label="iPhone GPS" />
        <Chip aktiv={source === 'extern'} onPress={waehleExtern} icon="bluetooth-outline" label="Externes GPS" />
      </View>

      {source === 'extern' && (
        <View style={s.panel}>
          {!BLE_AVAILABLE ? (
            <Text style={s.hint}>Externes GPS benötigt einen neuen App-Build. (MFi-Empfänger funktionieren ohne — einfach in den iOS-Einstellungen koppeln.)</Text>
          ) : (
            <>
              {ble.status === 'connected' ? (
                <View style={[s.device, s.deviceOn]}>
                  <Ionicons name="checkmark-circle" size={16} color={C.success} />
                  <Text style={s.deviceName}>Verbunden</Text>
                  <TouchableOpacity onPress={disconnectDevice} hitSlop={8}>
                    <Text style={s.trennen}>Trennen</Text>
                  </TouchableOpacity>
                </View>
              ) : ble.scanning ? (
                <View style={s.scanRow}>
                  <ActivityIndicator color={C.accent} size="small" />
                  <Text style={s.hint}>Suche nach GPS-Geräten…</Text>
                </View>
              ) : (
                <TouchableOpacity style={s.scanBtn} onPress={startScan} activeOpacity={0.8}>
                  <Ionicons name="search" size={15} color={C.accent} />
                  <Text style={s.scanBtnTxt}>Erneut suchen</Text>
                </TouchableOpacity>
              )}

              {ble.devices.map(d => (
                <TouchableOpacity
                  key={d.id}
                  style={[s.device, ble.connectedId === d.id && s.deviceOn]}
                  onPress={() => connectDevice(d.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="hardware-chip-outline" size={16} color={C.muted} />
                  <Text style={s.deviceName} numberOfLines={1}>{d.name}</Text>
                  <Text style={s.deviceStatus}>
                    {ble.connectedId === d.id ? 'Verbunden' : ble.status === 'connecting' ? '…' : 'Verbinden'}
                  </Text>
                </TouchableOpacity>
              ))}

              {ble.error ? <Text style={s.error}>{ble.error}</Text> : null}
              {!ble.scanning && ble.devices.length === 0 && !ble.error ? (
                <Text style={s.hint}>Kein Gerät gefunden. Schalte den Empfänger ein und such erneut.</Text>
              ) : null}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function Chip({ aktiv, onPress, icon, label }: {
  aktiv: boolean; onPress: () => void; icon: React.ComponentProps<typeof Ionicons>['name']; label: string;
}) {
  return (
    <TouchableOpacity style={[s.chip, aktiv && s.chipOn]} onPress={onPress} activeOpacity={0.8}>
      {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
      <Ionicons name={icon} size={15} color={aktiv ? C.accentText : C.muted} />
      <Text style={[s.chipTxt, aktiv && s.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 18 },
  row:   { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 46, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, overflow: 'hidden',
  },
  chipOn:  { borderColor: C.accent },
  chipTxt: { fontSize: 14, color: C.muted, fontWeight: '600' },
  chipTxtOn: { color: C.accentText, fontWeight: '700' },

  panel: { marginTop: 12, gap: 8 },
  hint:  { fontSize: 13, color: C.subtle, lineHeight: 19 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: `${C.accent}40`, backgroundColor: C.card },
  scanBtnTxt: { fontSize: 14, color: C.accent, fontWeight: '700' },

  device: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  deviceOn:     { borderColor: `${C.success}55`, backgroundColor: `${C.success}10` },
  deviceName:   { flex: 1, fontSize: 14, color: C.white, fontWeight: '600' },
  deviceStatus: { fontSize: 12, color: C.accent, fontWeight: '700' },
  trennen:      { fontSize: 12, color: C.danger, fontWeight: '700' },
  error:        { fontSize: 12, color: C.danger },
});
