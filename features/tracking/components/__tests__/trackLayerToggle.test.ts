import { trackLayerVisibility } from '@/features/tracking/components/TrackLayerToggle';

describe('trackLayerVisibility', () => {
  it('clean → nur Hauptlinie', () => {
    expect(trackLayerVisibility('clean')).toEqual({ showClean: true, showRaw: false });
  });
  it('raw → nur Rohspur', () => {
    expect(trackLayerVisibility('raw')).toEqual({ showClean: false, showRaw: true });
  });
  it('both → beide Linien', () => {
    expect(trackLayerVisibility('both')).toEqual({ showClean: true, showRaw: true });
  });
});
