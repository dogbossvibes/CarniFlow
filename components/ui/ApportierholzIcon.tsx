import Svg, { Rect } from 'react-native-svg';

// Apportierholz (Hundesport-Hantel) als einfärbbares Icon.
// Zwei Endblöcke + Mittelstange. Nutzung wie ein Icon:
//   <ApportierholzIcon size={16} color={C.accent} />
export function ApportierholzIcon({
  size = 24,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* linker Block */}
      <Rect x="2.5" y="5.5" width="5" height="13" rx="1.6" fill={color} />
      {/* rechter Block */}
      <Rect x="16.5" y="5.5" width="5" height="13" rx="1.6" fill={color} />
      {/* Griffstange */}
      <Rect x="6.5" y="10" width="11" height="4" rx="2" fill={color} />
    </Svg>
  );
}
