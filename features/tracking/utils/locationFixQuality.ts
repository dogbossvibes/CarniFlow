/** Measurement uncertainty only; never an admission or fusion decision. */
export interface LocationFixQuality {
  altitudeAccuracy?: number | null; // m
  speedAccuracy?: number | null; // m/s
  courseAccuracy?: number | null; // degrees, motion course; not compass heading
}

export function validUncertainty(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeFixQuality(value: LocationFixQuality): Required<LocationFixQuality> {
  return {
    altitudeAccuracy: validUncertainty(value.altitudeAccuracy),
    speedAccuracy: validUncertainty(value.speedAccuracy),
    courseAccuracy: validUncertainty(value.courseAccuracy),
  };
}
