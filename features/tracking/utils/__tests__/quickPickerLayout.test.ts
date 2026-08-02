import { readFileSync } from 'fs';
import {
  TRACK_LAYING_BOTTOM_CONTROLS_HEIGHT,
  TRACK_QUICK_PICKER_GAP,
  getTrackQuickPickerLayout,
} from '@/features/tracking/utils/quickPickerLayout';

const layingSource = () => readFileSync('app/track/legen.tsx', 'utf8');

describe('track quick picker layout', () => {
  it('reserves bottom controls, safe area and gap for GS and Winkel pickers', () => {
    const layout = getTrackQuickPickerLayout({
      windowHeight: 844,
      safeAreaTop: 47,
      safeAreaBottom: 34,
    });

    expect(layout.bottomOffset).toBe(
      TRACK_LAYING_BOTTOM_CONTROLS_HEIGHT + 34 + TRACK_QUICK_PICKER_GAP,
    );
    expect(layout.maxHeight).toBeGreaterThan(500);
  });

  it('uses the same reserved footer height on devices without home indicator', () => {
    const layout = getTrackQuickPickerLayout({
      windowHeight: 667,
      safeAreaTop: 20,
      safeAreaBottom: 0,
    });

    expect(layout.bottomOffset).toBe(
      TRACK_LAYING_BOTTOM_CONTROLS_HEIGHT + TRACK_QUICK_PICKER_GAP,
    );
    expect(layout.maxHeight).toBeGreaterThan(300);
  });

  it('keeps a usable scroll height on very small iPhones', () => {
    const layout = getTrackQuickPickerLayout({
      windowHeight: 568,
      safeAreaTop: 20,
      safeAreaBottom: 0,
    });

    expect(layout.maxHeight).toBeGreaterThanOrEqual(96);
  });

  it('uses one opaque panel style for GS and Winkel quick pickers', () => {
    const src = layingSource();

    expect(src).toContain('const QUICK_PICKER_PANEL_STYLE = {');
    expect(src).toContain('backgroundColor: FT.surface2');
    expect(src).toContain('borderColor:     FT.lineStrong');
    expect(src).toContain('zIndex:          20');
    expect(src).toContain('elevation:       8');
    expect(src.match(/QUICK_PICKER_PANEL_STYLE/g)).toHaveLength(3);
    expect(src).not.toContain('backgroundColor: FT.glass');
  });

  it('keeps GS scrollable and Winkel options unchanged inside the shared panel', () => {
    const src = layingSource();

    expect(src).toContain('{GEGENSTAND_MATERIALS.map');
    expect(src).toContain('<ScrollView');
    expect(src).toContain("{ kind: 'gw',     short: 'GW',     icon: 'square-outline'   }");
    expect(src).toContain("{ kind: 'ow',     short: 'OW',     icon: 'triangle-outline' }");
    expect(src).toContain("{ kind: 'bw',     short: 'BW',     icon: 'ellipse-outline'  }");
    expect(src).toContain("{ kind: 'abriss', short: 'Abriss', icon: 'close'            }");
    expect(src).toContain('onPress={() => placeGegenstand(m.material)}');
    expect(src).toContain('onPress={() => placeWinkel(o.kind)}');
  });
});
