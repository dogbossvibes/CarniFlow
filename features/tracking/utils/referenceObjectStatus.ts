export type ReferenceObjectStatus = 'pending' | 'manual_found' | 'auto_dwell_found' | 'missed' | 'user_removed';

export function objectPassMarginM(accuracyM: number | null): number {
  return Math.min(4, Math.max(2, 0.5 * (accuracyM ?? 4)));
}

export function statusAfterProgress(input: {
  status: ReferenceObjectStatus;
  referenceArcM: number | null;
  handlerProgressM: number;
  accuracyM: number | null;
  isFinalObject: boolean;
}): ReferenceObjectStatus {
  if (input.status !== 'pending' || input.isFinalObject || input.referenceArcM == null) return input.status;
  return input.handlerProgressM > input.referenceArcM + objectPassMarginM(input.accuracyM) ? 'missed' : 'pending';
}

export function statusAtConfirmedEnd(status: ReferenceObjectStatus): ReferenceObjectStatus {
  return status === 'pending' ? 'missed' : status;
}
