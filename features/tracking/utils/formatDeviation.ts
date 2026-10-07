/** Geometric deviations are estimates from phone GNSS, so don't display decimetre precision. */
export function formatApproxDeviationM(valueM: number): string {
  if (valueM < 0.5) return '≈<1 m';
  return `≈${Math.round(valueM)} m`;
}
