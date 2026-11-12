/** Joker markers remain on the route but never count as scored articles. */
export const MARKER_MATERIALS = ['stoff', 'filz', 'holz', 'duebel', 'ball', 'gummi', 'leder', 'plastik', 'metall', 'teppich', 'diverses'] as const;
export function isDuebel(material?: string | null): boolean { return material === 'duebel'; }
export function isTrainingJoker(material?: string | null): boolean {
  return material === 'duebel' || material === 'ball';
}
export function isScoredObject(marker: { type?: string; marker_type?: string; material?: string | null }): boolean {
  return (marker.type ?? marker.marker_type) === 'gegenstand' && !isTrainingJoker(marker.material);
}
/** Marker indices are preserved; only scored objects receive G numbers. */
export function objectNumbers(markers: { type: string; material?: string | null }[]): Map<number, number> {
  const map = new Map<number, number>(); let n = 0;
  markers.forEach((m, i) => { if (isScoredObject(m)) map.set(i, ++n); });
  return map;
}
