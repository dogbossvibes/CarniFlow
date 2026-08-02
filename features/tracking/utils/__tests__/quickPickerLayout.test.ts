import {
  TRACK_LAYING_BOTTOM_CONTROLS_HEIGHT,
  TRACK_QUICK_PICKER_GAP,
  getTrackQuickPickerLayout,
} from '@/features/tracking/utils/quickPickerLayout';

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
});
