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
