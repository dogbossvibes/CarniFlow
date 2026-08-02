export const TRACK_LAYING_BOTTOM_CONTROLS_HEIGHT = 100;
export const TRACK_QUICK_PICKER_GAP = 12;
export const TRACK_QUICK_PICKER_TOP_MARGIN = 96;
export const TRACK_QUICK_PICKER_MIN_HEIGHT = 96;

export function getTrackQuickPickerLayout({
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
  bottomControlsHeight = TRACK_LAYING_BOTTOM_CONTROLS_HEIGHT,
  gap = TRACK_QUICK_PICKER_GAP,
}: {
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  bottomControlsHeight?: number;
  gap?: number;
}) {
  const bottomOffset = bottomControlsHeight + safeAreaBottom + gap;
  const availableHeight = windowHeight - safeAreaTop - bottomOffset - TRACK_QUICK_PICKER_TOP_MARGIN;

  return {
    bottomOffset,
    maxHeight: Math.max(TRACK_QUICK_PICKER_MIN_HEIGHT, availableHeight),
  };
}
