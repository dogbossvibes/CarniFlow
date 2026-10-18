// Shared bounds for help and tour overlays, including large text/landscape.
export function helpLayout(height: number, width: number, fontScale: number, top: number, bottom: number) {
  const availableHeight = Math.max(0, height - top - bottom - 24);
  return {
    cardMaxHeight: Math.min(height * 0.8, availableHeight),
    stackedActions: width < 360 || fontScale > 1.3,
    scrollWholeCard: availableHeight < 240 * fontScale,
  };
}
