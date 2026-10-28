import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAPS_AVAILABLE, RNMaps } from '@/components/tracking/TrackMap';
import { C } from '@/constants/colors';

export const SWISSIMAGE_TEST_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg';
/** Deliberately separate from all recording maps; no location request or track data. */
export function SwissMapTest() {
  const [open, setOpen] = useState(false);
  const [imagery, setImagery] = useState(true);
  let supported = false;
  try { supported = MAPS_AVAILABLE && !!RNMaps?.UrlTile && !!UIManager.getViewManagerConfig('AIRMapUrlTile'); } catch { /* Older binary: retain normal maps. */ }
  const Map = RNMaps?.default, Tile = RNMaps?.UrlTile;
  return <View style={s.card}>
    <Text style={s.title}>Schweizer Luftbilder · Test</Text>
    <Text style={s.text}>Separate Vorschau bei Zürich. Keine Fährten oder Standortdaten werden übernommen. Kartenabrufe gehen an swisstopo und den vorhandenen Kartenanbieter.</Text>
    {supported ? <Pressable accessibilityRole="button" accessibilityLabel="Luftbilder testen" style={s.button} onPress={() => { setImagery(true); setOpen(true); }}><Text style={s.action}>Luftbilder testen</Text></Pressable>
      : <Text style={s.text}>Diese Testansicht wird vom installierten Kartenmodul nicht unterstützt.</Text>}
    <Modal visible={open} presentationStyle="fullScreen" animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={s.screen}>
        <Pressable accessibilityRole="button" accessibilityLabel="Luftbild-Test schließen" style={s.button} onPress={() => setOpen(false)}><Text style={s.action}>Schließen</Text></Pressable>
        <Text style={s.title}>swisstopo · Testansicht</Text>
        <Text style={s.text}>Luftbilder verbessern die Orientierung, nicht die GPS-Messung. Nur Schweizer Abdeckung; bei fehlenden Bildern zur Standardkarte wechseln.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={imagery ? 'Standardkarte anzeigen' : 'Schweizer Luftbilder anzeigen'} style={s.button} onPress={() => setImagery(v => !v)}><Text style={s.action}>{imagery ? 'Standardkarte anzeigen' : 'Schweizer Luftbilder anzeigen'}</Text></Pressable>
        <View style={s.map}>
          {open && supported && Map && Tile ? <Map style={StyleSheet.absoluteFill} mapType="standard" showsScale={false} showsUserLocation={false}
            initialRegion={{ latitude: 47.3769, longitude: 8.5417, latitudeDelta: 0.025, longitudeDelta: 0.025 }}>
            {imagery ? <Tile urlTemplate={SWISSIMAGE_TEST_URL} maximumZ={18} maximumNativeZ={18} minimumZ={8} tileSize={256} flipY={false} shouldReplaceMapContent={false} /> : null}
          </Map> : null}
        </View>
        <Text style={s.text}>© swisstopo · SWISSIMAGE · Bildstand regional unterschiedlich</Text>
      </SafeAreaView>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: C.card, padding: 16, borderRadius: 16, marginBottom: 16 },
  title: { color: C.trackText, fontWeight: '700', marginBottom: 8 },
  text: { color: C.trackTextSec, marginBottom: 10 },
  button: { minHeight: 48, justifyContent: 'center', padding: 10 }, action: { color: C.trackPrimary, fontWeight: '700' },
  screen: { flex: 1, backgroundColor: C.card, paddingHorizontal: 16 }, map: { flex: 1, minHeight: 120, marginBottom: 10 },
});
