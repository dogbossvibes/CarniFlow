import { calculateDistance } from './gpsFilter';

/** Display-only groups with bounded pairwise distance. Every feature occurs once; coordinates never move. */
export function groupMapFeatures<T extends { lat: number; lng: number }>(features: readonly T[], radiusM: number): T[][] {
  const groups: T[][] = [];
  const validRadius = Number.isFinite(radiusM) && radiusM > 0;
  for (const feature of features) {
    // Every member must fit: neighbouring points must not chain distant markers.
    const group = validRadius ? groups.find(members => members.every(member =>
      calculateDistance(member, feature) <= radiusM)) : undefined;
    if (group) group.push(feature);
    else groups.push([feature]);
  }
  return groups;
}

/** Show the identities inside a cluster, rather than an unexplained count.
 * Coordinates and the complete pressable detail list remain unchanged. */
export function mapFeatureGroupLabel(features: readonly { label: string }[]): string {
  if (features.length > 4) return features.length > 99 ? '99+' : String(features.length);
  return features.map(feature => feature.label).join(' · ');
}
