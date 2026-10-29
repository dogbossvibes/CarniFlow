import { calculateDistance } from './gpsFilter';

/** Display-only connected components. Every feature occurs once; coordinates never move. */
export function groupMapFeatures<T extends { lat: number; lng: number }>(features: readonly T[], radiusM: number): T[][] {
  const parent = features.map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  if (Number.isFinite(radiusM) && radiusM > 0) {
    for (let i = 0; i < features.length; i++) for (let j = i + 1; j < features.length; j++) {
      if (calculateDistance(features[i], features[j]) <= radiusM) parent[root(j)] = root(i);
    }
  }
  const groups = new Map<number, T[]>();
  features.forEach((feature, i) => {
    const key = root(i); const group = groups.get(key) ?? [];
    group.push(feature); groups.set(key, group);
  });
  return [...groups.values()];
}

/** Show the identities inside a cluster, rather than an unexplained count.
 * Coordinates and the complete pressable detail list remain unchanged. */
export function mapFeatureGroupLabel(features: readonly { label: string }[]): string {
  if (features.length > 4) return features.length > 99 ? '99+' : String(features.length);
  return features.map(feature => feature.label).join(' · ');
}
