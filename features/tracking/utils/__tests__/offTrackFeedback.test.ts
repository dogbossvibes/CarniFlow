import { offTrackTransitionFeedback, offTrackBanner } from '@/features/tracking/utils/offTrackFeedback';

describe('offTrackTransitionFeedback — Feedback nur auf echten Übergängen', () => {
  it('on_track → warning: leichte Haptik + Warn-Ansage', () => {
    expect(offTrackTransitionFeedback('on_track', 'warning')).toEqual({ voiceKey: 'track.offTrackWarning', haptic: 'light' });
  });
  it('warning → off_track: starke Haptik + Off-Track-Ansage', () => {
    expect(offTrackTransitionFeedback('warning', 'off_track')).toEqual({ voiceKey: 'track.offTrack', haptic: 'strong' });
  });
  it('on_track → off_track (direkt): Off-Track-Feedback', () => {
    expect(offTrackTransitionFeedback('on_track', 'off_track')).toEqual({ voiceKey: 'track.offTrack', haptic: 'strong' });
  });
  it('off_track → on_track: Recovery genau einmal', () => {
    expect(offTrackTransitionFeedback('off_track', 'on_track')).toEqual({ voiceKey: 'track.backOnTrack', haptic: 'success' });
  });
  it('warning → on_track: ebenfalls Recovery', () => {
    expect(offTrackTransitionFeedback('warning', 'on_track')).toEqual({ voiceKey: 'track.backOnTrack', haptic: 'success' });
  });

  it('gleicher State → KEIN Feedback (kein Spam)', () => {
    expect(offTrackTransitionFeedback('warning', 'warning')).toBeNull();
    expect(offTrackTransitionFeedback('off_track', 'off_track')).toBeNull();
    expect(offTrackTransitionFeedback('on_track', 'on_track')).toBeNull();
  });
});

describe('offTrackBanner — Banner leitet sich vom aktuellen State ab', () => {
  it('on_track → kein Banner', () => { expect(offTrackBanner('on_track')).toBeNull(); });
  it('warning → warning-Banner', () => { expect(offTrackBanner('warning')).toBe('warning'); });
  it('off_track → off_track-Banner', () => { expect(offTrackBanner('off_track')).toBe('off_track'); });
});
