import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import type MapView from 'react-native-maps';
import { MAPS_AVAILABLE, RNMaps } from '@/components/tracking/TrackMap';
import { C } from '@/constants/colors';
import { PLAN_LIMITS, type PlanAction, type PlanEdit } from './model';
import './i18n';
export function PlannerMap({ edit, dispatch, disabled }: { edit: PlanEdit; dispatch(action: PlanAction): void; disabled: boolean }) {
 const { t } = useTranslation('trackPlanner');
 const map = useRef<MapView>(null), alive = useRef(true), locationBusy = useRef(false);
 const [ready, setReady] = useState(false), [issue, setIssue] = useState(false);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 const initial = useRef(edit.points[0]);
 const fit = () => {
  if (!edit.points.length) return;
  map.current?.fitToCoordinates(edit.points, { edgePadding: { top: 55, bottom: 55, left: 55, right: 55 }, animated: true });
 };
 const initialFit = useRef(false);
 useEffect(() => {
  if (ready && !initialFit.current && edit.points.length) { initialFit.current = true; fit(); }
 // Only the saved template's initial bounds; edits must not steal the camera.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ready]);
 const locate = async () => {
  if (locationBusy.current || disabled) return; locationBusy.current = true; setIssue(false);
  try {
   const permission = await Location.requestForegroundPermissionsAsync();
   if (!alive.current) return;
   if (permission.status !== 'granted') { setIssue(true); return; }
   const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
   if (alive.current) map.current?.animateToRegion({ ...fix.coords, latitudeDelta: .003, longitudeDelta: .003 }, 350);
  } catch { if (alive.current) setIssue(true); }
  finally { locationBusy.current = false; }
 };
 if (!MAPS_AVAILABLE || !RNMaps) return <Text style={s.text}>{t('maps')}</Text>;
 const Map = RNMaps.default, { Marker, Polyline } = RNMaps;
 return <View style={s.wrap}>
  <Map showsScale={false} ref={map} style={s.map} mapType="hybrid" showsUserLocation={false} showsMyLocationButton={false}
   onMapReady={() => setReady(true)} initialRegion={{ latitude: initial.current?.latitude ?? 47.3769, longitude: initial.current?.longitude ?? 8.5417, latitudeDelta: .004, longitudeDelta: .004 }}
   onPress={event => { if (!disabled && event.nativeEvent.action !== 'marker-press') dispatch({ type: 'add', point: { ...event.nativeEvent.coordinate, object: false } }); }}>
   {edit.points.length > 1 && <Polyline coordinates={edit.points} strokeColor={C.accent} strokeWidth={4} lineDashPattern={[8, 6]} />}
   {edit.points.map((point, index) => <Marker key={index} coordinate={point} draggable={!disabled}
    pinColor={point.object ? C.warning : index === edit.selected ? C.accent : '#FFFFFF'}
    title={`${t('point')} ${index + 1}${point.object ? ` · ${t('objectPlanned')}` : ''}`}
    onPress={event => { event.stopPropagation(); if (!disabled) dispatch({ type: 'select', index }); }}
    onDragEnd={event => { if (!disabled) dispatch({ type: 'move', index, point: { ...event.nativeEvent.coordinate, object: point.object } }); }} />)}
  </Map>
  <View style={s.controls}>
   <Pressable accessibilityRole="button" style={s.button} onPress={fit}><Text style={s.text}>{t('fit')}</Text></Pressable>
   <Pressable accessibilityRole="button" style={s.button} disabled={disabled} onPress={() => { void locate(); }}><Text style={s.text}>{t('location')}</Text></Pressable>
  </View>
  {issue && <Text accessibilityRole="alert" style={s.text}>{t('permission')}</Text>}
  {edit.points.length >= PLAN_LIMITS.points && <Text style={s.text}>{t('limit')}</Text>}
 </View>;
}
const s = StyleSheet.create({ wrap: { gap: 8 }, map: { height: 340, borderRadius: 18 }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: C.cardAlt, justifyContent: 'center' }, text: { color: C.white } });
