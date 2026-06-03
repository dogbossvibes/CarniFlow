import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { C } from '@/constants/colors';
import type { TrackPoint, TrackArticle } from '@/types/tracking';

interface Props {
  points:    { lat: number; lng: number }[];
  articles?: Pick<TrackArticle, 'lat' | 'lng' | 'typ' | 'gefunden'>[];
  width:     number;
  height:    number;
  padding?:  number;
  bgColor?:  string;
}

interface Normalized {
  pathD:  string;
  startX: number;
  startY: number;
  endX:   number;
  endY:   number;
  toXY:   (lat: number, lng: number) => { x: number; y: number };
}

function normalize(
  points:  { lat: number; lng: number }[],
  w: number, h: number, pad: number,
): Normalized {
  const cx = w / 2;
  const cy = h / 2;
  const identity = { pathD: '', startX: cx, startY: cy, endX: cx, endY: cy, toXY: () => ({ x: cx, y: cy }) };
  if (points.length === 0) return identity;

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latR = maxLat - minLat;
  const lngR = maxLng - minLng;

  const drawW = w - pad * 2;
  const drawH = h - pad * 2;

  const scale = Math.min(
    latR > 0 ? drawH / latR : 1e9,
    lngR > 0 ? drawW / lngR : 1e9,
  );

  const scaledW = lngR * scale;
  const scaledH = latR * scale;
  const ox = pad + (drawW - scaledW) / 2;
  const oy = pad + (drawH - scaledH) / 2;

  const toXY = (lat: number, lng: number) => ({
    x: ox + (lng - minLng) * scale,
    y: oy + (maxLat - lat)  * scale,
  });

  if (points.length === 1) {
    const { x, y } = toXY(points[0].lat, points[0].lng);
    return { pathD: '', startX: x, startY: y, endX: x, endY: y, toXY };
  }

  const coords = points.map(p => toXY(p.lat, p.lng));
  const pathD  = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  return {
    pathD,
    startX: coords[0].x,
    startY: coords[0].y,
    endX:   coords[coords.length - 1].x,
    endY:   coords[coords.length - 1].y,
    toXY,
  };
}

export function TrackPath({ points, articles = [], width, height, padding = 24, bgColor }: Props) {
  const n = useMemo(
    () => normalize(points, width, height, padding),
    [points, width, height, padding],
  );

  const hasPath = points.length >= 2;

  return (
    <View style={[styles.container, { width, height }, bgColor ? { backgroundColor: bgColor } : null]}>
      <Svg width={width} height={height}>
        {hasPath && (
          <Path
            d={n.pathD}
            stroke={C.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.9}
          />
        )}

        {/* Articles */}
        {articles.map((a, i) => {
          if (a.lat == null || a.lng == null) return null;
          const pos = n.toXY(a.lat, a.lng);
          const color = a.typ === 'verleitung' ? C.danger : (a.gefunden ? C.success : C.warning);
          return (
            <G key={i} transform={`translate(${pos.x},${pos.y})`}>
              <Circle r={7} fill={`${color}25`} stroke={color} strokeWidth={1.5} />
              <Circle r={3} fill={color} />
            </G>
          );
        })}

        {/* Start dot */}
        {points.length > 0 && (
          <G transform={`translate(${n.startX},${n.startY})`}>
            <Circle r={8} fill={`${C.success}20`} stroke={C.success} strokeWidth={2} />
            <Circle r={3} fill={C.success} />
          </G>
        )}

        {/* End / current position dot */}
        {hasPath && (
          <G transform={`translate(${n.endX},${n.endY})`}>
            <Circle r={10} fill={`${C.accent}15`} stroke={C.accent} strokeWidth={2} />
            <Circle r={4}  fill={C.accent} />
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A0A10',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
