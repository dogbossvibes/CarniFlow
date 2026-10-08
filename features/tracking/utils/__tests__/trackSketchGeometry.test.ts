import { projectTrackSketch } from '../trackSketchGeometry';


describe('recorded preview geometry', () => {
  it('never invents a route with absent or invalid GPS', () => {
    expect(projectTrackSketch([], 344, 200)).toBeNull();
    expect(projectTrackSketch([{ lat: NaN, lng: 8 }, { lat: 100, lng: 8 }], 344, 200)).toBeNull();
  });
  it('centres a single point and repeated identical positions, without claiming a route', () => {
    const g = projectTrackSketch([{ lat: 47, lng: 8 }, { lat: 47, lng: 8 }], 344, 200)!;
    expect(g.start).toEqual([172, 100]); expect(g.hasLine).toBe(false);
  });
  it('preserves north-up orientation and geographic aspect ratio', () => {
    const g = projectTrackSketch([{ lat: 60, lng: 8 }, { lat: 60.001, lng: 8.002 }], 344, 200)!;
    expect(g.end[0]).toBeGreaterThan(g.start[0]); expect(g.end[1]).toBeLessThan(g.start[1]);
    expect((g.end[0] - g.start[0]) / (g.start[1] - g.end[1])).toBeCloseTo(1, 3);
  });
  it('breaks at invalid fixes and explicit gaps instead of bridging missing evidence', () => {
    const g = projectTrackSketch([{ lat: 47, lng: 8 }, { lat: NaN, lng: 8 }, { lat: 47.1, lng: 8 }, { lat: 47.2, lng: 8, breakBefore: true }], 344, 200)!;
    expect(g.parts.map(p => p.length)).toEqual([1, 1, 1]); expect(g.hasLine).toBe(false);
  });
  it('handles the date line without stretching a short track around the world', () => {
    const g = projectTrackSketch([{ lat: 0, lng: 179.999 }, { lat: 0.001, lng: -179.999 }], 344, 200)!;
    expect((g.end[0] - g.start[0]) / (g.start[1] - g.end[1])).toBeCloseTo(2, 3);
  });
  it('renders only actual valid markers and supports large recordings without spread overflow', () => {
    const pts = Array.from({ length: 150000 }, (_, i) => ({ lat: 47 + i / 1e7, lng: 8 }));
    const g = projectTrackSketch(pts, 344, 200, [{ lat: NaN, lng: 8 }], [{ lat: 47, lng: 8 }])!;
    expect(g.count).toBe(150000); expect(g.angles).toEqual([]); expect(g.objects).toHaveLength(1);
    expect(g.parts[0].every(p => p.every(Number.isFinite))).toBe(true);
  });
});
