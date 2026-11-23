import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { MAPS_AVAILABLE, RNMaps } from '@/components/tracking/TrackMap';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { HOME_ZONE_MAX, HOME_ZONE_RADII, type HomeZone } from './zones';
import { saveHomeZones, useHomeZones } from './store';
import { HOME_ZONE_NS } from './i18n';

type Center = { lat: number; lng: number };
const FALLBACK: Center = { lat: 46.8, lng: 8.23 }; // Mitte Schweiz, nur als Kartenausschnitt.
const delta = (radiusM: number) => (radiusM * 4) / 111_000;

export default function HomeZoneScreen() {
  const { t } = useTranslation(HOME_ZONE_NS);
  const zones = useHomeZones();
  const [center, setCenter] = useState<Center | null>(null);
  const [radiusM, setRadiusM] = useState<number>(300);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const map = useRef<{ animateToRegion(region: object, ms?: number): void } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const say = (text: string) => { setNotice(text); AccessibilityInfo.announceForAccessibility(text); };
  const focus = (next: Center, radius = radiusM) => map.current?.animateToRegion(
    { latitude: next.lat, longitude: next.lng, latitudeDelta: delta(radius), longitudeDelta: delta(radius) }, 300);

  const pickLocation = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { if (alive.current) say(t('locationDenied')); return; }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!alive.current) return;
      const next = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      setCenter(next); setNotice(null); focus(next);
    } catch { if (alive.current) say(t('locationFailed')); }
    finally { if (alive.current) setBusy(false); }
  };

  const save = async () => {
    if (!center || !zones || zones.length >= HOME_ZONE_MAX || busy) return;
    setBusy(true);
    try {
      await saveHomeZones([...zones, { id: Crypto.randomUUID(), lat: center.lat, lng: center.lng, radiusM }]);
      if (alive.current) { setCenter(null); say(t('saved')); }
    } catch { if (alive.current) say(t('saveFailed')); }
    finally { if (alive.current) setBusy(false); }
  };

  const remove = (zone: HomeZone) => Alert.alert(t('removeTitle'), t('removeBody'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('removeConfirm'), style: 'destructive', onPress: () => {
      if (zones) saveHomeZones(zones.filter(z => z.id !== zone.id)).catch(() => { if (alive.current) say(t('saveFailed')); });
    } },
  ]);

  const first = zones?.[0];
  const start = center ?? (first ? { lat: first.lat, lng: first.lng } : FALLBACK);
  const startDelta = center || first ? delta(first?.radiusM ?? radiusM) : 4;
  const MapView = RNMaps?.default, Circle = RNMaps?.Circle, Marker = RNMaps?.Marker;
  const full = (zones?.length ?? 0) >= HOME_ZONE_MAX;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        <ContactScreenHeader title={t('title')} />
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.body}>{t('intro')}</Text>
          <Text style={s.hint}>{t('deviceOnly')}</Text>
          {MAPS_AVAILABLE && MapView && Circle && Marker ? (
            <View style={s.map} accessible accessibilityLabel={t('mapLabel')}>
              <MapView ref={map as never} style={StyleSheet.absoluteFill} provider={RNMaps!.PROVIDER_DEFAULT} mapType="hybrid"
                initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: startDelta, longitudeDelta: startDelta }}
                onPress={event => { const c = event.nativeEvent.coordinate; setCenter({ lat: c.latitude, lng: c.longitude }); setNotice(null); }}
                showsUserLocation={false} toolbarEnabled={false} pitchEnabled={false} rotateEnabled={false}>
                {(zones ?? []).map(z => <Circle key={z.id} center={{ latitude: z.lat, longitude: z.lng }} radius={z.radiusM}
                  strokeColor="rgba(255,255,255,0.9)" fillColor="rgba(255,255,255,0.18)" strokeWidth={2} />)}
                {center ? <Circle center={{ latitude: center.lat, longitude: center.lng }} radius={radiusM}
                  strokeColor={C.trackPrimary} fillColor="rgba(0,255,204,0.22)" strokeWidth={2} /> : null}
                {center ? <Marker coordinate={{ latitude: center.lat, longitude: center.lng }} pinColor={C.trackPrimary} tracksViewChanges={false} /> : null}
              </MapView>
            </View>
          ) : null}
          <Text style={s.hint}>{t('mapHint')}</Text>
          <AnyvoButton label={t('useLocation')} icon="locate-outline" variant="secondary" loading={busy} onPress={() => { void pickLocation(); }} />

          <Text style={s.section} accessibilityRole="header">{t('radius')}</Text>
          <View style={s.chips} accessibilityRole="radiogroup">
            {HOME_ZONE_RADII.map(m => {
              const selected = radiusM === m;
              return <Pressable key={m} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={t('radiusOption', { m })}
                onPress={() => { setRadiusM(m); if (center) focus(center, m); }} style={[s.chip, selected && s.chipOn]}>
                <Text style={[s.chipText, selected && s.chipTextOn]}>{t('radiusOption', { m })}</Text>
              </Pressable>;
            })}
          </View>
          {notice ? <Text style={s.notice} accessibilityRole="alert" accessibilityLiveRegion="polite">{notice}</Text> : null}
          <AnyvoButton label={t('save')} disabled={!center || !zones || full} loading={busy} onPress={() => { void save(); }} />
          {full ? <Text style={s.hint}>{t('max', { n: HOME_ZONE_MAX })}</Text> : null}

          <Text style={s.section} accessibilityRole="header">{t('zones')}</Text>
          <View style={s.card}>
            {!zones?.length ? <Text style={[s.hint, s.empty]}>{t('none')}</Text> : zones.map((z, i) => (
              <View key={z.id} style={[s.row, i > 0 && s.rowLine]}>
                <Ionicons name="home-outline" size={20} color={C.trackPrimary} accessible={false} />
                <Pressable style={s.rowMain} accessibilityRole="button" accessibilityLabel={t('zone', { n: i + 1, m: z.radiusM })}
                  onPress={() => focus({ lat: z.lat, lng: z.lng }, z.radiusM)}>
                  <Text style={s.rowText}>{t('zone', { n: i + 1, m: z.radiusM })}</Text>
                </Pressable>
                <Pressable style={s.icon} accessibilityRole="button" accessibilityLabel={t('remove', { n: i + 1 })} onPress={() => remove(z)}>
                  <Ionicons name="trash-outline" size={20} color={C.trackDanger} accessible={false} />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg }, flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  body: { color: C.trackText, fontSize: 15, lineHeight: 22 },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 21 },
  map: { height: 280, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  section: { color: C.trackText, fontSize: 16, fontWeight: '700', marginTop: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  chipText: { color: C.trackText, fontSize: 15, fontWeight: '600' },
  chipTextOn: { color: '#04110F' },
  notice: { color: C.trackText, fontSize: 14, lineHeight: 21 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 14 },
  empty: { paddingVertical: 14 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.trackBorder },
  rowMain: { flex: 1, minHeight: 48, justifyContent: 'center' },
  rowText: { color: C.trackText, fontSize: 15 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
