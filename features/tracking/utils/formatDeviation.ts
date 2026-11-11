/** Geometric deviations are estimates from phone GNSS, so don't display decimetre precision. */
export function formatApproxDeviationM(valueM: number): string {
  if (valueM < 0.5) return '≈<1 m';
  return `≈${Math.round(valueM)} m`;
}

/** Messunsicherheit einer Abweichung, auf ganze Meter und nie kleiner als 1 m (Handy-GPS). */
export function formatDeviationUncertaintyM(uncertaintyM: number): string {
  return `±${Math.max(1, Math.round(uncertaintyM))} m`;
}
