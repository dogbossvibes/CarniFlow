import { groupMapFeatures } from '../mapMarkerGroups';
import a from './fixtures/field20261012/a.json';
import b from './fixtures/field20261012/b.json';
const ll = (p: { x: number; y: number }) => ({ lat: p.y / 111320, lng: p.x / 111320 });
it.each([['A', a], ['B', b]] as const)('%s exposes G5 plus the neighbouring angle, preserves every record', (_, fixture) => {
  const items = fixture.markers.map((m, i) => ({ id: i, ...ll(m), type: m.type, material: m.material }));
  const original = JSON.stringify(items);
  const groups = groupMapFeatures(items, 1.5);
  const g5 = items.filter(m => m.type === 'gegenstand' && m.material !== 'duebel')[4];
  const group = groups.find(members => members.includes(g5))!;
  expect(group).toHaveLength(2);
  expect(group.some(m => m.type === 'winkel')).toBe(true);
  expect(groups.flat().map(m => m.id).sort((x, y) => x - y)).toEqual(items.map(m => m.id));
  expect(JSON.stringify(items)).toBe(original);
});
it('keeps G7 and the end separately identifiable in one group', () => {
  const g7 = a.markers.at(-1)!; const end = a.points.at(-1)!;
  const features = [{ key: 'G7', ...ll(g7) }, { key: 'end', ...ll(end) }];
  expect(groupMapFeatures(features, 2)).toEqual([features]);
});
it('splits a close pair when zoom makes the two positions separately legible', () => {
  const features = [{ lat: 0, lng: 0 }, { lat: 0.08 / 111320, lng: 0 }];
  expect(groupMapFeatures(features, 1)).toHaveLength(1);
  expect(groupMapFeatures(features, 0.01)).toHaveLength(2);
});
it('preserves nearby return legs and duplicate marker identities instead of deleting them', () => {
  const features = [{ id: 'a', lat: 0, lng: 0 }, { id: 'b', lat: 0, lng: 0 }, { id: 'c', lat: 1, lng: 1 }];
  expect(groupMapFeatures(features, 2).map(group => group.map(m => m.id))).toEqual([['a', 'b'], ['c']]);
  expect(groupMapFeatures(features, NaN)).toHaveLength(3);
});
