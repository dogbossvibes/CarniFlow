import Svg, { Path, Rect } from 'react-native-svg';

/** Silhouette eines Apportierholzes: breite, abgeflachte Holzbacken und Griff. */
export function ApportierholzIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Rect x="5" y="9" width="14" height="6" rx="1.5" fill={color} />
      <Path d="M3 3.5H5.5C6.6 5.4 7 8.5 7 12S6.6 18.6 5.5 20.5H3C1.6 18.6 1 15.5 1 12S1.6 5.4 3 3.5ZM18.5 3.5H21C22.4 5.4 23 8.5 23 12S22.4 18.6 21 20.5H18.5C17.4 18.6 17 15.5 17 12S17.4 5.4 18.5 3.5Z" fill={color} />
    </Svg>
  );
}
