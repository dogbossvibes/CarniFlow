import { useMemo } from 'react';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { C } from '@/constants/colors';
import { projectTrackSketch, type SketchPoint } from '@/features/tracking/utils/trackSketchGeometry';

interface Props {
  // Legacy count/progress props are deliberately ignored: counts cannot describe geometry.
  legs?: number | null; objects?: number | null; progress?: number;
  points?: readonly SketchPoint[];
  angleMarkers?: readonly SketchPoint[]; objectMarkers?: readonly SketchPoint[];
  size?: number; w?: number; h?: number; accent?: string; showLabels?: boolean;
}
export function TrackSketch({ points, angleMarkers, objectMarkers, size, w, h, accent = C.trackPrimary, showLabels = false }: Props) {
  const width = w ?? size ?? 100, height = h ?? size ?? 100;
  const real = useMemo(() => projectTrackSketch(points ?? [], width, height, angleMarkers, objectMarkers),
    [points, width, height, angleMarkers, objectMarkers]);
  const small = Math.min(width, height) < 100;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" testID="track-sketch">
      {real ? <>
        {real.parts.filter(part => part.length > 1).map((part, i) => (
          <Polyline key={i} testID="recorded-track-line" points={part.map(p => p.join(',')).join(' ')} fill="none"
            stroke={accent} strokeWidth={small ? 2.5 : 3.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {real.parts.filter(part => part.length === 1).map((part, i) => <Circle key={`p${i}`} cx={part[0][0]} cy={part[0][1]} r={3} fill={accent} />)}
        {real.angles.map(([x, y], i) => <G key={`a${i}`}>
          <Circle cx={x} cy={y} r={small ? 4 : 8} fill={C.trackSurface} stroke={accent} strokeWidth={1.5} />
          {showLabels && !small && <SvgText x={x} y={y + 3} fontSize={9} fill={accent} textAnchor="middle">{i + 1}</SvgText>}
        </G>)}
        {real.objects.map(([x, y], i) => <Rect key={`o${i}`} x={x - 4} y={y - 4} width={8} height={8} rx={1.5} fill={C.trackSurface} stroke={C.trackText} strokeWidth={1.8} />)}
        <Circle cx={real.start[0]} cy={real.start[1]} r={small ? 3.5 : 5} fill={accent} stroke={C.trackSurface} strokeWidth={1.5} />
        {real.hasLine && <Circle cx={real.end[0]} cy={real.end[1]} r={small ? 3 : 4.5} fill={C.trackSurface} stroke={accent} strokeWidth={1.8} />}
      </> : <>
        <Rect x={width * 0.2} y={height * 0.2} width={width * 0.6} height={height * 0.6} rx={8} fill="none" stroke={C.trackTextMut} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 4" />
        <SvgText x={width / 2} y={height / 2 + 4} fontSize={small ? 10 : 14} fill={C.trackTextMut} textAnchor="middle">GPS —</SvgText>
      </>}
    </Svg>
  );
}
