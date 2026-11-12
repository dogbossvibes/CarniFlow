import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import createQrCode from 'qrcode-generator';

/** QR-Matrix als ein einziger SVG-Pfad. Schwarz auf Weiss mit Ruhezone, damit jede Kamera ihn liest. */
export function qrPath(value: string): { path: string; size: number } {
  const qr = createQrCode(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row++) {
    let start = -1;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) { path += `M${start} ${row}h${col - start}v1h-${col - start}z`; start = -1; }
    }
  }
  return { path, size: count };
}

const QUIET_ZONE = 4;

export function ContactQrCode({ value, size, accessibilityLabel }: { value: string; size: number; accessibilityLabel: string }) {
  const qr = useMemo(() => qrPath(value), [value]);
  const box = qr.size + QUIET_ZONE * 2;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}>
        <Rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={box} height={box} fill="#ffffff" />
        <Path d={qr.path} fill="#000000" />
      </Svg>
    </View>
  );
}
