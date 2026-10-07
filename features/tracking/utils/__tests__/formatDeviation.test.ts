import { formatApproxDeviationM } from '@/features/tracking/utils/formatDeviation';

describe('formatApproxDeviationM', () => {
  it('shows whole metres with an explicit approximation marker', () => {
    expect(formatApproxDeviationM(1.8)).toBe('≈2 m');
    expect(formatApproxDeviationM(0.1)).toBe('≈<1 m');
  });
});
